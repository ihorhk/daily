var socket = io();

const ALL_SLATES = 1;
const EARLY_SLATE = 2;
const LATE_SLATE = 3;
const LATE_SLATE_START_HOUR = 16; // gmt time
const LATE_SLATE_START_MINUTE = 30;
const SPLIT_MIN_MATCH_COUNT = 1;
const FILTER_RECENT_KEYWORDS = 'filter_recent_keywords';
const MAX_RECENT_KEYWORDS = 5;
const DATE_SLIDER_KEY_ALL = 'All';
const DATE_SLIDER_KEY_LIVE = 'Live';
const COOKIE_DATE_SELECTED = 'contests_dateSelected';

var loggedInUsername;
var upcomingTournaments;
var liveTournaments;
var historyTournaments;
var tournamentsTimers = [];
var tournamentTypes;
var tournamentFlags;

var tournamentEntryFeeRange;

var filterSearchQuery;
var filterEntryFeeRange;
var filterTournamentTypes = [];
var filterTournamentFlags = [];
var filterCompetitions = [];
var filterSlate;

var currentDateSliderKey = DATE_SLIDER_KEY_ALL;

var selectedTournament;

$ (function () {
    $.ajax(
        {
            type : 'GET',
            url : '/api/getLobbyTournamentsAndData',
            dataType : 'json',
            statusCode : {
                200 : function (res) {
                    loggedInUsername = res.username;
                    initFilter(res.tournaments, res.tournamentTypes, res.tournamentFlags, res.competitions);

                    tournamentsResponseReceived(res.tournaments);

                    initTournamentPromotionBanner(res.tournaments);
                },
                501 : function (err) {
                    tournamentsResponseReceived(null, err);
                }
            }
        }
    );

    initUI();
    initTimers();
});


function initUI() {
    $(document).on('click', '.tournamentRow', function () {
        var rowIndex = $(this).index() + 1;

        requestTournamentInfo(getTournamentIdByIndex(rowIndex));
    });

    setupTournamentsTable();
}


function initTimers() {
    setInterval(function () {

        for (var i = 0; i < tournamentsTimers.length; i++) {
            tournamentsTimers[i].update();
        }

    }, 1000);
}


function initTournamentPromotionBanner (tournaments) {
    // look for weekly mega freeroll
    for (var i = 0; i < tournaments.length; i++) {
        if (tournaments[i].programmedId === 'weekly_mega_freeroll') {
            var promoContainer = $('#promoContainer');
            promoContainer.show();

            var tournament = tournaments[i];

            $('#promoPrizeText').text(formatMoney(tournament.totalPrize));
            $('#promoRegisterButton').click(function () {

                goToDraftTeam(this._id);

            }.bind(tournament));

            break;
        }
    }
}


function initFilter (tournaments, tourTypes, tourFlags, allCompetitions) {
    tournamentTypes = tourTypes;
    tournamentFlags = tourFlags;

    var tournamentTypesContainer = $('#filterContestPopBox .filterPopBoxBody');

    // tournament types
    Object.keys(tournamentTypes).forEach(function (type) {
        createFilterOption(tournamentTypesContainer, filterTournamentTypes, type, tournamentTypes[type]);
    });

    // tournament flags
    // Object.keys(tournamentFlags).forEach(function (flag) {
    //     createFilterOption(tournamentTypesContainer, filterTournamentFlags, flag, tournamentFlags[flag]);
    // });

    var leaguesContainer = $('#filterLeaguePopBox .filterPopBoxBody');

    // get all the competitions from the current tournaments
    var tournamentsCompetitions = {};
    for (var t = 0; t < tournaments.length; t++) {
        var tour = tournaments[t];

        for (var m = 0; m < tour.matches.length; m++) {
            tournamentsCompetitions[tour.matches[m].competitionId] = 1;
        }
    }

    Object.keys(tournamentsCompetitions).forEach(function (competitionId) {
        // look for competition
        for (var c = 0; c < allCompetitions.length; c++) {
            if (allCompetitions[c].competitionId === competitionId) {
                var competition = allCompetitions[c];
                break;
            }
        }

        var leagueText = competition.name;
        var leagueLogo = logoForCompetition(competitionId, SMALL_LOGO);

        createFilterOption(leaguesContainer, filterCompetitions, competitionId, leagueText, leagueLogo);
    });

    // name filter
    $('#filterSearch').on('input change', function () {
        filterSearchQuery = $(this).val();
        applyFilter(true);
    });

    $(document).on('click', '#filterNamePopBox li', function() {
        $('#filterSearch').val($(this).text());
        $('#filterSearch').change();
        filterPopBoxReset();
    });

    // Entry fee slider
    tournamentEntryFeeRange = [Number.MAX_VALUE, 0];
    for (var i = 0; i < tournaments.length; i++) {
        var tournament = tournaments[i];
        if (tournament.entryFee < tournamentEntryFeeRange[0]) {
            tournamentEntryFeeRange[0] = tournament.entryFee;
        }
        else if (tournament.entryFee > tournamentEntryFeeRange[1]) {
            tournamentEntryFeeRange[1] = tournament.entryFee;
        }
    }

    $('#filterEntryFeeSlider').ionRangeSlider({
        type: 'double',
        min: tournamentEntryFeeRange[0],
        max: tournamentEntryFeeRange[1],
        prefix: '€',
        onChange: function(data) {
            filterEntryFeeRange[0] = data['from'];
            filterEntryFeeRange[1] = data['to'];
            applyFilter(true);
        }
    });

    // Reset filter
    $('#filterResetButton').click(function () {
        resetFilter();
        applyFilter(false);
    });

    resetFilter();

    // filter pop box
    var filter_hover_delay = false;
    var filter_delay_counter;
    $(document).on('mouseenter', '#filterContainer .filterItem', function () {

        filterPopBoxReset();
        filter_hover_delay = true;
        window.clearTimeout(filter_delay_counter);

        var top = $(this).offset().top;
        var left = $(this).offset().left;
        if (window.isDesktop) {
            top -= 1;
            left += $(this).outerWidth() + 20;
        }
        else if (window.isTablet) {
            top += 75;
        }

        var $popBox;
        if ($(this).prop('id') == 'filterItemName') {
            $popBox = $('#filterNamePopBox');

            $dropdown = $('#filterSearchKeywords');
            $dropdown.empty();

            var keywords = JSON.parse(localStorage.getItem(FILTER_RECENT_KEYWORDS));
            if (keywords && keywords.length) {
                for (var i = 0; i < keywords.length; i++) {
                    $('<li>' + keywords[i] + '</li>').appendTo($dropdown);
                }
                $dropdown.removeClass('empty');
            }
            else {
                $dropdown.addClass('empty');
            }

            $popBox.find('.input-group-btn').removeClass('open');
            $popBox.find('.dropdown-toggle').prop('aria-expanded', false);

            if (window.isTablet) {
                left = $(this).offset().left - 26;
            }
        }
        else if ($(this).prop('id') == 'filterItemEntryFee') {
            $popBox = $('#filterEntryFeePopBox');

            if (window.isTablet) {
                left = $(this).offset().left - 82;
            }
        }
        else if ($(this).prop('id') == 'filterItemContest') {
            $popBox = $('#filterContestPopBox');

            if (window.isTablet) {
                left = $(this).offset().left - 138;
            }
        }
        else if ($(this).prop('id') == 'filterItemLeague') {
            $popBox = $('#filterLeaguePopBox');

            if (window.isTablet) {
                left = $(this).offset().left - 194;
            }
        }

        $popBox.addClass('active');
        $popBox.css({
            top: top,
            left: left,
            visibility: 'visible',
            opacity: '1',
            'z-index': '2'
        });
        $('#filterPopBoxContainer').addClass('active');

        filter_delay_counter = setTimeout(function(){
            filter_hover_delay = false
        }, 500);
    });

    $(document).on('mouseleave', '#filterContainer .filterItem', function () {
        setTimeout(function(){
            if(!filter_hover_delay && !$('.filterPopBox:hover').length) {
                filterPopBoxReset();
            }
        }, 501);
    });

    $(document).on('mouseleave', '.filterPopBox', function () {
        filterPopBoxReset();
    });

    $(window).on('resize', function () {
        filterPopBoxReset();
    });
}


function filterPopBoxReset() {
    var $activePopBox = $('.filterPopBox.active');
    if ($activePopBox.prop('id') == 'filterNamePopBox') {
        var keyword = $('#filterSearch').val();

        if (keyword.length) {
            var keywords = JSON.parse(localStorage.getItem(FILTER_RECENT_KEYWORDS));

            if (keywords) {
                var index = keywords.indexOf(keyword);

                if (index > -1) {
                    keywords.splice(index, 1);
                }
                keywords.splice(0, 0, keyword);

                if (keywords.length > MAX_RECENT_KEYWORDS) {
                    keywords.splice(MAX_RECENT_KEYWORDS, keywords.length - MAX_RECENT_KEYWORDS);
                }
            }
            else {
                keywords = [keyword];
            }
            localStorage.setItem(FILTER_RECENT_KEYWORDS, JSON.stringify(keywords));
        }
    }
    $activePopBox.removeClass('active');
    $activePopBox.css({
        visibility: 'hidden',
        opacity: 0,
        'z-index': 0
    });
    $('#filterPopBoxContainer').removeClass('active');
}


function createFilterOption (container, optionsArray, optionId, text, imgUrl) {
    var checkbox = $('<input class="checkbox" type="checkbox">').appendTo(container);
    var label = '<label class="checkbox-label">';
    if (imgUrl) {
        label += '<img class="filterLeagueLogo" src="' + imgUrl + '">';
    }
    label += text + '</label>';
    label = $(label).appendTo(container);

    checkbox.click(function () {
        if (checkbox.is(':checked')) {
            optionsArray.push(optionId);
        }
        else {
            optionsArray.splice(optionsArray.indexOf(optionId), 1);
        }

        applyFilter(true);
    });

    label.click(function () {
        checkbox.click();
    });
}


function setupTournamentsTable () {
    //create headers
    var tableHead = document.createElement('thead');

    var header = document.createElement('tr');
    tableHead.appendChild(header);

    var th = document.createElement('th');
    th.className = 'tournamentHeader tournamentFlags';
    header.appendChild(th);

    var button = document.createElement('button');
    button.className = 'tournamentDataHeader';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'tournamentHeader tournamentName';
    th.setAttribute('data-sort', 'string');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'tournamentDataHeader';
    button.innerHTML = 'Contest';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'tournamentHeader tournamentEntryFee';
    th.setAttribute('data-sort', 'float');
    th.setAttribute('data-sort-default', 'desc');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'tournamentDataHeader';
    button.innerHTML = 'Entry Fee';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'tournamentHeader tournamentEntries';
    th.setAttribute('data-sort', 'entries');
    th.setAttribute('data-sort-default', 'desc');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'tournamentDataHeader';
    button.innerHTML = 'Entries';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'tournamentHeader tournamentPrizes';
    th.setAttribute('data-sort', 'float');
    th.setAttribute('data-sort-default', 'desc');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'tournamentDataHeader';
    button.innerHTML = 'Total Prizes';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'tournamentHeader tournamentMatches';
    th.setAttribute('data-sort', 'int');
    th.setAttribute('data-sort-default', 'desc');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'tournamentDataHeader';
    button.innerHTML = 'Matches';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'tournamentHeader tournamentStartTime';
    th.setAttribute('data-sort', 'timestamp');
    th.setAttribute('data-sort-default', 'asc');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'tournamentDataHeader';
    button.innerHTML = 'Start Time';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'tournamentHeader tournamentAction';
    header.appendChild(th);

    var headTable = $('#tournamentsHeadTable');
    headTable[0].appendChild(tableHead);

    $('#tournamentsTableContainer').sortableClusterizeTable({
        scrollId: 'tournamentsScrollArea',
        contentId: 'tournamentsTableBody',
        rows_in_block: 15,
        generateRowHtml: tournamentRowHtml,
        clusterChanged: updateTournamentsRows,
        sortable: true,
        sortInfo: {
            column: 6,
            dataType: 'timestamp',
            direction: $.fn.sortableClusterizeTable.dir.ASC,
            valueFns: [
                null,
                function (tournament) {
                    return tournament.name;
                },
                function (tournament) {
                    return tournament.entryFee;
                },
                function (tournament) {
                    return formatLobbyEntryCount(tournament)
                },
                function (tournament) {
                    return tournament.totalPrize || tournament.guaranteedPrize || 0;
                },
                function (tournament) {
                    return tournament.matches.length
                },
                function (tournament) {
                    return (moment(tournament.startDate).unix() * 1000);
                },
                null
            ]
        },
        secondSortInfo: {
            dataType: 'string',
            direction: $.fn.sortableClusterizeTable.dir.ASC,
            sortFn: function (tournament) {
                return tournament.name;
            }
        },
        thirdSortInfo: {
            dataType: 'string',
            direction: $.fn.sortableClusterizeTable.dir.ASC,
            sortFn: function (tournament) {
                return tournament._id;
            }
        }
    });
}


function fillInTournamentsTable () {
    var tournaments = tournamentsFromDateKey(currentDateSliderKey);

    var data = [];
    var liveAndHistoryCount = 0;

    for (var i = 0; i < tournaments.length; i++) {
        var tournament = tournaments[i];

        if (isTournamentValidForFilter(tournament)) {
            data.push(tournament);
        }

        if (!tournament.isOpen) {
            liveAndHistoryCount++;
        }
    }

    var noTournamentsContainer = $('#noTournamentsContainer');
    if (data.length === 0) {
        var text = (currentDateSliderKey === DATE_SLIDER_KEY_LIVE) ? 'No live contests running at the moment.' : 'No Contests found for your current filter settings';
        $('#noTournamentsText').text(text);
        
        noTournamentsContainer.show();
    }
    else {
        noTournamentsContainer.hide();
    }

    $('#tournamentsTableContainer').sortableClusterizeTable('update', data);
    drawClusterizeHeadTable($('#tournamentsTable'));

    if (liveAndHistoryCount > 2) {
        for (i = 0; i < tournaments.length; i++) {
            if (--liveAndHistoryCount === 0) {
                $('#tournamentsTableContainer').sortableClusterizeTable('load', i);
                break;
            }
        }
    }
}


function tournamentRowHtml (tournament) {
    var isFeatured = isTournamentFeatured(tournament);

    var html = '<tr id="' + tournament._id + '" class="tableRow tournamentRow"' + (isFeatured ? ' featured' : '') + '>';

    html += '<td class="tableData tournamentData tournamentFlags"><div class="rowIndicator"></div><div class="hoverIndicator"></div>';

    html += '<img src="' + logoForTournament(tournament, SMALL_LOGO) + '" data-rjs="' + logoForTournament(tournament, MEDIUM_LOGO) + '"" class="tournamentIcon">';

    if (isFeatured) {
        html += '<img class="tournamentFeatured" src="/icongraphy/svg/icon-star.svg">';
    }

    html += '</td>';

    html += '<td class="tableData tournamentData tournamentName singleLineText">' + tournament.name + '</td>';

    var entryFeeFormat = (tournament.entryFee > 0) ? formatPrize(tournament, tournament.entryFee) : 'Free';
    html += '<td class="tableData tournamentData tournamentEntryFee">' + entryFeeFormat + '</td>';

    html += '<td class="tableData tournamentData tournamentEntries">' + formatLobbyEntryCount(tournament) + '</td>';

    var prize = tournament.totalPrize || tournament.guaranteedPrize || 0;
    html += '<td class="tableData tournamentData tournamentPrizes"><p>' + formatPrize(tournament, prize) + '</p></td>';

    html += '<td class="tableData tournamentData tournamentMatches">' + tournament.matches.length + '</td>';

    var startDate = moment(tournament.startDate);
    var timestamp = (startDate.unix() * 1000);
    var nameValue = generateHashCodeForString(tournament.name.substring(0, Math.min(tournament.name.length, 20)));

    html += '<td class="tableData tournamentData tournamentStartTime" data-value="' + timestamp + '" data-secondvalue="' + nameValue + '"></td>';

    html += '<td class="tableData tournamentData tournamentAction"></td>';

    html += '</tr>';

    return html;
}


function updateTournamentsRows () {
    tournamentsTimers.length = 0;
    var trs = $('.tournamentRow');

    for (var i = 0; i < trs.length; i++) {
        var tr = trs[i];
        var tournament = getTournamentFromId(tr.id);

        if (tournament) {
            updateTournamentRowStatus(tr, tournament);
        }
        else {
            // Something really went wrong
        }
    }
}


function updateTournamentRowStatus (tr, tournament) {
    if (isUserRegisterToTournament(tournament)) {
        tr.setAttribute('selected_entry', true);
    }

    retinajs($(tr).find('.tournamentIcon'));

    // if the tournament starts within 1 hour, the cell contains an element which is constantly updated
    var startTimeTd = tr.getElementsByClassName('tournamentStartTime')[0];
    var startDate = moment(tournament.startDate);

    var timeText = document.createElement('P');
    timeText.className = 'tournamentDataText tournamentDataStartTime';
    if (!tournament.isOpen) {
        timeText.className += ' past';
        tr.setAttribute('history', true);
    }

    if (startDate.isBefore(moment().add(4, 'h'))) {
        timeText.className += ' tournamentTimer';

        var timestamp = (startDate.unix() * 1000);
        var timer = new Timer($(timeText), timestamp, 3600);     // highlight time text in 1 hour
        timer.update();
        tournamentsTimers.push(timer);
    }
    else if (startDate.isAfter(moment().add(7, 'd'))) {
        timeText.innerHTML = startDate.format('D-MM h:mm a');
    }
    else if (startDate.isSame(moment(), 'day')){
        timeText.innerHTML = startDate.format('h:mm a');
    }
    else {
        timeText.innerHTML = startDate.format('ddd h:mm a');
    }
    startTimeTd.appendChild(timeText);

    // action button
    var actionTd = tr.getElementsByClassName('tournamentAction')[0];

    var actionButton = document.createElement('BUTTON');
    actionButton.className = 'tournamentActionButton';
    actionTd.appendChild(actionButton);

    if (tournament.isActive) {
        applyLiveStateToTournamentRow(tr, actionButton, tournament);
    }
    else if (tournament.isOpen) {
        manageStateForOpenTournamentRow(tournament, tr, actionButton)
    }
    else {
        applyHistoryStateToTournamentRow(tr, actionButton, tournament);
    }
}


function tournamentsFromDateKey (key) {
    if (key === DATE_SLIDER_KEY_ALL) {
        return liveTournaments.concat(upcomingTournaments).concat(historyTournaments);
    }
    else if (key === DATE_SLIDER_KEY_LIVE) {
        return liveTournaments;
    }
    else {
        var allTournaments = liveTournaments.concat(upcomingTournaments).concat(historyTournaments);
        var dateTournaments = [];

        for (var i = 0; i < allTournaments.length; i++) {
            var tour = allTournaments[i];

            if (!tour.isOpen) continue;     // show only upcoming events if date is selected

            if (filterDateKey(tour.startDate) === key) {
                dateTournaments.push(tour);
            }
        }

        return dateTournaments;
    }
}


function manageStateForOpenTournamentRow (tournament, tr, actionButton) {
    var isUserPlaying = isUserRegisterToTournament(tournament);

    if (!actionButton) {
        actionButton = tr.querySelector('.tournamentActionButton');
    }

    if (isUserPlaying) {
        actionButton.className += ' tournamentLobbyButton';
        actionButton.innerHTML = 'LOBBY';
        actionButton.addEventListener('click', function (e) {
            e.stopPropagation();
            goToContestLobby(this._id);
        }.bind(tournament));
    }
    else {
        // check if its full
        var isTournamentFull = tournament.maxEntries && tournament.maxEntries > 0 && tournament.entriesCount && (tournament.entriesCount === tournament.maxEntries);

        if (isTournamentFull) {
            if (!isUserPlaying) {
                tr.setAttribute('full', true);
                actionButton.innerHTML = 'FILLED';
                actionButton.setAttribute('disabled', true);
            }
        }
        else {
            tr.removeAttribute('full');
            actionButton.removeAttribute('disabled');
            actionButton.classList.remove('tournamentLobbyButton');

            if (isUserPlaying) {
                actionButton.innerHTML = 'LOBBY';
            }
            else {
                actionButton.innerHTML = 'ENTER';
            }
        }

        actionButton.addEventListener('click', function (e) {
            e.stopPropagation();
            goToDraftTeam(this._id);
        }.bind(tournament));
    }
}


function applyLiveStateToTournamentRow (tr, actionButton, tournament) {
    tr.removeAttribute('full');

    var startTime = tr.querySelector('.tournamentStartTime > .tournamentDataStartTime');
    startTime.classList.remove('tournamentTimer');
    startTime.classList.remove('highlighted');
    startTime.className += ' past';

    actionButton.className += ' tournamentLiveButton';
    actionButton.innerHTML = 'LOBBY';
    actionButton.addEventListener('click', function (e) {
        e.stopPropagation();
        goToContestLobby(this._id);
    }.bind(tournament));
}


function applyHistoryStateToTournamentRow (tr, actionButton, tournament) {
    actionButton.classList.remove('tournamentLiveButton');
    actionButton.className += ' tournamentHistoryButton';
    actionButton.innerHTML = 'RESULTS';
    actionButton.addEventListener('click', function (e) {
        e.stopPropagation();
        goToContestLobby(this._id);
    }.bind(tournament));
}


function getTournamentIdByIndex (rowIndex) {
    var table = $('#tournamentsTable');
    var tr = $('tr:eq(' + rowIndex + ')', table);
    return tr.attr('id');
}


function getTournamentFromId (tournamentId) {
    var tournament = _.find(liveTournaments, {'_id': tournamentId});

    if (tournament) {
        return tournament;
    }

    tournament = _.find(upcomingTournaments, {'_id': tournamentId});
    if (tournament) {
        return tournament;
    }

    return _.find(historyTournaments, {'_id': tournamentId});
}


function tournamentsResponseReceived (tournaments, err) {
    if (err) {
        createErrorDialog('Get contests failed', err);
        return;
    }

    upcomingTournaments = [];
    liveTournaments = [];
    historyTournaments = [];

    // filter out live and upcoming tournaments
    for (var i = 0; i < tournaments.length; i++) {
        var tour = tournaments[i];
        getProperArrayForTournament(tour).push(tour);
    }

    socket.on('tournamentCreated', function (tournament) {
        onTournamentCreated(tournament);
    });

    socket.on('tournamentStarted', function (tournamentId) {
        onTournamentStarted(tournamentId);
    });

    socket.on('tournamentFinished', function (tournamentId) {
        onTournamentFinished(tournamentId);
    });

    socket.on('tournamentCancelled', function (tournamentId) {
       onTournamentCancelled(tournamentId);
    });

    socket.on('tournamentEntryAdded', function (res) {
        onTournamentEntryAdded(res.tournamentId, res.entry, res.payouts);
    });

    socket.on('tournamentEntryRemoved', function (res) {
        onTournamentEntryRemoved(res.tournamentId, res.entryId, res.payouts, res.username);
    });

    fillInDateSlider(tournaments);
    fillInTournamentsTable();
}


function registerTournamentDetailsUpdates (tournament) {
    var matches = tournament.matches;

    for (var i = 0; i < matches.length; i++) {
        socket.on('matchUpdate:' + matches[i].matchId, function (res) {
            onMatchUpdate(res);
        });
    }

    socket.on('tournamentUpdate:' + tournament._id, function (res) {
        onTournamentEntriesUpdate(res.entries);
    });
}


function removeTournamentDetailsUpdates (tournament) {
    var matches = tournament.matches;

    for (var i = 0; i < matches.length; i++) {
        socket.removeAllListeners('matchUpdate:' + matches[i].matchId);
    }

    socket.removeAllListeners('tournamentUpdate:' + tournament._id);
}


function filterDateKey (date) {
    date = moment(date);
    date.add(-date.utcOffset(), 'm');
    if (isDateInDaylightSavingTime(new Date(date))) {
        date.add(1, 'h');
    }
    return date.format('YYYY-MM-DD');
}


function fillInDateSlider (tournaments) {
    var dateSlider = $('#dateSlider');
    dateSlider.empty();

    // get all matches from tournaments and sort them
    var matches = [];
    for (var i = 0; i < tournaments.length; i++) {
        var tour = tournaments[i];
        if (tour.isMock) continue;

        for (var m = 0; m < tour.matches.length; m++) {
            var match = tour.matches[m];
            if(!_.find(matches, {matchId: match.matchId})) {
                matches.push(match);
            }
        }
    }

    matches.sort(function (m1, m2) {
        return new Date(m1.startDate) - new Date(m2.startDate);
    });

    insertDateSliderItem(DATE_SLIDER_KEY_LIVE, '', dateSlider);
    insertDateSliderItem(DATE_SLIDER_KEY_ALL, '', dateSlider, matches);

    const isDateSliderItemValid = function (date, matches) {
        for (var t = 0; t < tournaments.length; t++) {
            var tour = tournaments[t];

            if (moment(tour.startDate).isSame(date, 'day') && tour.isOpen) {
                return true;
            }
        }

        return false;
    };

    var lastMatchDate;
    var matchesForDate = [];
    for (m = 0; m < matches.length; m++) {
        match = matches[m];
        var date = moment(match.startDate);

        if (!lastMatchDate) {
            lastMatchDate = date;
            matchesForDate.push(match);
        }
        else if (date.isSame(lastMatchDate, 'day')) {
            matchesForDate.push(match);
        }
        else {
            if (isDateSliderItemValid(lastMatchDate, matchesForDate)) {
                insertDateSliderItem(filterDateKey(lastMatchDate.toDate()), lastMatchDate, dateSlider, matchesForDate);
            }

            matchesForDate = [match];
            lastMatchDate = date;
        }
    }

    if (matchesForDate.length > 0) {
        insertDateSliderItem(filterDateKey(lastMatchDate.toDate()), lastMatchDate, dateSlider, matchesForDate);
    }

    // remember last selected date
    var lastSelectedDate = Cookies.get(COOKIE_DATE_SELECTED);
    if (lastSelectedDate && lastSelectedDate.length !== '') {
        var views = $('.dateView');
        for (var v = 0; v < views.length; v++) {
            var view = $(views[v]);
            if (view.data('key') === lastSelectedDate) {
                view.click();
                break;
            }
        }
    }
}


function insertDateSliderItem(key, lastMatchDate, dateSlider, matches) {
    var item = document.createElement('DIV');
    item.className = 'dateView';
    if (key === DATE_SLIDER_KEY_ALL) item.setAttribute('selected', true);
    item.setAttribute('data-key', key);
    item.addEventListener('click', function () {
        dateViewSelected(this);
    });

    var itemInner = document.createElement('DIV');
    itemInner.className = 'dateViewInner';
    item.appendChild(itemInner);

    var dateContainer = document.createElement('DIV');
    dateContainer.className = 'dateTimeView';
    itemInner.appendChild(dateContainer);

    if (key === DATE_SLIDER_KEY_ALL) {
        dateContainer.innerHTML = '<svg width="12" height="12"><use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="/icongraphy/svg/svg-sprite.svg#svg-icon-lobby-all-dates"></use></svg>';

        var date = document.createElement('SPAN');
        date.className = 'date';
        date.innerHTML = 'All Dates';
        dateContainer.appendChild(date);

        var match = document.createElement('P');
        match.className = 'dateMatchesView';
        itemInner.appendChild(match);

        // for all dates, count only the matches that belong to contest that start from the current date on
        var matchesCount = 0;
        var now = moment();
        for (var m = 0; m < matches.length; m++) {
            if (moment(matches[m].startDate).isSameOrAfter(now, 'day')) {
                matchesCount = matches.length - m;
                break;
            }
        }

        var matchText = document.createElement('SPAN');
        matchText.innerHTML = matchesCount + ' Matches';
        match.appendChild(matchText);
    }
    else if (key === DATE_SLIDER_KEY_LIVE) {
        dateContainer.className += ' liveContest';

        var date = document.createElement('SPAN');
        date.innerHTML = 'Live Contests';
        dateContainer.appendChild(date);
    }
    else {
        var date = document.createElement('SPAN');
        var dateText = lastMatchDate.format('dddd D') + '<sup>' + formatOrdinalSuffix(lastMatchDate.date()) + '</sup>';
        if (!lastMatchDate.isSame(moment(), 'month')) {
            dateText += ' ' + lastMatchDate.format('MMM');
        }
        date.innerHTML = dateText;
        dateContainer.appendChild(date);

        var match = document.createElement('P');
        match.className = 'dateMatchesView';
        itemInner.appendChild(match);

        var matchText = document.createElement('SPAN');
        matchText.innerHTML = matches.length + ' Matches';
        match.appendChild(matchText);
    }

    dateSlider[0].appendChild(item);
}


function dateViewSelected (view) {
    if (!$(this).attr('selected')) {
        // select this and deselect others
        var dateViews = $('.dateView');

        for (var i = 0; i < dateViews.length; i++) {
            var dateView = $(dateViews[i]);
            dateView.attr('selected', dateViews[i] === view);
        }

        currentDateSliderKey = $(view).data('key');
        Cookies.set(COOKIE_DATE_SELECTED, currentDateSliderKey);
        fillInTournamentsTable();
    }
}


function requestTournamentInfo (tournamentId) {
    $.ajax(
        {
            type : 'GET',
            url : '/api/getTournamentInfo',
            data : { id : tournamentId },
            dataType : 'json',
            statusCode : {
                200 : function (res) {
                    // replace tournament in array with more detailed one, to keep state consistent
                    var array = getProperArrayForTournament(res);
                    var ind = _.findIndex(array, {'_id': res._id});
                    array[ind] = $.extend(array[ind], res);

                    createTournamentDetailsDialog(res);
                },
                400 : function (err) {
                    createErrorDialog('Get contest failed', err.responseText);
                },
                501 : function (err) {
                    createErrorDialog('Get contest failed', err.responseText);
                }
            }
        }
    );
}


function onTournamentCreated (tournament) {
    if (getUserPlayMode() === tournament.playMode) {
        var startDate = new Date(tournament.startDate);

        for (var i = 0; i < upcomingTournaments.length; i++) {
             if (startDate < new Date(upcomingTournaments[i].startDate)) {
                 upcomingTournaments.splice(i, 0, tournament);
                 break;
             }
        }

        fillInTournamentsTable();
    }
}


function onTournamentStarted (tournamentId) {
    var tournament = findTournament(tournamentId);

    if (!tournament) return;

    tournament.isActive = true;
    tournament.isOpen = false;

    liveTournaments.push(tournament);

    _.remove(upcomingTournaments, {'_id': tournament._id});

    var row = document.getElementById(tournament._id);

    if (!row) return;

    var actionButton = row.querySelector('.tournamentActionButton');

    applyLiveStateToTournamentRow(row, actionButton, tournament);

    // update tournament details dialog
    if (selectedTournament && selectedTournament._id === tournamentId) {
        $('#tournamentDialogStartTime').text('LIVE');
        $('#draftTeamButton').hide();
    }
}


function onTournamentFinished (tournamentId) {
    var ind = _.findIndex(liveTournaments, { _id : tournamentId });
    if (ind < 0) return;

    var tournament = liveTournaments[ind];
    liveTournaments.splice(ind, 1);
    historyTournaments.push(tournament);

    var row = document.getElementById(tournamentId);

    if (!row) return;

    var actionButton = row.querySelector('.tournamentActionButton');

    applyHistoryStateToTournamentRow(row, actionButton, tournament);

    // update tournament details dialog
    if (selectedTournament && selectedTournament._id === tournamentId) {
        $('#tournamentDialogStartTime').text('FINISHED');
    }
}


function onTournamentCancelled (tournamentId) {
    $('#' + tournamentId).remove();

    for (var i = 0; i < upcomingTournaments.length; i++) {
        if (upcomingTournaments[i]._id === tournamentId) {
            upcomingTournaments.splice(i, 1);
            break;
        }
    }
}


function onTournamentEntryAdded (tournamentId, entry, updatedPayouts) {
    var tournament = findTournament(tournamentId);

    if (tournament) {
        addEntryToTournament(tournament, entry, loggedInUsername);

        updateEntryCountForTournament(tournament, updatedPayouts);
    }
}


function onTournamentEntryRemoved (tournamentId, entryId, updatedPayouts, entryUsername) {
    var tournament = findTournament(tournamentId);

    if (tournament) {
        removeEntryFromTournament(tournament, entryId, entryUsername, loggedInUsername);
        updateEntryCountForTournament(tournament, updatedPayouts);
    }
}


function onTournamentEntriesUpdate (entries) {
    if (!selectedTournament) return;

    selectedTournament.entries = entries;
    updateTournamentDetailsEntries(selectedTournament);
}


function onMatchUpdate (res) {
    if (!selectedTournament) return;

    var match = res.match;
    var oldMatch = _.find(selectedTournament.matches, {'matchId': match.matchId});

    if (!oldMatch) {
        return;
    }

    if (match.period !== oldMatch.period ||
        match.firstTeam.score !== oldMatch.firstTeamScore ||
        match.secondTeam.score !== oldMatch.secondTeamScore) {

        oldMatch.period = match.period;
        oldMatch.firstTeamScore = match.firstTeam.score;
        oldMatch.secondTeamScore = match.secondTeam.score;

        $('#summaryTableContainer').sortableClusterizeTable('merge', [oldMatch], 'matchId');
    }
}


function updateEntryCountForTournament (tournament, updatedPayouts) {
    // update contest dialog if it is open
    if (selectedTournament && selectedTournament._id === tournament._id) {
        selectedTournament.entries = tournament.entries;
        updateTournamentDetailsEntries(selectedTournament);

        if (selectedTournament.payouts !== updatedPayouts) {
            selectedTournament.payouts = updatedPayouts;
            updateTournamentPayouts(selectedTournament);
        }
    }

    // update contest row
    var tr = document.getElementById(tournament._id);
    if (!tr) return;

    if (isUserRegisterToTournament(tournament)) {
        tr.setAttribute('selected_entry', true);
    }
    else {
        tr.setAttribute('selected_entry', false);
    }

    tr.querySelector('.tournamentEntries').innerHTML = formatLobbyEntryCount(tournament);

    manageStateForOpenTournamentRow(tournament, tr);
}


function findTournament (tournamentId) {
    for (var i = 0; i < upcomingTournaments.length; i++) {
        if (upcomingTournaments[i]._id === tournamentId) {
            return upcomingTournaments[i];
        }
    }
}


function resetFilter () {
    filterSearchQuery = '';
    filterEntryFeeRange = [0, -1];
    filterTournamentTypes.length = 0;
    filterTournamentFlags.length = 0;
    filterCompetitions.length = 0;
    filterSlate = ALL_SLATES;

    $('#filterSearch').val('');

    tournamentEntryFeeRange = [0, 500];
    var $entryFeeSlider = $('#filterEntryFeeSlider').data('ionRangeSlider');
    $entryFeeSlider.update({
        from: tournamentEntryFeeRange[0],
        to: tournamentEntryFeeRange[1]
    });

    $('.filterPopBoxBody input.checkbox').each( function() {
        $(this).prop('checked', false);
    });

    $('#filterResetButton').prop('disabled', true);
}


function applyFilter (filterChanged) {

    if (filterChanged) {
        $('#filterResetButton').prop('disabled', false);
    }

    fillInTournamentsTable();
}


function isTournamentValidForFilter (tournament) {
    // for every word of the search query, check that the tournament name contains a word that starts with that one
    if (filterSearchQuery.replace(/\s/g, '').length > 0) { // skip empty query
        var queryWords = filterSearchQuery.split(/[\s-\/]/); // regex is correct but the ide is a bit off the rocker
        var tournamentWords = tournament.name.split(/[\s-\/]/);

        for (var i = 0; i < queryWords.length; i++) {
            var queryWord = queryWords[i].toLowerCase();
            var validWord = false;

            for (var j = 0; j < tournamentWords.length; j++) {
                if (tournamentWords[j].toLowerCase().indexOf(queryWord) === 0) {
                    validWord = true;
                    break;
                }
            }

            if (!validWord) return false;
        }
    }

    if (tournament.entryFee < filterEntryFeeRange[0] || (filterEntryFeeRange[1] > 0 && tournament.entryFee > filterEntryFeeRange[1])) {
        return false;
    }

    // check slate validity
    if (filterSlate !== ALL_SLATES) {
        var date = moment(tournament.startDate);
        date.add(-date.utcOffset(), 'm');
        if (isDateInDaylightSavingTime(new Date(tournament.startDate))) {
            date.add(1, 'h');
        }

        var hour = date.hours();
        var minute = date.minutes();

        if (filterSlate === EARLY_SLATE && (hour > LATE_SLATE_START_HOUR || (hour === LATE_SLATE_START_HOUR && minute >= LATE_SLATE_START_MINUTE))) {
            return false;
        }
        else if (filterSlate === LATE_SLATE && (date.hours() < LATE_SLATE_START_HOUR || (hour === LATE_SLATE_START_HOUR && minute < LATE_SLATE_START_MINUTE))) {
            return false;
        }
    }

    // check competitions
    if (filterCompetitions.length > 0) {
        for (i = 0; i < tournament.matches.length; i++) {
            var competitionId = tournament.matches[i].competitionId;
            if (filterCompetitions.indexOf(competitionId) < 0) {
                return false;
            }
        }
    }

    // check tournament types and flags
    if (filterTournamentTypes.length > 0) {
        if (filterTournamentTypes.indexOf(tournament.type) < 0) return false;
    }

    // if (filterTournamentFlags.length > 0) {
    //     if (!tournament.flags) return false;

    //     for (i = 0; i < filterTournamentFlags.length; i++) {
    //         if (tournament.flags.indexOf(filterTournamentFlags[i]) < 0) return false;
    //     }
    // }

    return true;
}


function createTournamentDetailsDialog (tournament) {
    selectedTournament = tournament;
    var tournamentState = getTournamentState(tournament);

    // fill in matches table
    var matchesData = tournament.matches;

    if (tournament.competitions.length < 2){
        matchesData.sort(function (m1, m2) {
            return new Date(m1.startDate) - new Date(m2.startDate);
        });
        matches = matchesData;
    }else{
        for (var i = 0; i < matchesData.length; i++){
            var match = matchesData[i];
            match.competitionName = _.find(tournament.competitions, {id: match.competitionId}).name;
        }

        matchesData.sort(function (m1, m2) {
            return m1.competitionName.localeCompare(m2.competitionName);
        });

        var matches = [];
        var prevCompetitionId = null;

        for (var i = 0; i < matchesData.length; i++){
            var match = matchesData[i];

            if (match.competitionId != prevCompetitionId){
                prevCompetitionId = match.competitionId;
                matches.push({
                    isLeagueHeading: true,
                    leagueLogo: logoForCompetition(prevCompetitionId, MEDIUM_LOGO),
                    leagueName: match.competitionName
                });
            }

            matches.push(match);
        }
    }

    // fill in matches table
    var matchesTable = $('#summaryTableContainer');
    if (!matchesTable.sortableClusterizeTable('isInitialized')) {
        matchesTable.sortableClusterizeTable({
            scrollId: 'summaryScrollArea',
            contentId: 'summaryTableBody',
            rows_in_block: 20,
            generateRowHtml: matchRowHtml
        });
    }
    matchesTable.sortableClusterizeTable('update', matches);

    // fill in entries table
    var entriesTable = $('#entrantsTableContainer');
    if (!entriesTable.sortableClusterizeTable('isInitialized')) {
        entriesTable.sortableClusterizeTable({
            scrollId: 'entrantsScrollArea',
            contentId: 'entrantsTableBody',
            rows_in_block: 8,
            generateRowHtml: entryRowHtml
        });
    }

    updateTournamentDetailsEntries(tournament);

    // fill in payouts table
    var payoutsTable = $('#payoutsTableContainer');
    if (!payoutsTable.sortableClusterizeTable('isInitialized')) {
        payoutsTable.sortableClusterizeTable({
            scrollId: 'payoutsScrollArea',
            contentId: 'payoutsTableBody',
            rows_in_block: 8,
            generateRowHtml: payoutRowHtml
        });
    }

    updateTournamentPayouts(tournament);

    if (tournament.payoutsEntriesNumber) {
        $('#prizePayoutsEntriesNumber').text('(by ' + tournament.payoutsEntriesNumber + ' entries)');
    }
    else {
        $('#prizePayoutsEntriesNumber').text('');
    }

    var tournamentDialog = $('#tournamentDetailsDialog');
    tournamentDialog.find('#tournamentDialogLogo').attr('src', logoForTournament(tournament, MEDIUM_LOGO));
    tournamentDialog.find('#tournamentDialogName').html(tournament.name + (tournamentState === TOURNAMENT_STATE_LIVE?"&nbsp&nbsp(Live)":""));

    var entryFeeFormat = (tournament.entryFee > 0) ? formatPrize(tournament, tournament.entryFee) : 'Free';
    tournamentDialog.find('#tournamentDialogEntryFee').text(entryFeeFormat);

    var prize = tournament.totalPrize || tournament.guaranteedPrize || 0;
    tournamentDialog.find('#tournamentDialogPrizes').text(formatPrize(tournament, prize));
    tournamentDialog.find('#tournamentDialogMultiEntries').text(tournament.multiEntries > 1 ? tournament.multiEntries : 'N/A');

    var startTime = tournamentDialog.find('#tournamentDialogStartTime');
    var draftTeamButton = tournamentDialog.find('#draftTeamButton');

    if (tournamentState === TOURNAMENT_STATE_PREMATCH) {
        startTime.text(moment(tournament.startDate).format('ddd D/M HH:mm'));
        draftTeamButton.show();
    }
    else{
        startTime.text(moment(tournament.startDate).format('ddd D/M HH:mm'));
        draftTeamButton.hide();
    }

    var endTimeContainer = $("#tournamentDialogInfoContainer .tournamentDialogInfo:last-child");
    var endTime = tournamentDialog.find('#tournamentDialogEndTime');

    if (!tournament.finishedAt){
        endTimeContainer.hide();
    }else{
        endTimeContainer.show();
    }
    endTime.text(moment(tournament.finishedAt).format('ddd D/M HH:mm'));

    var scrollTop = 0;
    tournamentDialog
        .dialog({
            dialogClass: 'noTitleStuff fixed-dialog',
            resizable: false,
            modal: true,
            autoOpen: true,
            draggable: false,
            open: function(e, ui) {
                $('#summaryScrollArea').scrollTop(0);
                $('#entrantsScrollArea').scrollTop(0);
                $('#playersScrollArea').scrollTop(0);
                $('#payoutsScrollArea').scrollTop(0);

                // bind close
                $('#tournamentDetailsDialog').unbind().bind('click', function(e) {
                    e.stopPropagation();
                });

                $('.ui-dialog.fixed-dialog, #tournamentDialogCloseButton').unbind().bind('click', function() {
                    $('#tournamentDetailsDialog').dialog('close');
                });

                $('#draftTeamButton').unbind().bind('click', function () {
                    goToDraftTeam(tournament._id);
                });

                registerTournamentDetailsUpdates(tournament);
            },
            beforeClose: function(e, ui) {
                scrollTop = $('body').scrollTop();
            },
            close: function() {
                $('body').scrollTop(scrollTop);
                removeTournamentDetailsUpdates(tournament);
                tournamentDialog.find('#tournamentDialogLogo').attr('src', '');
            }
        });
}


function updateTournamentDetailsEntries (tournament) {
    $('#tournamentDialogEntries').text(formatLobbyEntryCount(tournament));

    var entriesData = [];
    var entries = tournament.entries;
    var entriesCount = entries ? entries.length : 0;

    if (entriesCount > 0) {
        $('#noEntrantsContainer').hide();

        var tournamentState = getTournamentState(tournament);
        var isTourLive = tournamentState === TOURNAMENT_STATE_LIVE;

        for (var i = 0; i < entriesCount; i++) {
            var entry = entries[i];
            entriesData.push({ username : entry.username, points : (entry.totalPoints || 0), shouldShowPoints : isTourLive });
        }

        $('#entrantsTableContainer').sortableClusterizeTable('update', entriesData);
    }
    else {
        $('#noEntrantsContainer').show();
    }
}


function updateTournamentPayouts (tournament) {
    var payoutsData = [];
    var payouts = tournament.payouts.split(',');
    var prizeGroupStart = -1;

    for (var i = 0; i < payouts.length; i++) {
        var prize = payouts[i];

        if (i !== payouts.length - 1 && payouts[i + 1] === prize) {
            if (prizeGroupStart < 0) {
                prizeGroupStart = i;
            }

            continue;
        }

        var prizePositions = '';
        if (prizeGroupStart >= 0) {
            prizePositions = formatOrdinal(prizeGroupStart + 1) + ' - ';
            prizeGroupStart = -1;
        }
        prizePositions += formatOrdinal(i + 1);

        payoutsData.push({
            place: prizePositions,
            payout: formatPrize(tournament, prize)
        });
    }

    $('#payoutsTableContainer').sortableClusterizeTable('update', payoutsData);
}


function matchRowHtml (match) {

    if (match.isLeagueHeading){
        var html = '<div class="leagueHeadingRow">';

        html += '<div class="summaryTableData">';

        html += '<img src="' + match.leagueLogo + '" />';

        html += '<span>' + match.leagueName + '</span>';

        html += '</div>';

        html += '</dir>';

        return html;
    }

    var isUpcoming = matchIsComing(match);
    var isFinished = matchIsFinished(match);
    var isRunning = matchIsInProgress(match);
    var isAbandoned = matchIsAbandoned(match);
    var className = isUpcoming ? ' upcoming' : (isFinished ? ' finished' : ' progress');

    var html = '<tr class="dialogTableRow matchRow' + className + '">';

    html += '<td class="dialogTableData summaryTableData summaryTeamNameData firstTeamName singleLineText">' + match.firstTeamName + '</td>';

    html += '<td class="dialogTableData summaryTableData summaryTeamLogoData"><div class="teamLogoWrapper">' + '<img src="' + smallTeamLogoUrl(match.firstTeamOptasportsId) + '" data-rjs="' + mediumTeamLogoUrl(match.firstTeamOptasportsId) + '"></div></td>';

    html += '<td class="dialogTableData summaryTableData summaryTeamVsData"><span>' + ((!isUpcoming && !isAbandoned) ? (match.firstTeamScore + ' : ' + match.secondTeamScore) : 'VS') + '</span></td>';

    html += '<td class="dialogTableData summaryTableData summaryTeamLogoData"><div class="teamLogoWrapper">' + '<img src="' + smallTeamLogoUrl(match.secondTeamOptasportsId) + '" data-rjs="' + mediumTeamLogoUrl(match.secondTeamOptasportsId) + '"></div></td>';

    html += '<td class="dialogTableData summaryTableData summaryTeamNameData secondTeamName singleLineText">' + match.secondTeamName + '</td>';

    if (isUpcoming) {
        var text = moment(match.startDate).format('ddd D / MM ') + '<span>' + moment(match.startDate).format('HH:mm') + '</span>';
    }
    else if (isFinished) {
        text = '<span>' + matchPeriodToString(match).toUpperCase() + '</span>';
    }
    else {
        text = '<span>LIVE</span>';
    }
    html += '<td class="dialogTableData summaryTableData summaryStartTimeData">' + text + '</td>';

    html += '</tr>';

    return html;
}


function entryRowHtml (entry) {
    var html = '<tr class="dialogTableRow">';

    html += '<td class="dialogTableData entrantsIconData arrow"><svg width="13.51" height="12.67"><use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="/icongraphy/svg/svg-sprite.svg#svg-icon-user-icon"></use></svg></td>';

    html += '<td class="dialogTableData entrantsNameData">' + entry.username + '</td>';

    html += '<td class="dialogTableData entrantsPointsData">' + (entry.shouldShowPoints ? formatNumber(entry.points) : '') + '</td>';

    html += '</tr>';

    return html;
}


function payoutRowHtml (item) {
    var html = '<tr class="dialogTableRow">';

    html += '<td class="dialogTableData prizePlaceData arrow">' + item.place + '</td>';

    html += '<td class="dialogTableData prizePayoutData">' + item.payout + '</td>';

    html += '</tr>';

    return html;
}


function getProperArrayForTournament (tournament) {
    if (tournament.isActive) {
        return liveTournaments;
    }

    if (tournament.isOpen) {
        return upcomingTournaments;
    }

    return historyTournaments;
}


function isUserRegisterToTournament (tournament) {
    return tournament.userEntriesCount > 0;
}