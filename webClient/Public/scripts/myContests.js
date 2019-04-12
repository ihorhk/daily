var socket = io();

const TYPE_LIVE = 'live';
const TYPE_UPCOMING = 'upcoming';
const TYPE_HISTORY = 'history';

const GROUP_BY_NONE = 'none';
const GROUP_BY_CONTEST = 'contest';
const GROUP_BY_ENTRY_FEE = 'entryFee';
const GROUP_BY_LINE_UP = 'lineup';

const COOKIE_TAB = 'myContests_tab';
const COOKIE_GROUP_BY = 'myContests_group';

var loggedInUsername;

var currentTournamentsType;
var currentTournamentsGroupBy = GROUP_BY_NONE;
var liveTournaments = [];
var upcomingTournaments = [];
var historyTournaments = [];
var tournamentsPlayers = []; // maps the ids of all players with the corresponding player
var tournamentsTimers = [];


$ (function () {
    // get tournament id and optional entry id from query
    var arr = location.search.split('&');

    for (var i = 0; i < arr.length; i++) {
        var q = arr[i];

        if (q.indexOf('contest') >= 0) {
            var tournamentId = q.substring(q.indexOf('=') + 1);
        }
    }

    if (tournamentId) {
        currentTournamentsGroupBy = GROUP_BY_CONTEST;
    }
    else {
        currentTournamentsGroupBy = Cookies.get(COOKIE_GROUP_BY) || GROUP_BY_NONE;
    }

    switch (window.location.hash) {
        case '#live':
            currentTournamentsType = TYPE_LIVE;
            break;

        case '#upcoming':
            currentTournamentsType = TYPE_UPCOMING;
            break;

        case '#history':
            currentTournamentsType = TYPE_HISTORY;
            break;
    }
    if (!currentTournamentsType) {
        currentTournamentsType = Cookies.get(COOKIE_TAB) || TYPE_LIVE;
    }

    $.ajax(
        {
            type : 'GET',
            url : '/api/getMyTournaments',
            dataType : 'JSON',
            statusCode : {
                200 : function (res) {
                    loggedInUsername = res.username;
                    parseTournamentsPlayers(res.userPlayers);
                    tournamentsResponseReceived(res.tournaments);
                    updateTabsTitles();
                },
                401 : function () {
                    goToLogin();
                },
                501 : function (err) {
                    createErrorDialog('Get contests failed', err.responseText);
                }
            }
        }
    );

    initUI();
    initTimers();
});


function initUI () {
    $('.contestTab').on('click', function () {
        if ($(this).hasClass('selected')) {
            return;
        }

        $('.contestTab').removeClass('selected');
        $(this).addClass('selected');

        var id = $(this).prop('id');

        if (id === 'contestTabLive') {
            currentTournamentsType = TYPE_LIVE;
            var contestType = 'live';
            window.location = '/myContests#live'
        }
        else if (id === 'contestTabUpcoming') {
            currentTournamentsType = TYPE_UPCOMING;
            contestType = 'upcoming';
            window.location = '/myContests#upcoming'
        }
        else if (id === 'contestTabHistory') {
            currentTournamentsType = TYPE_HISTORY;
            contestType = 'history';
            window.location = '/myContests#history';
        }

        Cookies.set(COOKIE_TAB, currentTournamentsType);

        $('#tournamentsTable').attr('data-contest-type', contestType);

        fillInTournamentsTable();
    });

    $('.groupByTab').on('click', function () {
        var groupBy = '';
        if ($(this).hasClass('selected')) {
            $(this).removeClass('selected');
            currentTournamentsGroupBy = GROUP_BY_NONE;
        }
        else {
            $('.groupByTab').removeClass('selected');
            $(this).addClass('selected');

            switch ($(this).prop('id')) {
                case 'groupByTabContest':
                    currentTournamentsGroupBy = GROUP_BY_CONTEST;
                    groupBy = 'group-contest';
                    break;
                case 'groupByTabEntryFee':
                    currentTournamentsGroupBy = GROUP_BY_ENTRY_FEE;
                    groupBy = 'group-entryFee';
                    break;
                case 'groupByTabLineUp':
                    currentTournamentsGroupBy = GROUP_BY_LINE_UP;
                    groupBy = 'group-lineup';
                    break;
                default:
                    break;
            }
        }

        Cookies.set(COOKIE_GROUP_BY, currentTournamentsGroupBy);

        $('#tournamentsTable').attr('data-group-by', groupBy);
        
        fillInTournamentsTable();
    });

    $('#tournamentsTable').on('click', '.groupByHeader', function () {
        $(this).hasClass('expanded') ? $(this).removeClass('expanded') : $(this).addClass('expanded');
        $(this).nextUntil('tr.groupByHeader').slideToggle(100, function () {});
    });

    $(document).on('mouseenter', '.tournamentProgress', function () {
        var progressBar = $(this).find('.progressBar');
        var percentage = progressBar.data('percentage');
        var tooltipText = $(this).find('.progressTooltipText');
        tooltipText.text(percentage + '%');
    });

    switch (currentTournamentsType) {
        case TYPE_LIVE:
           $('#contestTabLive').click();
            break;
        case TYPE_UPCOMING:
           $('#contestTabUpcoming').click();
            break;
        case TYPE_HISTORY:
            $('#contestTabHistory').click();
            break;
        default:
            break;
    }

    switch (currentTournamentsGroupBy) {
        case GROUP_BY_CONTEST:
            $('#groupByTabContest').click();
            break;
        case GROUP_BY_ENTRY_FEE:
            $('#groupByTabEntryFee').click();
            break;
        case GROUP_BY_LINE_UP:
            $('#groupByTabLineUp').click();
            break;
    }

    socket.on('tournamentStarted', function (tournamentId) {
        onTournamentStarted(tournamentId);
    });

    socket.on('tournamentFinished', function (tournamentId) {
        onTournamentFinished(tournamentId);
    });

    socket.on('tournamentEntryAdded', function (res) {
        onTournamentEntryAdded(res.tournamentId, res.entry);
    });

    socket.on('tournamentEntryRemoved', function (res) {
        onTournamentEntryRemoved(res.tournamentId, res.entryId, res.username);
    });
}


function initTimers() {
    setInterval(function () {

        for (var i = 0; i < tournamentsTimers.length; i++) {
            tournamentsTimers[i].update();
        }

    }, 1000);
}


function fillInTournamentsTable () {

    switch (currentTournamentsType) {
        case TYPE_LIVE:
            var rawTournaments = liveTournaments;
            break;

        case TYPE_UPCOMING:
            rawTournaments = upcomingTournaments;
            break;

        case TYPE_HISTORY:
            rawTournaments = historyTournaments;
            break;

        default:
            break;
    }

    var summary = calculateContestsSummary(rawTournaments);

    $('#contestSummaryCount').text(summary.count);
    $('#contestSummaryMoneyText').text((currentTournamentsType === TYPE_UPCOMING) ? 'Total Spent:' : 'Total Winnings:');
    $('#contestSummaryMoneyValue').text(formatMoney(summary.balance));

    var table = $('#tournamentsTable');
    table.empty();

    populateTableHeaders(table);

    if (currentTournamentsGroupBy === GROUP_BY_NONE) {
        var tournaments = rawTournaments;
    }
    else {
        tournaments = groupByTournaments(rawTournaments);
    }

    // create tournament rows
    var tableBody = document.createElement('tbody');
    tableBody.setAttribute('id', 'tournamentsBody');
    table[0].appendChild(tableBody);

    tournamentsTimers.length = 0;
    if (currentTournamentsGroupBy === GROUP_BY_NONE) {
        if (tournaments && tournaments.length > 0) {
            populateTournamentsTableRows(tournaments, tableBody);
        }
    }
    else {
        var keys = Object.keys(tournaments);

        if (keys.length > 0) {
            keys = _.sortBy(keys);
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                populateTableGroupHeader(key.split('#')[0], tableBody);
                populateTournamentsTableRows(tournaments[key], tableBody);
            }
        }
    }

    // setup fixed header table
    table.fixedHeaderTable({
        height: '612',
        refreshHeader: true,
        headerHTML: '<img src="/icongraphy/svg/icon-logo2.svg" alt="Daily Champion"><div class="rectangle"></div>'
    });

    // setup stupid table
    setupStupidTable(table);
    // getDefaultSortingHeader().stupidsort();

    // no tournaments text
    var noTournamentsContainer = $('#noTournamentsContainer');

    if (tournaments.length === 0 || Object.keys(tournaments).length === 0) {
        noTournamentsContainer.show();

        if (currentTournamentsType === TYPE_LIVE) {
            var text = 'No live contests running at the moment.';
        }
        else if (currentTournamentsType === TYPE_UPCOMING) {
            text = 'No contests upcoming at the moment.';
        }
        else if (currentTournamentsType === TYPE_HISTORY) {
            text = 'No history contests at the moment.';
        }
        $('#noTournamentsText').text(text);
    }
    else {
        noTournamentsContainer.hide();
    }
}


function groupByTournaments (rawTournaments) {
    
    var tournaments = {};

    if (!rawTournaments || rawTournaments.length === 0) {
        return tournaments;
    }

    if (currentTournamentsGroupBy === GROUP_BY_LINE_UP) {
        // split entries to individual tournament
        var temp = [];

        for (var i = 0; i < rawTournaments.length; i++) {
            var tournament = rawTournaments[i];

            for (var j = 0; j < tournament.entries.length; j++) {
                var newObject = Object.assign({}, tournament)
                newObject.entries = [tournament.entries[j]];
                temp.push(newObject);
            }
        }
        rawTournaments = temp;
    }
    
    for (var i = 0; i < rawTournaments.length; i++) {
        var tournament = rawTournaments[i];
        var key = groupByKeyFromTournament(tournament);
        var arr = tournaments[key] ? tournaments[key] : [];
        arr.push(tournament);
        tournaments[key] = arr;
    }

    return tournaments;
}


function groupByKeyFromTournament (tournament) {
    if (currentTournamentsGroupBy === GROUP_BY_CONTEST) {
        return tournament.name + '#' + tournament._id;
    }
    else if (currentTournamentsGroupBy === GROUP_BY_ENTRY_FEE) {
        return formatMoney(tournament.entryFee);
    }
    else {
        var entryPlayerIds = tournament.entries[0].playersIds.split(',');
        entryPlayerIds.sort();
        return entryPlayerIds.toString();
    }
}


function calculateContestsSummary (tournaments) {
    var count = 0;
    var balance = 0;

    for (var i = 0; i < tournaments.length; i++) {
        var tournament = tournaments[i];
        var entries = tournament.entries;

        for (var j = 0; j < entries.length; j++) {
            var entry = entries[j];

            switch (currentTournamentsType) {
                case TYPE_UPCOMING:
                    balance += tournament.entryFee;
                    break;
                case TYPE_LIVE:
                case TYPE_HISTORY:
                    balance += entry.prize ? entry.prize : 0;
                    break;
                default:
                    break;
            }
            count ++;
        }
    }

    return {
        count: count,
        balance: balance
    };
}


function numberOfTableColumn () {
    var columns = 0;

    switch (currentTournamentsType) {
        case TYPE_LIVE:
            columns = 11;
            break;
        case TYPE_UPCOMING:
            columns = 9;
            break;
        case TYPE_HISTORY:
            columns = 12;
            break;
        default:
            break;
    }

    if (currentTournamentsGroupBy === GROUP_BY_CONTEST) {
        columns -= 2;
    }
    else if (currentTournamentsGroupBy === GROUP_BY_ENTRY_FEE) {
        columns -= 1;
    }

    return columns;
}


function populateTableGroupHeader (text, tableBody) {
    var tr = document.createElement('tr');
    tr.className = 'groupByHeader expanded';
    tableBody.appendChild(tr);

    var columns = numberOfTableColumn();
    th = document.createElement('th');
    th.className = 'tournamentGroupHeader';
    th.setAttribute('colspan', columns);
    tr.appendChild(th);

    if (currentTournamentsGroupBy === GROUP_BY_LINE_UP) {
        var formationContainer = document.createElement('div');
        formationContainer.className = 'entryFormationContainer';
        th.appendChild(formationContainer);

        var entryPlayers = document.createElement('div');
        entryPlayers.className = 'entryLineupContainer';
        th.appendChild(entryPlayers);

        var playerIds = text.split(',');
        var formation = {};

        for (var i = 0; i < playerIds.length; i++) {
            var player = tournamentsPlayers[playerIds[i]];
            if (!player) {
                continue;
            }

            var playerPosition = player.position;
            var currentCount = formation[playerPosition];

            if (!currentCount)
                formation[playerPosition] = 1;
            else
                formation[playerPosition]++;

            var lineupPlayer = document.createElement('div');
            lineupPlayer.className = 'entryPlayer';
            entryPlayers.appendChild(lineupPlayer);

            var avatarSrc = player.optasportsId ? playerAvatarUrl(player.optasportsId, 50) : '/icongraphy/svg/icon-no-photo.svg';
            var avatar = document.createElement('img');
            avatar.className = 'entryPlayerAvatar';
            avatar.src = avatarSrc;
            lineupPlayer.appendChild(avatar);

            var position = document.createElement('p');
            position.className = 'entryPlayerPosition';
            position.innerHTML = player.position;
            lineupPlayer.appendChild(position);

            var name = document.createElement('p');
            name.className = 'entryPlayerName singleLineText';
            name.innerHTML = shortPlayerName(player.name);
            lineupPlayer.appendChild(name);
        }

        var imgFormation = document.createElement('IMG');
        imgFormation.className = 'entryLineupImage';
        imgFormation.width = 31;
        imgFormation.height = 45;
        imgFormation.src = '/icongraphy/svg/icon-tour-formation-' + formatFormation(formation) + '.svg';
        formationContainer.appendChild(imgFormation);
    }
    else {
        th.innerHTML = text;
    }

    var indicator = document.createElement('div');
    indicator.className = 'rowIndicator';
    th.appendChild(indicator);

    indicator = document.createElement('div');
    indicator.className = 'hoverIndicator';
    th.appendChild(indicator);

    var span = document.createElement('span');
    th.insertBefore(span, th.firstChild);
}


function populateTableHeaders (table) {
    var tableHead = document.createElement('thead');
    table[0].appendChild(tableHead);

    var header = document.createElement('tr');
    tableHead.appendChild(header);

    var th = document.createElement('th');
    th.className = 'tournamentHeader tournamentRowIndicator';
    header.appendChild(th);

    if (currentTournamentsGroupBy !== GROUP_BY_CONTEST) {
        th = document.createElement('th');
        th.className = 'tournamentHeader tournamentFlags';
        header.appendChild(th);

        th = document.createElement('th');
        th.className = 'tournamentHeader tournamentName';
        th.setAttribute('data-sort', 'string');
        header.appendChild(th);

        var button = document.createElement('button');
        button.className = 'tournamentHeaderText';
        button.innerHTML = 'Contest Name';
        th.appendChild(button);
    }

    if (currentTournamentsType !== TYPE_UPCOMING) {
        th = document.createElement('th');
        th.className = 'tournamentHeader tournamentPlace';
        th.setAttribute('data-sort', 'number');
        th.setAttribute('data-sort-default', 'asc');
        header.appendChild(th);

        button = document.createElement('button');
        button.className = 'tournamentHeaderText';
        button.innerHTML = 'Place';
        th.appendChild(button);

        th = document.createElement('th');
        th.className = 'tournamentHeader tournamentPayout';
        th.setAttribute('data-sort', 'money');
        th.setAttribute('data-sort-default', 'desc');
        header.appendChild(th);

        var payoutText = (currentTournamentsType === TYPE_LIVE) ? 'Winning' : 'Won';
        button = document.createElement('button');
        button.className = 'tournamentHeaderText';
        button.innerHTML = payoutText;
        th.appendChild(button);

        th = document.createElement('th');
        th.className = 'tournamentHeader tournamentPoints';
        th.setAttribute('data-sort', 'number');
        th.setAttribute('data-sort-default', 'desc');
        header.appendChild(th);

        button = document.createElement('button');
        button.className = 'tournamentHeaderText';
        button.innerHTML = 'Points';
        th.appendChild(button);
    }

    if (currentTournamentsType === TYPE_UPCOMING) {
        th = document.createElement('th');
        th.className = 'tournamentHeader tournamentStartTime upcomingDefaultSortingHeader';
        th.setAttribute('data-sort', 'timestamp') ;
        th.setAttribute('data-sort-default', 'desc');
        header.appendChild(th);

        button = document.createElement('button');
        button.className = 'tournamentHeaderText';
        button.innerHTML = 'Start Time';
        th.appendChild(button);
    }
    else if (currentTournamentsType === TYPE_LIVE) {
        th = document.createElement('th');
        th.className = 'tournamentHeader tournamentProgress';
        th.setAttribute('data-sort', 'int');
        th.setAttribute('data-sort-default', 'desc');
        header.appendChild(th);

        button = document.createElement('button');
        button.className = 'tournamentHeaderText';
        button.innerHTML = 'Progress';
        th.appendChild(button);
    }
    else if (currentTournamentsType === TYPE_HISTORY) {
        th = document.createElement('th');
        th.className = 'tournamentHeader tournamentEndTime historyDefaultSortingHeader' ;
        th.setAttribute('data-sort', 'timestamp');
        th.setAttribute('data-sort-default', 'desc');
        header.appendChild(th);

        button = document.createElement('button');
        button.className = 'tournamentHeaderText';
        button.innerHTML = 'End Time';
        th.appendChild(button);
    }

    if (currentTournamentsGroupBy !== GROUP_BY_ENTRY_FEE) {
        th = document.createElement('th');
        th.className = 'tournamentHeader tournamentEntryFee';
        th.setAttribute('data-sort', 'money');
        th.setAttribute('data-sort-default', 'desc');
        header.appendChild(th);

        button = document.createElement('button');
        button.className = 'tournamentHeaderText';
        button.innerHTML = 'Entry';
        th.appendChild(button);       
    }

    th = document.createElement('th');
    th.className = 'tournamentHeader tournamentRake';
    th.setAttribute('data-sort', 'money');
    th.setAttribute('data-sort-default', 'desc');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'tournamentHeaderText';
    button.innerHTML = 'Fee';
    th.appendChild(button);

    if (currentTournamentsType === TYPE_LIVE) {
        th = document.createElement('th');
        th.className = 'tournamentHeader tournamentPlacesPaid';
        th.setAttribute('data-sort', 'number');
        th.setAttribute('data-sort-default', 'desc');
        header.appendChild(th);

        button = document.createElement('button');
        button.className = 'tournamentHeaderText';
        button.innerHTML = 'Paid';
        th.appendChild(button); 
    }
    else {
        th = document.createElement('th');
        th.className = 'tournamentHeader tournamentPrizePool';
        th.setAttribute('data-sort', 'money_short');
        th.setAttribute('data-sort-default', 'desc');
        header.appendChild(th);

        button = document.createElement('button');
        button.className = 'tournamentHeaderText';
        button.innerHTML = 'Prize Pool';
        th.appendChild(button);

        th = document.createElement('th');
        th.className = 'tournamentHeader tournamentTopPrize';
        th.setAttribute('data-sort', 'money_short');
        th.setAttribute('data-sort-default', 'desc');
        header.appendChild(th);

        button = document.createElement('button');
        button.className = 'tournamentHeaderText';
        button.innerHTML = 'Top Prize';
        th.appendChild(button);
    }
    
    var th = document.createElement('th');
    th.className = 'tournamentHeader tournamentAction';
    header.appendChild(th);
}


function populateTournamentsTableRows (tournaments, tableBody) {
    for (var i = 0; i < tournaments.length; i++) {
        var tournament = tournaments[i];

        for (var j = 0; j < tournament.entries.length; j++) {
            var entry = tournament.entries[j];

            var tr = document.createElement('tr');
            tr.className = 'tableRow tournamentRow';
            tr.setAttribute('id', tournament._id);
            tr.setAttribute('data-entry', entry.entryId);
            tr.setAttribute('data-value', tournament._id);
            tableBody.appendChild(tr);

            tr.addEventListener('click', function () {
                tournamentActionClick($(this));
            });

            populateTableRow(tr, tournament, entry, j);
        }
    }
}


function populateTableRow (tr, tournament, entry, ind) {
    var isCancelled = tournament.isCancelled;

    var td = document.createElement('td');
    td.className = 'tableData tournamentData tournamentRowIndicator';
    tr.appendChild(td);
    if (isCancelled) tr.className += ' cancelled';

    var indicator = document.createElement('div');
    indicator.className = 'rowIndicator';
    td.appendChild(indicator);

    indicator = document.createElement('div');
    indicator.className = 'hoverIndicator';
    td.appendChild(indicator);

    if (currentTournamentsGroupBy !== GROUP_BY_CONTEST) {
        td = document.createElement('td');
        td.className = 'tableData tournamentData tournamentFlags';
        tr.appendChild(td);

        if (currentTournamentsType === TYPE_UPCOMING && entry.hasInactivePlayers) {
            var warningIcon = document.createElement('img');
            warningIcon.className = 'tournamentIcon';
            warningIcon.src = '/img/warning.png';
            warningIcon.setAttribute('title', 'The lineup contains inactive players');
            td.appendChild(warningIcon);
        }

        var leagueLogoIcon = document.createElement('img');
        leagueLogoIcon.className = 'tournamentIcon';
        leagueLogoIcon.src = logoForTournament(tournament, SMALL_LOGO);
        // leagueLogoIcon.setAttribute('data-rjs', logoForTournament(tournament, MEDIUM_LOGO));
        td.appendChild(leagueLogoIcon);
        // retinajs($(leagueLogoIcon));

        if (isTournamentFeatured(tournament)) {
            var featuredIcon = document.createElement('img');
            featuredIcon.className = 'tournamentFeatured';
            featuredIcon.src = '/icongraphy/svg/icon-star.svg';
            td.appendChild(featuredIcon);
        }

        td = document.createElement('td');
        td.className = 'tableData tournamentData tournamentName singleLineText';
        td.setAttribute('data-secondvalue', entry.pos);
        td.innerHTML = tournament.name;
        tr.appendChild(td);
    }

    if (currentTournamentsType !== TYPE_UPCOMING) {
        var place = entry.pos || Number.MAX_SAFE_INTEGER;
        td = document.createElement('td');
        td.className = 'tableData tournamentData tournamentPlace';
        td.setAttribute('data-value', place);
        tr.appendChild(td);

        var span = document.createElement('span');
        span.className = 'has-arrow';
        span.innerHTML = entry.pos ? formatNumber(entry.pos) + '<sup>' + formatOrdinalSuffix(entry.pos) + '</sup>' : '-';
        td.appendChild(span);

        td = document.createElement('td');
        td.className = 'tableData tournamentData tournamentPayout';
        td.innerHTML = formatPrize(tournament, entry.prize);;
        tr.appendChild(td);

        var points = formatNumber(entry.totalPoints);
        td = document.createElement('td');
        td.className = 'tableData tournamentData tournamentPoints';
        td.innerHTML = points;
        tr.appendChild(td);
    }

    if (currentTournamentsType === TYPE_UPCOMING) {
        var startDate = moment(tournament.startDate);
        var startTime = startDate.format('ddd HH:mm a');
        var timestamp = (startDate.unix() * 1000);
        td = document.createElement('td');
        td.className = 'tableData tournamentData tournamentStartTime';
        td.setAttribute('data-value', timestamp);
        tr.appendChild(td);

        var startDate = moment(tournament.startDate);
        var timeText = document.createElement('P');
        timeText.className = 'tournamentDataText tournamentDataStartTime';
        if (!tournament.isOpen && tournament.isActive) {
            timeText.className += ' past';
        }
        if (startDate.isBefore(moment().add(4, 'h'))) {
            timeText.className += ' tournamentTimer';

            var timestamp = (startDate.unix() * 1000);
            var timer = new Timer($(timeText), timestamp, 3600);     // highlight time text in 5 mins
            timer.update();
            tournamentsTimers.push(timer);
        }
        else if (startDate.isAfter(moment().add(7, 'd'))) {
            timeText.innerHTML = startDate.format('D-MM h:mm a');
        }
        else {
            timeText.innerHTML = startDate.format('ddd h:mm a');
        }
        td.appendChild(timeText);
    }
    else if (currentTournamentsType === TYPE_LIVE) {
        td = document.createElement('td');
        td.className = 'tableData tournamentData tournamentProgress';
        tr.appendChild(td);

        var progressContainer = document.createElement('div');
        progressContainer.className = 'hasTooltip progressContainer';
        td.appendChild(progressContainer);

        var progress = entry.progress || 0;
        var progressBar = document.createElement('div');
        progressBar.className = 'progressBar';
        progressBar.setAttribute('data-percentage', progress);
        progressBar.style.width = progress + '%';
        progressContainer.appendChild(progressBar);

        var tooltipBox = document.createElement('div');
        tooltipBox.className = 'tooltipBox tooltipContainer';
        progressContainer.appendChild(tooltipBox);

        var span = document.createElement('span');
        span.className = 'tooltipInner progressTooltipText';
        tooltipBox.appendChild(span);
    }
    else if (currentTournamentsType === TYPE_HISTORY) {
        var endDate = moment(tournament.finishedAt);
        var timestamp = (endDate.unix() * 1000);
        var endTime = endDate.format('ddd D-MM HH:mm');
        td = document.createElement('td');
        td.className = 'tableData tournamentData tournamentEndTime';
        td.setAttribute('data-value', timestamp);
        td.innerHTML = endTime;
        tr.appendChild(td);
    }

    if (currentTournamentsGroupBy !== GROUP_BY_ENTRY_FEE) {
        td = document.createElement('td');
        td.className = 'tableData tournamentData tournamentEntryFee';
        td.innerHTML = formatPrize(tournament, tournament.entryFee);
        tr.appendChild(td);
    }

    var rake = tournament.rake ? tournament.rake : 0;
    td = document.createElement('td');
    td.className = 'tableData tournamentData tournamentRake';
    td.innerHTML = formatPrize(tournament, rake);
    tr.appendChild(td);

    var payouts = tournament.payouts.split(',');
    if (currentTournamentsType === TYPE_LIVE) {
        td = document.createElement('td');
        td.className = 'tableData tournamentData tournamentPlacesPaid';
        td.innerHTML = formatNumber(payouts.length);
        tr.appendChild(td);
    }
    else {
        var prizePool = formatPrizeShort(tournament, tournament.totalPrize);
        td = document.createElement('td');
        td.className = 'tableData tournamentData tournamentPrizePool';
        td.innerHTML = prizePool;
        tr.appendChild(td);

        var topPrize = formatPrizeShort(tournament, payouts[0]);
        td = document.createElement('td');
        td.className = 'tableData tournamentData tournamentTopPrize';
        td.innerHTML = topPrize;
        tr.appendChild(td);
    }

    td = document.createElement('td');
    td.className = 'tableData tournamentData tournamentAction';
    tr.appendChild(td);

    if (currentTournamentsType === TYPE_UPCOMING) {
        if (tournament.multiEntries > 1 && tournament.entries.length !== tournament.multiEntries && tournament.entriesCount !== tournament.maxEntries) {
            var addEntryButton = document.createElement('button');
            addEntryButton.className = 'entryButton addEntryButton';
            addEntryButton.addEventListener('click', function (e) {
                e.stopPropagation();
                window.location.href = '/contest/createLineup?contest=' + tournament._id;
            });
            td.appendChild(addEntryButton);
        }

        var editButton = document.createElement('button');
        editButton.className = 'entryButton editEntryButton';
        editButton.addEventListener('click', function (e) {
            e.stopPropagation();
            window.location.href = '/contest/createLineup?contest=' + tournament._id + '&entry=' + entry.entryId;
        });
        td.appendChild(editButton);

        if (tournament.maxEntries <= 0 || tournament.entries.length < tournament.maxEntries) {
            var removeButton = document.createElement('button');
            removeButton.className = 'entryButton removeEntryButton';
            removeButton.addEventListener('click', function (e) {
            e.stopPropagation();
                showConfirmDeleteEntryDialog(tournament, entry);
            });
            td.appendChild(removeButton);
        }
    }
    else {
        var actionText = (currentTournamentsType === TYPE_LIVE) ? 'LIVE' : (isCancelled ? 'CANCELED' : 'RESULTS');
        var className = (currentTournamentsType === TYPE_LIVE) ? 'tournamentLiveButton' : 'tournamentResultButton';
        var actionButton = document.createElement('button');
        actionButton.className = className;
        actionButton.innerHTML = actionText;
        actionButton.addEventListener('click', function (e) {
            e.stopPropagation();
            var tr = $(this).closest('tr');
            tournamentActionClick(tr);
        });
        td.appendChild(actionButton);
    }
}


function getDefaultSortingHeader () {
    switch (currentTournamentsType) {
        case TYPE_LIVE:
            return $('#tournamentsTable th.liveDefaultSortingHeader');

        case TYPE_UPCOMING:
            return $('#tournamentsTable th.upcomingDefaultSortingHeader');

        case TYPE_HISTORY:
            return $('#tournamentsTable th.historyDefaultSortingHeader');
    }
}


function parseTournamentsPlayers (userPlayers) {
    var players = userPlayers.split(',');

    for (var i = 0; i < players.length; i++) {
        var player = parsePlayerInfo(players[i]);
        
        if (player) {
            tournamentsPlayers[player.id] = player;
        }
    }
}


function tournamentsResponseReceived (tournaments) {
    $('#contestUsername').text(loggedInUsername);

    for (var i = 0; i < tournaments.length; i++) {
        var tournament = tournaments[i];

        if (tournament.isOpen) {
            upcomingTournaments.push(tournament);
        }
        else if (tournament.isActive) {
            liveTournaments.push(tournament);
            registerTournamentDetailsUpdate(tournament);
        }
        else {
            historyTournaments.push(tournament);
        }
    }

    sortUpcomingTournaments();
    sortLiveTournaments();
    sortHistoryTournaments();

    fillInTournamentsTable();
}


function registerTournamentDetailsUpdate (tournament) {
    socket.on('tournamentUpdate:' + tournament._id, function (res) {
        onTournamentUpdate(res);
    });
}


function removeTournamentDetailsUpdates (tournament) {
    socket.removeAllListeners('tournamentUpdate:' + tournament._id);
}


function sortUpcomingTournaments () {
    upcomingTournaments.sort(function (t1, t2) {
        return new Date(t1.startDate) - new Date(t2.startDate);
    });
}


function sortLiveTournaments () {
    liveTournaments.sort(function (t1, t2) {
        return new Date(t1.startDate) - new Date(t2.startDate);
    });
}


function sortHistoryTournaments () {
    historyTournaments.sort(function (t1, t2) {
        var date1 = t1.finishedAt ? new Date(t1.finishedAt) : new Date();
        var date2 = t2.finishedAt ? new Date(t2.finishedAt) : new Date();
        return date2 - date1;
    });
}


function tournamentActionClick (tr) {
    var tournamentId = tr.prop('id');
    var entryId = tr.data('entry');

    goToContestLobby(tournamentId, entryId);
}


function onTournamentStarted (tournamentId) {
    var tournament = _.find(upcomingTournaments, {'_id': tournamentId});
    if (!tournament) return;

    _.remove(upcomingTournaments, {'_id': tournamentId});

    liveTournaments.push(tournament);
    sortLiveTournaments();

    registerTournamentDetailsUpdate(tournament);

    fillInTournamentsTable();
    updateTabsTitles();
}


function onTournamentFinished (tournamentId) {
    var tournament = _.find(liveTournaments, {'_id': tournamentId});
    if (!tournament) return;

    _.remove(liveTournaments, {'_id': tournamentId});

    tournament.finishedAt = new Date().toISOString();
    historyTournaments.push(tournament);
    sortHistoryTournaments();

    removeTournamentDetailsUpdates(tournament);

    fillInTournamentsTable();
    updateTabsTitles();
}


function onTournamentEntryAdded (tournamentId, entry) {
    if (entry.username === loggedInUsername) {
        var tournament = _.find(upcomingTournaments, {'_id': tournamentId});
        
        if (tournament) {
            addEntryToTournament(tournament, entry, loggedInUsername);
            fillInTournamentsTable();
        }
    }
}


function onTournamentEntryRemoved (tournamentId, entryId, entryUsername) {
    if (entryUsername === loggedInUsername) {
        var tournament = _.find(upcomingTournaments, {'_id': tournamentId});

        if (tournament) {
            removeEntryFromTournament(tournament, entryId, entryUsername, loggedInUsername);

            // remove tournament if it has no entry
            if (tournament.entries.length === 0) {
                var idx = upcomingTournaments.indexOf(tournament);
                if (idx >= 0) {
                    upcomingTournaments.splice(idx, 1);
                }
            }
            fillInTournamentsTable();
        }
    }
}


function onTournamentUpdate (res) {
    var entries = res.entries;

    for (var e = 0; e < entries.length; e++) {
        var entry = entries[e];

        if (entry.username !== loggedInUsername) continue;

        for (var t = 0; t < liveTournaments.length; t++) {
            var tournament = liveTournaments[t];

            var oldEntry = _.find(tournament.entries, {'entryId': entry.entryId});
            if (oldEntry) {
                oldEntry = $.extend(oldEntry, entry);
            }
        }

        updateLiveTournamentRow(entry);
    }
}


function updateLiveTournamentRow (entry) {
    var tr = $('.tournamentRow[data-entry="' + entry.entryId + '"]');

    if (tr.length === 0) return;

    var placeText = tr.find('.tournamentPlace span');
    var placeHtml = entry.pos ? formatNumber(entry.pos) + '<sup>' + formatOrdinalSuffix(entry.pos) + '</sup>' : '-';
    placeText.html(placeHtml);

    var payoutsTd = tr.find('.tournamentPayout');
    payoutsTd.text(formatMoney(entry.prize));

    var pointsTd = tr.find('.tournamentPoints');
    pointsTd.text(formatNumber(entry.totalPoints));

    var progressBar = tr.find('.progressBar');
    progressBar.css("width", entry.progress + '%');
    progressBar.data('percentage', entry.progress);

    $('#tournamentsTable').stupidRefresh();
}


function showConfirmDeleteEntryDialog (tournament, entry) {
    var message = 'Are you sure to unregister from this contest?<br>The entry fee of <span>' + formatMoney(tournament.entryFee) + '</span>, will be credited to your account immediately after unregistration.';

    var confirmDialog = $('#deleteEntryDialog');
    confirmDialog.find('.dialogMessage').html(message);
    
    confirmDialog
        .dialog({
            dialogClass: 'noTitleStuff fixed-dialog',
            resizable: false,
            modal: true,
            autoOpen: true,
            draggable: false,
            open: function(e, ui) {
                // bind close
                $('#deleteEntryDialog').unbind().bind('click', function(e) {
                    e.stopPropagation();
                });
                
                $('.ui-dialog.fixed-dialog, #deleteEntryDialogCloseButton').unbind().bind('click', function() {
                    $('#deleteEntryDialog').dialog('close');
                });

                $('#deleteEntryYesButton').unbind().bind('click', function () {
                    sendDeleteEntryRequest(tournament, entry);
                    $('#deleteEntryDialog').dialog( "close" );
                });

                $('#deleteEntryNoButton').unbind().bind('click', function () {
                    $('#deleteEntryDialog').dialog( "close" );
                });
            }
        });
}


function sendDeleteEntryRequest (tournament, entry) {
    var data = { tournamentId : tournament._id, entryId : entry.entryId };

    $.ajax(
        {
            type : 'DELETE',
            url : '/api/deleteTournamentEntry',
            dataType : 'JSON',
            data : data,
            statusCode : {
                200 : function () {
                    deleteEntry(tournament, entry);
                },
                202 : function (msg) {
                    createWarningDialog('Lineup deletion failed', msg);
                },
                401 : function () {
                    goToLogin();
                },
                404 : function () {
                    createErrorDialog('Lineup deletion failed', 'Failed to delete your tournament entry: the tournament could not be found. Please try again or contact the support.');
                },
                501 : function (err) {
                    createErrorDialog('Lineup deletion failed', 'Failed to delete your tournament entry: ' + err.responseText);
                }
            }
        }
    );
}


function deleteEntry (tournament, entry) {
    for (var i = 0; i < tournament.entries.length; i++) {
        if (tournament.entries[i].entryId === entry.entryId) {
            tournament.entries.splice(i, 1);
            $('#tournamentsBody').find('[data-entry="' + entry.entryId + '"]').remove();
            break;
        }
    }

    updateTabsTitles();
}


function updateTabsTitles () {
    $('#contestTabLiveCount').text('(' + numberOfEntries(liveTournaments) + ')');
    $('#contestTabUpcomingCount').text('(' + numberOfEntries(upcomingTournaments) + ')');
    $('#contestTabHistoryCount').text('(' + numberOfEntries(historyTournaments) + ')');
}


function numberOfEntries (tournaments) {
    var count = 0;

    for (var i = 0; i < tournaments.length; i++) {
        var tournament = tournaments[i];
        count += tournament.entries.length;
    }
    return count;
}


function calculateMinutesRemainingForTournament (tournament) {
    var sum = 0;

    for (var i = 0; i < tournament.matches.length; i++) {
        var mins = tournament.matches[i].minutesPlayed;

        if (!mins) {
            sum += 90;
        }
        else {
            sum += Math.max(0, 90 - mins);
        }
    }

    return sum;
}


function calculatePMR (tournament, entry) {
    var players = entry.playersIds.split(',');
    var pmr = 0;

    for (var i = 0; i < players.length; i++) {
        var player = players[i];

        for (var j = 0; j < tournament.matches.length; j++) {
            var match = tournament.matches[j];
            if (playersIdsStringContainsPlayer(match.playersIds, player) >= 0) {
                pmr += Math.max(0, 90 - match.minutesPlayed);
                break;
            }
        }
    }

    return pmr;
}