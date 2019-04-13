var socket = io();

var loggedInUsername;
var tournament;
var tournamentState;
var allPlayersActions = [];
var allUserActions = [];
var matchTimers = [];
var previousPage;
var summaryDialogOpenForPlayerId;

var defaultEntryId;
var selectedEntry;
var userEntries = [];
var userEntriesPlayersIds = '';

var matches;
var selectedMatches = {}; // maps matches to their ids
var matchColors = {}; // maps match ids to colors
var allPlayers; // maps all players to their ids
var previousPlayers = []; // keeps previous players data
var playersUsages = []; // maps the ids of all the players with their % of usage among all user

var sentMessagesTimestamps = [];
var isChatBlocked = false;

var isNowPlayingEnabled = false;
var isYourPlayersEnabled = false;
var areNonUserEventsEnabled = false;
var isMajorEventsEnabled = false;

var isWaitingForPlayersActions = false;
var hasReachedPlayersActionsEnd = false;
var currentlyShownEventsSize;

var pointsSystem;

const majorEventPoint = 50;
const hugeEventPoint = 500;

const LINEUP_POS_COOR_7P = {
    [GK_POS] : {
        1: [{x: 220, y: 51}]
    },
    [DEF_POS] : {
        1: [{x: 220, y: 183}],
        2: [{x: 140,  y: 183}, {x: 300, y: 183}],
        3: [{x: 75,  y: 183}, {x: 220, y: 183}, {x: 365, y: 183}]
    },
    [MID_POS] : {
        1: [{x: 220, y: 315}],
        2: [{x: 140,  y: 315}, {x: 300, y: 315}],
        3: [{x: 75,  y: 315}, {x: 220, y: 315}, {x: 365, y: 315}]
    },
    [ATT_POS] : {
        1: [{x: 220, y: 447}],
        2: [{x: 140,  y: 447}, {x: 300, y: 447}]
    }
};

var palette = [
    '#FF931E',
    '#26B999',
    '#8E44AD',
    '#E74C3C',
    '#3498DB',
    '#53A51E',
    '#FF931E',
    '#26B999',
    '#8E44AD',
    '#E74C3C',
    '#F39C12',
    '#F74906',
    '#3498DB',
    '#53A51E',
    '#FF931E',
    '#26B999',
    '#8E44AD',
    '#E74C3C',
    '#F39C12',
    '#F74906',
    '#3498DB',
    '#53A51E'
];


$ (function () {

    // showing loading spinner
    $('body').loading();

    initUI();
    initTimers();

    // get tournament id and entry id from query
    var arr = location.search.split('&');

    for (var i = 0; i < arr.length; i++) {
        var q = arr[i];

        if (q.indexOf('id') >= 0) {
            var tournamentId = q.substring(q.indexOf('=') + 1);
        }
        else if (q.indexOf('entry') >= 0) {
            defaultEntryId = q.substring(q.indexOf('=') + 1);
        }
        else if (q.indexOf('from') >= 0) {
            previousPage = decodeURI(q.substring(q.indexOf('=') + 1));
        }
    }

    if (!tournamentId) {
        goToContests();
        return;
    }

    $.ajax(
        {
            type : 'GET',
            dataType : 'JSON',
            url : '/api/getTournamentOverview',
            data : { id : tournamentId },
            statusCode : {
                200 : function (res) {

                    loggedInUsername = res.username;
                    tournament = res.tournament;
                    matches = res.tournament.matches;

                    initWithTournament(tournament);
                    initWithMatches(matches);
                    initFilters();

                    setupPlayersActionsTable();
                    if (res.tournament.playersActions) {
                        initWithPlayersActions(res.tournament.playersActions, res.tournament.userActions);
                    }

                },
                400 : function (err) {
                    createErrorDialog('Get contest failed', err.responseText);
                },
                401 : function () {
                    goToLogin();
                },
                404 : function () {
                    createErrorDialog('Get contest failed', 'The contest could not be found.');
                },
                501 : function (err) {
                    createErrorDialog('Get contest failed', err.responseText);
                }
            }
        }
    );
});


function initWithTournament (tournament) {
    // handle back to lobby button
    $('#tournamentBackToLobby').click(function() {
        if (previousPage) {
            window.location.href = '/' + previousPage;
        }
        else {
            goToContests();
        }
    });

    // look for user entries
    if (isUserLoggedIn()) {
        for (var i = 0; i < tournament.entries.length; i++) {
            var entry = tournament.entries[i];
            if (entry.username === loggedInUsername) {
                userEntries.push(entry);
                userEntriesPlayersIds += entry.playersIds + ',';

                if (defaultEntryId) {
                    if (entry.entryId === defaultEntryId) {
                        selectedEntry = entry;
                    }
                }
                else if (!selectedEntry || entry.totalPoints > selectedEntry.totalPoints) {
                    selectedEntry = entry;
                }
            }
        }

        if (userHasEntries()) {
            showUserRelatedStuff();
        }
    }

    tournamentState = getTournamentState(tournament);

    // calculate players usages percentages: first count all the players occurrences, then calculate %
    if (tournamentState !== TOURNAMENT_STATE_PREMATCH && tournament.entries && tournament.entries.length > 0) {
        updatePlayersUsages();
    }

    setupTournamentInfo();
    setupRankingTable();
    updateCurrentStatus();
    updateTournamentStatus();

    $('#tournamentPayoutsButton').on('click', function () {
        createPrizePayoutsDialog();
    });

    $('#addNewEntryButton').on('click', function () {
        goToDraftTeam(tournament._id);
    });

    $('#eventsDescriptionButton').on('click', function () {
        if (!pointsSystem) {
            requestPointsSystem();
        }
        else {
            createPointsSystemDialog(pointsSystem);
        }
    });

    $(document).on('mouseenter', '.rankingProgress', function () {
        var progressBar = $(this).find('.rankingProgressBar');
        var percentage = progressBar.data('percentage');
        var tooltipText = $(this).find('.rankingTooltipText');
        tooltipText.text(percentage + '%');
    });

    socket.on('tournamentStarted:' + tournament._id, function (res) {
        onTournamentStarted(res);
    });

    socket.on('tournamentUpdate:' + tournament._id, function (res) {
        onTournamentUpdate(res);
    });

    socket.on('tournamentFinished:' + tournament._id, function () {
        onTournamentFinished();
    });

    socket.on('tournamentCancelled:' + tournament._id, function () {
        tournament.isCancelled = true;
        onTournamentFinished();
        updateCurrentStatus();
    });

    socket.on('tournamentEntryAdded:' + tournament._id, function (res) {
        onTournamentEntryAdded(res.entry, res.payouts);
    });

    socket.on('tournamentEntryRemoved:' + tournament._id, function (res) {
        onTournamentEntryRemoved(res.entryId, res.payouts);
    });

    socket.on('newChatMessage:' + tournament._id, function (res) {
        if (res.username !== loggedInUsername) {
            insertChatMessage(res.username, res.message, res.timestamp);
        }
    });

    // load chat history
    $.ajax(
        {
            type : 'GET',
            dataType : 'JSON',
            data : { id : tournament._id },
            url : '/api/getChatHistory',
            statusCode : {
                200 : function (res) {
                    if (userHasEntries()) {
                        $('#chatInputContainer').removeAttr('blocked');
                        isChatBlocked = false;
                    }

                    if (res.length > 0) {
                        var message = JSON.parse(res[0]);
                        var timestamp = message.timestamp - 60000;  // set time 1 min forward
                    }
                    else {
                        timestamp = Date.now();
                    }

                    var msg = 'Welcome to the contest: ' + tournament.name + '. Enjoy the game!';
                    insertChatMessage('DC Team', msg, timestamp);

                    for (var i = res.length - 1; i >= 0; i--) {
                        message = JSON.parse(res[i]);
                        insertChatMessage(message.username, message.message, message.timestamp);
                    }
                },
                400 : function (err) {
                    createErrorDialog('Get chat history failed', err.responseText);
                },
                501 : function (err) {
                    createErrorDialog('Get chat history failed', err.responseText);
                }
            }
        }
    );
}


function initWithMatches (matches) {
    // init user players
    allPlayers = {};

    matches.sort(function (m1, m2) {
        return new Date(m1.startDate) - new Date(m2.startDate);
    });

    for (var i = 0; i < matches.length; i++) {
        var match = matches[i];
        matchColors[match.matchId] = palette[i % palette.length];

        for (var j = 0; j < 2; j++) {
            var team = (j === 0) ? match.firstTeam : match.secondTeam;

            if (team.players) {
                for (var k = 0; k < team.players.length; k++) {
                    var player = team.players[k];
                    player.name = formatPlayerName(player);
                    player.matchId = match.matchId;
                    player.teamId = team.teamId;
                    player.teamName = team.teamName;
                    player.teamOptasportsId = team.optasportsId;
                    allPlayers[player.playerId] = player;
                }
            }
        }
    }

    setupMatchesViews(matches);
    setupEntriesViews(userEntries);
    setupPlayersTable(matches);

    var matchUpdateCallback = function (res, err) {
        if (!err) {
            onMatchUpdate(res.match, res.updatedPlayersActions);
        }
    };

    for (i = 0; i < matches.length; i++) {
        socket.on('matchUpdate:' + matches[i].matchId, matchUpdateCallback);
    }
}


function initWithPlayersActions (playersActions, userActions) {
    for (var j = 0; j < playersActions.length; j++) {
        allPlayersActions = allPlayersActions.concat(createActionsFromObject(playersActions[j]));
    }

    if (userActions) {
        for (j = 0; j < userActions.length; j++) {
            allUserActions = allUserActions.concat(createActionsFromObject(userActions[j]));
        }
    }

    fillInPlayersActionsTable();
}


function createActionsFromObject (actionObj) {
    var actions = actionObj.actions.split(';');
    var player = getPlayer(actionObj.playerId);

    if (!player) return [];

    var res = [];

    for (var a = 0; a < actions.length; a++) {
        var action = parseAction(actions[a]);

        if (!action) continue;

        res.push({
            name : action.name,
            points : action.points,
            count : action.count,
            matchTime : actionObj.min,
            timestamp : actionObj.t,
            matchId : actionObj.matchId,
            player : player,
            isUpdate: false,
            isCorrection: action.count < 0
        });
    }

    return res;
}


function initUI () {
    retinajs($('#tournamentStadium'));

    setupChat();
    hideUserRelatedStuff();
}


function hideUserRelatedStuff () {
    $('#yourEventsFilterContainer').hide();
    $('#yourPlayersFilterContainer').hide();
    $('#addNewEntryButton').hide();
    $('#userEntries').hide();
    isYourPlayersEnabled = false;
    areNonUserEventsEnabled = true;
}


function showUserRelatedStuff () {
    $('#yourEventsFilterContainer').show();
    $('#yourPlayersFilterContainer').show();
    $('#userEntries').show();
    isYourPlayersEnabled = true;
    areNonUserEventsEnabled = false;

    if (userEntries.length !== tournament.multiEntries) {
        $('#addNewEntryButton').show();
    }
}


function initTimers () {
    setInterval(function () {
        // update match timers
        for (var i = 0; i < matchTimers.length; i++) {
            matchTimers[i].update();
        }

        // update new action rows highlight
        updatePlayersActionsTable();
    }, 1000);
}


function initFilters () {
    if (isYourPlayersEnabled) {
        $('#playerYourPlayersButton').addClass('selected');
    }
    else {
        $('#playerAllPlayersButton').addClass('selected');
    }

    if (isNowPlayingEnabled) {
        $('#playerNowPlayingButton').addClass('selected');
    }
    else {
        $('#playerAllPlayingButton').addClass('selected');
    }

    if (areNonUserEventsEnabled) {
        $('#eventAllPlayersButton').addClass('selected');
    }
    else {
        $('#eventYourPlayersButton').addClass('selected');
    }

    if (isMajorEventsEnabled) {
        $('#eventMajorEventButton').addClass('selected');
    }
    else {
        $('#eventAllEventButton').addClass('selected');
    }

    $('.filterYourPlayersButton').on('click', function () {
        if ($(this).hasClass('selected')) return;
        $(this).addClass('selected');

        if ($(this).prop('id') === 'playerYourPlayersButton') {
            isYourPlayersEnabled = true;
            $('#playerAllPlayersButton').removeClass('selected');
        }
        else if ($(this).prop('id') === 'playerAllPlayersButton') {
            isYourPlayersEnabled = false;
            $('#playerYourPlayersButton').removeClass('selected');
        }
        fillInPlayersTable();
    });

    $('.filterNowPlayingButton').on('click', function () {
        if ($(this).hasClass('selected')) return;
        $(this).addClass('selected');

        if ($(this).prop('id') === 'playerNowPlayingButton') {
            isNowPlayingEnabled = true;
            $('#playerAllPlayingButton').removeClass('selected');
        }
        else if ($(this).prop('id') === 'playerAllPlayingButton') {
            isNowPlayingEnabled = false;
            $('#playerNowPlayingButton').removeClass('selected');
        }
        fillInPlayersTable();
    });

    $('.filterYourEventsButton').on('click', function () {
        if ((tournamentState === TOURNAMENT_STATE_PREMATCH) || $(this).hasClass('selected')) return;
        $(this).addClass('selected');

        if ($(this).prop('id') === 'eventYourPlayersButton') {
            areNonUserEventsEnabled = false;
            $('#eventAllPlayersButton').removeClass('selected');
        }
        else if ($(this).prop('id') === 'eventAllPlayersButton') {
            areNonUserEventsEnabled = true;
            $('#eventYourPlayersButton').removeClass('selected');
        }
        fillInPlayersActionsTable();
    });

    $('.filterMajorEventsButton').on('click', function () {
        if ((tournamentState === TOURNAMENT_STATE_PREMATCH) || $(this).hasClass('selected')) return;
        $(this).addClass('selected');

        if ($(this).prop('id') === 'eventMajorEventButton') {
            isMajorEventsEnabled = true;
            $('#eventAllEventButton').removeClass('selected');
        }
        else if ($(this).prop('id') === 'eventAllEventButton') {
            isMajorEventsEnabled = false;
            $('#eventMajorEventButton').removeClass('selected');
        }
        fillInPlayersActionsTable();
    });
}


function updateTournamentLayout () {
    if (tournamentState === TOURNAMENT_STATE_PREMATCH) {
        $('#tournamentStatusLiveInContainer').show();
    }
    else {
        if (isUserLoggedIn() && userHasEntries()) {
            $('#tournamentResultContainer').show();
        }

        $('#eventYourPlayersButton').addClass('selected');
        $('#eventAllEventButton').addClass('selected');

        if (tournamentState === TOURNAMENT_STATE_HISTORY) {
            $('#tournamentStatusLiveContainer').hide();
            $('#tournamentCurrentPlaceContainer').hide();
            $('#tournamentCurrentPayoutContainer').hide();
            $('#tournamentResultInner').addClass('tournamentFinished');
            $('#tournamentResultPayoutContainer').show();

            $('#tournamentStatusFinishContainer').show();
            $('#tournamentFinishTitle').text(tournament.isCancelled ? 'CANCELLED AT: ' : 'FINISHED AT: ');
            $('#tournamentFinishTimeText').text(moment(tournament.finishedAt).format('HH:mm DD MMM'));
        }
        else {
            $('#tournamentStatusLiveInContainer').hide();
            $('#tournamentStatusLiveContainer').show();
            $('#tournamentCurrentPlaceContainer').show();
            $('#tournamentCurrentPlace sup').show();
            $('#tournamentCurrentPayoutContainer').show();
            $('#tournamentCurrentPayout sup').show();
            $('.matchView').removeClass('tourPreMatch');
        }
    }

    updateEntryModalIndicators();
}


function setupChat () {
    var chatInput = $('#chatInput');

    $('#chatInputContainer').attr('blocked', true);
    isChatBlocked = true;

    chatInput.bind("enterKey", function (e) {
        if (isChatBlocked) return;

        var chatInput = $(this);
        var message = chatInput.val();
        message = escapeHtml(message);
        chatInput.val('');

        var now = Date.now();

        socket.emit('sendChatMessage', {
            message : message,
            username : loggedInUsername,
            timestamp : now,
            tournamentId : tournament._id
        });

        if (sentMessagesTimestamps.length >= 6) {
            if (now - sentMessagesTimestamps[3] < 12000) {
                isChatBlocked = true;
                $('#chatInputContainer').attr('blocked', true);
                alert('You are sending messages too often. Your chat is blocked for 120 seconds.');

                setTimeout(function () {
                    isChatBlocked = false;
                    $('#chatInputContainer').removeAttr('blocked');
                }, 120000);
            }
        }

        if (!isChatBlocked) {
            sentMessagesTimestamps.unshift(Date.now());

            insertChatMessage(loggedInUsername, message);
        }
    });

    chatInput.keyup(function(e){
        if(e.keyCode == 13) {
            $(this).trigger("enterKey");
        }
    });

    // initialize sortable clusterize table
    $('#chatTableContainer').sortableClusterizeTable({
        scrollId: 'chatScrollArea',
        contentId: 'chatTableBody',
        generateRowHtml: chatMessageRowHtml,
        rows_in_block: 5,
        scrollToBottom: true
    });
}


function setupTournamentInfo () {
    var title = $('#tournamentTitle');
    title.text(tournament.name);

    var flag = $('#tournamentFlag');
    flag.attr('src', logoForTournament(tournament, MEDIUM_LOGO));

    if (isTournamentFeatured(tournament)) {
        $('#tournamentFeatured').show();
    }

    var entries = $('#tournamentEntries');
    var entriesCount = tournament.entries ? tournament.entries.length : 0;
    entries.text(formatEntryCount(entriesCount, tournament.maxEntries));

    $('#tournamentEntryFee').text(formatPrize(tournament, tournament.entryFee));

    $('#tournamentPrizePool').text(tournamentTotalPrize(tournament));

    if (isFreePlayMode()) {
        $('.tournamentResultMainInfo').addClass('freePlay');
        $('.tournamentResultMainInfo sup.payouts').text('PTS');
    }

    if (tournamentState === TOURNAMENT_STATE_PREMATCH) {
        $.timer(tournament.startDate, endTournamentTimer, $('#upcomingTimer'));
    }

    updateTournamentLayout();
}


function setupMatchesViews (matches) {
    var container = $('#matchesContainer');

    for (var i = 0; i < matches.length; i++) {
        var sliderClassName = 'slider-item-' + Math.floor(i / 7);
        var sliderItem = container.find('#' + sliderClassName);
        if (sliderItem.length == 0) {
            sliderItem = $('<div id="' + sliderClassName + '" class="slider-item"></div>').appendTo(container);
        }

        var match = matches[i];
        selectedMatches[match.matchId] = match;

        var startDate = moment(match.startDate);
        var timestamp = (startDate.unix() * 1000);
        var isPreMatch = startDate.isAfter(moment());

        var matchView = document.createElement('DIV');
        matchView.setAttribute('id', 'm' + match.matchId);
        matchView.setAttribute('selected', true);
        matchView.className = 'matchView';

        var matchViewHeader = document.createElement('DIV');
        matchViewHeader.className = 'matchViewHeader';
        matchView.appendChild(matchViewHeader);

        var tourLogoWrapper = document.createElement('DIV');
        tourLogoWrapper.className = 'matchTourLogoWrapper';
        matchViewHeader.appendChild(tourLogoWrapper);

        var imgTourLogo = document.createElement('IMG');
        imgTourLogo.className = 'matchTourLogo';
        imgTourLogo.src = logoForCompetition(match.competitionId, SMALL_LOGO);
        tourLogoWrapper.appendChild(imgTourLogo);

        var matchStatusText = document.createElement('P');
        matchStatusText.className = 'matchStatusText';
        matchStatusText.style.backgroundColor = matchColors[match.matchId];
        matchViewHeader.appendChild(matchStatusText);

        var matchHeaderArrow = document.createElement('SPAN');
        matchHeaderArrow.className = 'matchHeaderArrow';
        matchHeaderArrow.style.backgroundColor = matchColors[match.matchId];
        matchView.appendChild(matchHeaderArrow);

        var matchViewBody = document.createElement('DIV');
        matchViewBody.className = 'matchViewBody';
        matchView.appendChild(matchViewBody);

        var matchViewTeams = document.createElement('DIV');
        matchViewTeams.className = 'matchViewTeams';
        matchViewBody.appendChild(matchViewTeams);

        var matchViewInner = document.createElement('DIV');
        matchViewInner.className = 'matchViewInner';
        matchViewTeams.appendChild(matchViewInner);

        var teamView = document.createElement('DIV');
        teamView.className = 'teamView';
        matchViewInner.appendChild(teamView);

        var teamName = document.createElement('SPAN');
        teamName.className = 'teamName singleLineText';
        teamName.innerHTML = match.firstTeam.abbreviation;
        teamView.appendChild(teamName);

        var teamLogo = document.createElement('DIV');
        teamLogo.className = 'teamLogo';
        teamView.appendChild(teamLogo);

        var teamLogoWrapper = document.createElement('DIV');
        teamLogoWrapper.className = 'teamLogoWrapper';
        teamLogo.appendChild(teamLogoWrapper);

        var imgTeamLogo = document.createElement('IMG');
        imgTeamLogo.className = 'matchTeamsLogo matchFirstTeamLogo';
        imgTeamLogo.src = smallTeamLogoUrl(match.firstTeam.optasportsId);
        imgTeamLogo.setAttribute('data-rjs', mediumTeamLogoUrl(match.firstTeam.optasportsId));
        teamLogoWrapper.appendChild(imgTeamLogo);

        var scoreContainer = document.createElement('DIV');
        scoreContainer.className = 'matchScoreContainer';
        teamView.appendChild(scoreContainer);

        var timeText = document.createElement('P');
        timeText.className = 'matchStartTimeText';
        timeText.id = match.matchId;
        if (isPreMatch && startDate.isBefore(moment().add(24, 'h'))) {
            timeText.className += ' matchTimer';
        }
        else {
            timeText.innerHTML = formatStartTimeTextForMatch(match);
        }
        scoreContainer.appendChild(timeText);

        var scoreText = document.createElement('P');
        scoreText.className = 'matchScoreText';
        scoreText.innerHTML = match.firstTeam.score + " : " + match.secondTeam.score;
        scoreContainer.appendChild(scoreText);

        teamLogo = document.createElement('DIV');
        teamLogo.className = 'teamLogo';
        teamView.appendChild(teamLogo);

        teamLogoWrapper = document.createElement('DIV');
        teamLogoWrapper.className = 'teamLogoWrapper';
        teamLogo.appendChild(teamLogoWrapper);

        imgTeamLogo = document.createElement('IMG');
        imgTeamLogo.className = 'matchTeamsLogo matchFirstTeamLogo';
        imgTeamLogo.src = smallTeamLogoUrl(match.secondTeam.optasportsId);
        imgTeamLogo.setAttribute('data-rjs', mediumTeamLogoUrl(match.secondTeam.optasportsId));
        teamLogoWrapper.appendChild(imgTeamLogo);

        teamName = document.createElement('SPAN');
        teamName.className = 'teamName singleLineText';
        teamName.innerHTML = match.secondTeam.abbreviation;
        teamView.appendChild(teamName);

        //add progress bar
        var progressContainer = document.createElement('DIV');
        progressContainer.className = 'matchProgressContainer';
        matchViewBody.appendChild(progressContainer);

        var progressBar = document.createElement('DIV');
        progressBar.className = 'matchProgressBar';
        progressContainer.appendChild(progressBar);

        sliderItem[0].appendChild(matchView);

        if ($(timeText).hasClass('matchTimer')) {
            var timer = new Timer($(timeText), timestamp, 300, function(endTimer) {     // highlight time text in 5 mins
                var matchView = $(endTimer.element).closest('.matchView');
                matchView.addClass('matchStarted');
            });
            timer.update();
            matchTimers.push(timer);
        }

        updateMatchView(match);
    }

    container.on('init', function(event, slick) {
        if ($(this).find('.slider-item').length > 1) {
            $('.matchArrowButton').show();
        }

        $('#matchArrowLeftButton').on('click', function() {
            slick.slickPrev();
        });
        $('#matchArrowRightButton').on('click', function() {
            slick.slickNext();
        });
    });

    container.slick({
        arrows: false
    });
}


function formatStartTimeTextForMatch (match) {
    return 'Starts At<br><span>' + moment(match.startDate).format('H:mm') + '</span>'
}


function tournamentTotalPrize(tour) {
    var prize = tour.totalPrize || tour.guaranteedPrize || 0;
    return formatPrize(tour, prize);
}


function setupEntriesViews (entries) {
    var entriesContainer = $('#entriesContainer');

    entriesContainer.empty();
    entriesContainer.removeClass();

    var canAddNewEntry = (tournamentState === TOURNAMENT_STATE_PREMATCH && userEntries.length < tournament.multiEntries);
    $('#addNewEntryButton').prop('disabled', !canAddNewEntry);

    var $userEntries = $('#userEntries');
    if (!userHasEntries()) {
        $userEntries.addClass('noEntries');
        return;
    }

    $userEntries.removeClass('noEntries');

    var entryCount = entries.length;
    var className = (entryCount === 1) ? "singleEntry" : ((entryCount === 2) ? "doubleEntry" : "multipleEntry");

    for (var i = 0; i < entryCount; i++) {
        var entry = entries[i];

        var isSelected = (selectedEntry && entry.entryId === selectedEntry.entryId);
        var entryView = document.createElement('DIV');
        entryView.setAttribute('id', 'e' + entry.entryId);
        entryView.className = 'entryView ' + className;
        if (isSelected) {
            entryView.setAttribute('selected', true);
        }
        entryView.addEventListener('click', (function() {
            entryViewSelected(this);
        }).bind(entry));

        var lineupHTML = '';
        var playersIds = entry.playersIds.split(',');

        for (var j = 0; j < playersIds.length; j++) {
            var player = getPlayer(playersIds[j]);
            var playerName = player ? formatPlayerNameShort(player) : "";
            var playerPosition = player ? getShortPositionForPlayer(player) : "";
            var playerNumber = getJerseyNumber(player);

            if (entryCount === 1) {
                lineupHTML +=   '<div class="entryLineupPlayer">' +
                    '<img class="entryPlayerAvatar" src="' + (mediumPlayerAvatarUrl(player) || '/icongraphy/svg/icon-no-photo.svg') + '"/>' +
                    '<div class="entryTeamLogoWrapper">' +
                    '<img class="entryTeamLogo" src="' + smallTeamLogoUrl(player.teamOptasportsId) + '"/>' +
                    '</div>' +
                    '<p class="entryPlayerPosition">' + playerPosition + '</p>' +
                    '<p class="entryPlayerName">';

                if (playerNumber) {
                    lineupHTML += '<span>' + playerNumber + '.</span>';
                }
                lineupHTML += playerName + '</p></div>';
            }
            else if (entryCount === 2) {
                if ((j % 2) === 0)
                    lineupHTML += '<div class="entryLineupPlayer">';

                lineupHTML += '<p class="singleLineText"><span>';
                if (playerNumber) {
                    lineupHTML += playerNumber + '.</span>';
                }
                lineupHTML += playerName + '</p>';

                if (j === 6)
                    lineupHTML += '<p>&nbsp;</p>';

                if ((j % 2) === 1)
                    lineupHTML += '</div>'
            }
            else {
                lineupHTML += '<span><span>' + playerNumber + '.</span>' + playerName + '</span>';
            }
        }

        if (entryCount < 3) {
            lineupHTML = '<div class="entryLineupPlayers">' + lineupHTML + '</div>';
        }

        var formation = formatFormation(getFormationFromEntry(entry));

        var formationText = document.createElement('P');
        formationText.className = 'entryFormation';
        formationText.innerHTML = 'Formation:';
        entryView.appendChild(formationText);

        var formationLabel = document.createElement('SPAN');
        formationLabel.className = 'entryFormationText';
        formationLabel.innerHTML = formation;
        formationText.appendChild(formationLabel);

        var lineupContainer = document.createElement('DIV');
        lineupContainer.className = 'entryLineupContainer';
        entryView.appendChild(lineupContainer);

        var imgLineup = document.createElement('IMG');
        imgLineup.className = 'entryLineupImage';
        imgLineup.width = 31;
        imgLineup.height = 45;
        imgLineup.src = '/icongraphy/svg/icon-tour-formation-' + formation + '.svg';
        lineupContainer.appendChild(imgLineup);

        var lineupText = document.createElement('DIV');
        lineupText.className = 'entryLineupText';
        lineupText.innerHTML = lineupHTML;
        lineupContainer.appendChild(lineupText);

        var pointsText = document.createElement('P');
        pointsText.className = 'entryPoints';
        pointsText.innerHTML = formatNumber(entry.totalPoints) + ' pts';
        entryView.appendChild(pointsText);

        var payoutText = document.createElement('P');
        payoutText.className = 'entryPayout';
        payoutText.innerHTML = formatPrize(tournament, Math.round(entry.prize));
        entryView.appendChild(payoutText);

        entriesContainer[0].appendChild(entryView);
    }

    entriesContainer.addClass(className);
}


function entryViewSelected (entry) {
    var entriesViews = $('.entryView');

    for (var i = 0; i < entriesViews.length; i++) {
        var view = entriesViews[i];
        if (view.id === 'e' + entry.entryId) {

            if ($(view).attr('selected')) {
                return;
            }
            $(view).attr('selected', true);
        }
        else {
            $(view).removeAttr('selected');
        }
    }

    // change selected row in ranking table
    if (selectedEntry) {
        $('#r' + selectedEntry.entryId).removeAttr('selected_entry');
    }
    $('#r' + entry.entryId).attr('selected_entry', true);

    selectedEntry = entry;

    updateCurrentStatus();
    fillInRankingTable();
    fillInPlayersTable();
    fillInPlayersActionsTable();
}


function updateEntriesViews () {
    var entriesViews = $('.entryView');

    for (var i = 0; i < entriesViews.length; i++) {
        var entryView = $(entriesViews[i]);
        var entry = findUserEntryById(entryView.attr('id').substring(1));

        entryView.find('.entryPayout').text(formatMoney(entry.prize));
        entryView.find('.entryPoints').text(formatNumber(entry.totalPoints) + ' pts');
    }
}


function matchViewSelected (match, view) {
    if (selectedMatches[match.matchId]) {
        delete selectedMatches[match.matchId];
        view.removeAttr('selected');
    }
    else {
        selectedMatches[match.matchId] = match;
        view.attr('selected', true);
    }

    fillInPlayersTable();
    fillInPlayersActionsTable();
}


function setupRankingTable () {
    var tableHead = document.createElement('thead');

    var header = document.createElement('tr');
    tableHead.appendChild(header);

    var th = document.createElement('th');
    th.className = 'tableHead rankingHeader rankingUser';
    th.setAttribute('data-sort', 'string');
    th.innerHTML = 'User';
    header.appendChild(th);

    th = document.createElement('th');
    th.className = 'tableHead rankingHeader rankingPoints';
    th.innerHTML = 'Points';
    header.appendChild(th);

    th = document.createElement('th');
    th.className = 'tableHead rankingHeader rankingPrize';
    th.innerHTML = 'Prize';
    header.appendChild(th);

    th = document.createElement('th');
    th.className = 'tableHead rankingHeader rankingProgress';
    th.innerHTML = 'Progress';
    header.appendChild(th);

    th = document.createElement('th');
    th.className = 'tableHead rankingHeader rankingProj';
    th.innerHTML = 'Proj, Score';
    header.appendChild(th);

    var headTable = $('#rankingHeadTable');
    headTable[0].appendChild(tableHead);

    // initialize sortable clusterize table
    $('#rankingTableContainer').sortableClusterizeTable({
        scrollId: 'rankingScrollArea',
        contentId: 'rankingTableBody',
        generateRowHtml: rankingRowHtml
    });

    $('#rankingTableBody').on('click', 'tr', function () {
        var entryId = $(this).prop('id').substring(1);
        var entries = tournament.entries;

        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];

            if (entry.entryId === entryId) {
                createEntryDetailsDialog(entry);
                break;
            }
        }
    });

    if (!tournament) return;

    fillInRankingTable(tournament);
}


function fillInRankingTable (tournament) {

    if (!tournament) return;

    sortEntries(tournament);

    var data = [];

    for (var i = 0; i < tournament.entries.length; i++) {
        data.push({
            entry: tournament.entries[i],
            pos: i
        });
    }

    $('#rankingTableContainer').sortableClusterizeTable('update', data);
    drawClusterizeHeadTable($('#rankingTable'));

    var noUsersContainer = $('#noUsersContainer');
    if (data.length > 0) {
        noUsersContainer.hide();
    }
    else {
        noUsersContainer.show();
    }
}


function rankingRowHtml (item) {
    var entry = item.entry;
    var pos = item.pos;

    var html = '<tr id="r' + entry.entryId + '" class="tableRow rankingRow' + (tournamentState === TOURNAMENT_STATE_PREMATCH ? ' tourPreMatch' : '') + '"' + (isSelectedUserEntry(entry) ? ' selected_entry="true"' : '') + '>';

    html += '<td class="tableData rankingData rankingUser singleLineText"><span class="rankingNumber">' + (pos + 1) + '</span>' + entry.title + '<div class="rowIndicator"></div><div class="hoverIndicator"></div></td>';

    var points = entry.totalPoints;
    var formattedPoints = (tournamentState !== TOURNAMENT_STATE_PREMATCH) ? formatNumber(points) : '0';
    html += '<td class="tableData rankingData rankingPoints rankingArrow"><p class="rankingPointsText">' + formattedPoints + '</p></td>';

    var formattedPrize = (tournamentState === TOURNAMENT_STATE_PREMATCH) ? '' : formatPrize(tournament, Math.round(entry.prize));
    html += '<td class="tableData rankingData rankingPrize">' + formattedPrize + '</td>';

    var progress = entry.hasOwnProperty('progress') ? entry.progress : 0;
    html += '<td class="tableData rankingData rankingProgress"><div class="hasTooltip rankingProgressContainer"><div class="rankingProgressBar" data-percentage="' + progress + '" style="width: ' + progress + '%;"></div><div class="tooltipBox rankingTooltipContainer"><span class="tooltipInner rankingTooltipText"></span></div></div></td>';

    html += '<td class="tableData rankingData rankingProj rankingArrow"><p class="rankingProjText">' + formatNumberShort(entry.projectedPoints) + '</p></td>';

    html += '</tr>';

    return html;
}


function updateCurrentStatus () {
    if (!userHasEntries() || tournamentState === TOURNAMENT_STATE_PREMATCH) return;

    var currentPlace = -1;
    for (var i = 0; i < tournament.entries.length; i++) {
        var entry = tournament.entries[i];
        if (isSelectedUserEntry(entry)) {
            currentPlace = i + 1;
            break;
        }
    }

    var ordinalSuffix = formatOrdinalSuffix(currentPlace);
    if (tournamentState === TOURNAMENT_STATE_LIVE) {
        $('#tournamentCurrentPlaceText').text(currentPlace);
        $('#tournamentCurrentPlace sup').text(ordinalSuffix);
        $('#tournamentCurrentPayoutText').text(formatNumberShort(selectedEntry.prize));
    }
    else if (tournamentState === TOURNAMENT_STATE_HISTORY) {
        var resultPlaceDesc = $('#tournamentResultPlaceDesc');
        if (tournament.isCancelled === true) {
            resultPlaceDesc.html('The contest has been <span>cancelled</span>.<br>We have refunded your entry fee.');
            resultPlaceDesc.removeClass('won');
            $('#tournamentResultPayout').hide();
        }
        else if (selectedEntry.prize > 0) {
            resultPlaceDesc.html('You Finished <span>' + currentPlace + ordinalSuffix + '</span>. Congratulations, You Won!');
            resultPlaceDesc.addClass('won');
            $('#tournamentResultPayout').show();
            $('#tournamentResultPayoutText').text(formatNumber(selectedEntry.prize));
        }
        else {
            resultPlaceDesc.html('You finished <span>' + currentPlace + ordinalSuffix + '</span>.<br>Sorry, you did not end in the money.');
            resultPlaceDesc.removeClass('won');
            $('#tournamentResultPayout').hide();
        }
    }
}


function setupPlayersTable (tournamentMatches) {
    var className = (tournamentState !== TOURNAMENT_STATE_PREMATCH) ? '' : ' tourPreMatch';

    var tableHead = document.createElement('thead');

    var header = document.createElement('tr');
    tableHead.appendChild(header);

    var th = document.createElement('th');
    th.className = 'tableHead playerHeader playerName' +  className;
    th.setAttribute('data-sort', 'string');
    header.appendChild(th);

    var button = document.createElement('button');
    button.className = 'playerHeaderText';
    button.innerHTML = 'Player';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'tableHead playerHeader playerPoints' + className;
    th.setAttribute('data-sort', 'int');
    th.setAttribute('data-sort-default', 'desc');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'playerHeaderText';
    button.innerHTML = 'Points';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'tableHead playerHeader playerPosition' +  className;
    th.setAttribute('data-sort', 'string');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'playerHeaderText';
    button.innerHTML = 'Pos';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'tableHead playerHeader playerTeam' +  className;
    th.setAttribute('data-sort', 'string');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'playerHeaderText';
    button.innerHTML = 'Team';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'tableHead playerHeader playerPercentage' +  className;
    th.setAttribute('data-sort', 'float');
    th.setAttribute('data-sort-default', 'desc');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'playerHeaderText';
    button.innerHTML = '%';
    th.appendChild(button);

    var headTable = $('#playersHeadTable');
    headTable[0].appendChild(tableHead);

    var ths = $('#playersTable thead th');
    for (var i = 0; i < ths.length; i++) {
        ths[i].className += className;
    }

    // initialize sortable clusterize table
    $('#playersTableContainer').sortableClusterizeTable({
        scrollId: 'playersScrollArea',
        contentId: 'playersTableBody',
        generateRowHtml: playerRowHtml,
        sortable: true,
        sortInfo: {
            column: 1,
            dataType: 'int',
            direction: $.fn.sortableClusterizeTable.dir.DESC,
            valueFns: [
                function (player) {
                    return formatPlayerNameShort(player);
                },
                function (player) {
                    return player.points;
                },
                function (player) {
                    return getShortPositionForPlayer(player);
                },
                function (player) {
                    return player.teamId;
                },
                function (player) {
                    var usage = playersUsages[player.playerId];
                    return usage ? usage : '0';
                }
            ]
        },
        secondSortInfo: {
            dataType: 'string',
            direction: $.fn.sortableClusterizeTable.dir.ASC,
            sortFn: function (player) {
                return formatPlayerNameShort(player);
            }
        }
    });

    $('#playersTableBody').on('click', 'tr', function () {
        var playerId = $(this).prop('id').substring(1);
        summaryDialogOpenForPlayerId = playerId;
        createPlayerSummaryDialog(playerId);
    });

    if (!tournamentMatches) return;

    fillInPlayersTable();
}


function fillInPlayersTable () {
    var players = [];

    for (var playerId in allPlayers) {
        var player = getPlayer(playerId);

        if (shouldPlayerBeDisplayed(player)) {
            players.push(player);
        }
    }

    sortPlayers(players);

    var data = [];
    for (var i = 0; i < players.length; i++) {
        player = players[i];
        data.push(player);
    }

    $('#playersTableContainer').sortableClusterizeTable('update', data);
    drawClusterizeHeadTable($('#playersTable'));

    var noPlayersContainer = $('#noPlayersContainer');
    if (data.length > 0) {
        noPlayersContainer.hide();
    }
    else {
        noPlayersContainer.show();
    }
}


function playerRowHtml (player) {
    var isUserEntry = isPlayerInSelectedUserLineup(player);
    var className = (tournamentState !== TOURNAMENT_STATE_PREMATCH) ? '' : ' tourPreMatch';
    var indicatorColor = "#2D2F49"; // blue
    
    if (tournamentState == TOURNAMENT_STATE_LIVE){
        if (! player.isPlaying){
            indicatorColor = "#FF1D25"; // red
        }
        else{
            indicatorColor = "#53A51E"; // green
        }
    }

    var html = '<tr id="p' + player.playerId + '" class="tableRow playerRow"' + (isUserEntry ? ' selected_entry="true"' : '') + '>';

    var avatarSrc = mediumPlayerAvatarUrl(player) || '/icongraphy/svg/icon-no-photo.svg';

    var jerseyNumber = getJerseyNumber(player);
    html += '<td class="tableData playerData playerName singleLineText' + className + '"><label style="background-color:' + indicatorColor + ';' + (tournamentState == TOURNAMENT_STATE_PREMATCH?'display: none;':'') + '"></label>';
    if (jerseyNumber) {
        html += '<span>' + jerseyNumber + '.</span>';
    }
    html += formatPlayerName(player) + '<img class="playerAvatar" width="25" src="' + avatarSrc + '"><div class="rowIndicator"></div><div class="hoverIndicator"></div></td>';

    html += '<td class="tableData playerData playerPoints' + (player.changed?' playerPointsChanged':'') + '">' + formatNumberShort(player.points) + '</td>';

    html += '<td class="tableData playerData playerPosition">' + getShortPositionForPlayer(player) + '</td>';

    html += '<td class="tableData playerData playerTeam singleLineText"><img class="playerTeamLogo" width="25" src="' + smallTeamLogoUrl(player.teamOptasportsId) + '" data-rjs="' + mediumTeamLogoUrl(player.teamOptasportsId) + '"></td>';

    html += '<td class="tableData playerData playerPercentage">' + formatPlayerUsage(playersUsages[player.playerId]) + '</td>';

    html += '</tr>';

    return html;
}


function setupPlayersActionsTable () {
    // initialize sortable clusterize table
    $('#eventsTableContainer').sortableClusterizeTable({
        scrollId: 'eventsScrollArea',
        contentId: 'eventsTableBody',
        generateRowHtml: playerActionRowHtml,
        rows_in_block: 12,
        clusterChanged: updatePlayersActionsTable,
        scrollingProgress: function (perc) {
            onActionsTableScroll(perc);
        }
    });

    $('#eventsTableBody').on('click', 'tr', function () {
        var playerId = $(this).prop('id').substring(1);
        createPlayerSummaryDialog(playerId);
    });

    fillInPlayersActionsTable();
}


function fillInPlayersActionsTable () {
    var data = [];

    var actionsArray = (areNonUserEventsEnabled ? allPlayersActions : allUserActions);

    for (var i = 0; i < actionsArray.length; i++) {
        var action = actionsArray[i];

        if (!shouldPlayerActionBeDisplayed(action.points, action.player)) continue;

        if (selectedMatches[action.matchId]) {
            data.push(action);
        }
    }

    currentlyShownEventsSize = data.length;

    $('#eventsTableContainer').sortableClusterizeTable('update', data);

    var noEventsContainer = $('#noEventsContainer');
    if (data.length > 0) {
        noEventsContainer.hide();
    }
    else {
        var text = (tournamentState === TOURNAMENT_STATE_PREMATCH) ? 'During the contest all player events are going to be displayed here, in real-time.' : 'No Player Events found for the current selection.';
        $('#noEventsText').text(text);
        noEventsContainer.show();
    }
}


function updatePlayersActionsTable () {
    var actionRows = $('.eventRow');
    var now = Date.now();

    for(var i = 0; i < actionRows.length; i++) {
        var row = actionRows[i];
        var timestamp = $(row).data('timestamp');

        $(row).attr('new_entry', (timestamp + 10000 > now));

        if (timestamp + 15000 > now) $(row).addClass('highlighted');
        else $(row).removeClass('highlighted');
    }
}


function onMatchUpdate (match, updatedPlayersActions) {
    // look for old match and replace
    for (var i = 0; i < matches.length; i++) {
        if (matches[i].matchId === match.matchId) {
            var oldMatch = matches[i];
            matches[i] = match;
            break;
        }
    }

    if (!oldMatch) return; // something is wrong. Really wrong. But we just let it flush away and pretend that nothing happened. We can't take care of everything.

    updateMatchView(match, oldMatch);
    updatePlayersForMatch(match);
    updateTournamentStatus();

    if (updatedPlayersActions) {
        newPlayersActionsReceived(updatedPlayersActions);
    }
}


function updateStatForAction (stat, actionName) {
    var action = getAction(player, actionName);
    if (action) {
        stat.text(action.count);
        stat.attr('title', action.points + ' points');
    }
    else {
        stat.text('-');
    }
}


function updateMatchView (match, oldMatch) {
    var matchView = $('#m' + match.matchId);

    if (tournamentState === TOURNAMENT_STATE_PREMATCH) {
        matchView.addClass('tourPreMatch');
    }

    var isCancelledBeforeStart = matchIsCancelledBeforeStart(match);

    if (isCancelledBeforeStart || matchIsAbandoned(match)) {
        matchView.removeClass('matchStarted');
        matchView.addClass('matchFinished');
        matchView.addClass('matchCancelled');
        matchStatus = 'Cancelled';
    }
    else if (matchIsComing(match)) {
        var matchStatus = moment(match.startDate).format('D MMM');

        // time has changed - o tempora, o mores...
        if (oldMatch && match.startDate !== oldMatch.startDate) {
            if (matchView.find('.matchTimer').length > 0) {
                for (var i = 0; i < matchTimers.length; i++) {
                    if (matchTimers[i].element.attr('id') === match.matchId) {
                        matchTimers[i].endTime = match.startDate.valueOf();
                        break;
                    }
                }
            }
            else {
                var startTimeText = $($(matchView).find('.matchStartTimeText')[0]);
                startTimeText.empty();
                startTimeText.append(formatStartTimeTextForMatch(match));
            }
        }
    }
    else if (matchIsFinished(match)) {
        matchView.removeClass('matchStarted');
        matchView.addClass('matchFinished');
        matchStatus = 'Finished';
    }
    else {
        var matchProgressBar = matchView.find('.matchProgressBar');

        matchView.addClass('matchStarted');
        matchStatus = '<span>' + match.totalTime + '\'</span> ' + matchPeriodToString(match);
        matchProgressBar[0].style.width = match.totalTime / 90 * 100 + '%';
    }

    matchView.find('.matchStatusText').html(matchStatus);

    var scoreText = matchView.find('.matchScoreText');
    if (isCancelledBeforeStart) {
        scoreText.text("-- : --");
    }
    else {
        scoreText.text(match.firstTeam.score + " : " + match.secondTeam.score);
    }
}


function updatePlayersForMatch (match) {
    var players = [];
    var matchPlayers = (match.firstTeam.players || []).concat(match.secondTeam.players || []);
    var savedPlayer = null;

    for (var i = 0; i < matchPlayers.length; i++) {
        var player = matchPlayers[i];
        savedPlayer = getPlayer(player.playerId);
        if (!savedPlayer) continue; //possible when a team has a player transfer after the slate has been created

        savedPlayer.points = player.points;
        savedPlayer.actions = player.actions;

        if (shouldPlayerBeDisplayed(savedPlayer)) {
            players.push(savedPlayer);
        }
    }

    if (previousPlayers){
        for (var i = 0; i < previousPlayers.length; i++) {
            var oldPlayer = previousPlayers[i];
            var newPlayerIndex = _.findIndex(players, {playerId: oldPlayer.playerId});
            if (newPlayerIndex < 0) continue;
            if (oldPlayer.points != players[newPlayerIndex].points) {
                players[newPlayerIndex].changed = true; // add flag for score change
            }
            else{
                players[newPlayerIndex].changed = false; // if not, remove
            }
        }
    }
    previousPlayers = JSON.parse(JSON.stringify(players));

    $('#playersTableContainer').sortableClusterizeTable('merge', players, 'playerId');

    // update players points of entry details modal
    updateEntryModalPoints(players);

    if (summaryDialogOpenForPlayerId) {
        createPlayerSummaryDialog(summaryDialogOpenForPlayerId);
    }
}


function updateTournamentStatus () {
    var mainContainer = $('#mainContainer');

    if (tournamentState === TOURNAMENT_STATE_LIVE) {
        mainContainer.removeAttr('notLive');
        mainContainer.attr('live', true);

        // count matches running
        var matchesRunning = 0;
        var nextMatch;
        for (var m = 0; m < tournament.matches.length; m++) {
            var match = tournament.matches[m];
            if (matchIsInProgress(match)) {
                matchesRunning++;
            }
            else if (matchIsComing(match) && (!nextMatch || (new Date(match.startDate) < new Date(nextMatch.startDate)))) {
                nextMatch = match;
            }
        }

        var liveContainer = $('#tournamentStatusLiveContainer');
        var matchesInfoText = $('#tournamentStatusLiveMatchInfo');
        var tournamentTimer = $('#nextMatchTimer');

        if (matchesRunning > 0) {
            tournamentTimer.hide();
            liveContainer.removeAttr('next-match');
            var matchesRunningText = (matchesRunning === 1 ? '1 match running' : matchesRunning + ' matches running');
            matchesInfoText.text(matchesRunningText);
        }
        else {
            if (!liveContainer.attr('next-match')) {
                const matchStartsSoonCallback = function () {
                    $('#tournamentStatusLiveMatchInfo').text('Next match starts soon');
                    var tourTimer = $('#nextMatchTimer');
                    tourTimer.hide();
                };

                liveContainer.attr('next-match', true);

                var diff = moment(nextMatch.startDate).diff(moment(), 'minutes');

                if (diff < 0) {
                    matchStartsSoonCallback();
                }
                else {
                    var hours = tournamentTimer.find('.hours');
                    var minutes = tournamentTimer.find('.minutes');
                    var seconds = tournamentTimer.find('.seconds');
                    if (diff < 60) {
                        hours.hide();
                        tournamentTimer.find('.hoursDivider').hide();
                    }
                    else {
                        hours.show();
                        tournamentTimer.find('.hoursDivider').show();
                    }

                    hours.text('--');
                    minutes.text('--');
                    seconds.text('--');

                    tournamentTimer.show();
                    matchesInfoText.text('Next match in ');
                    $.timer(nextMatch.startDate, matchStartsSoonCallback, tournamentTimer);
                }
            }
        }
    }
    else {
        mainContainer.removeAttr('live');
        mainContainer.attr('notLive', true);
    }

    var progressBar = $('#contestProgressBar');
    progressBar.css("width", tournament.progress + '%');
}


function newPlayersActionsReceived (updatedPlayersActions, insertAtBottom) {
    if (updatedPlayersActions.length === 0) return;

    if (allPlayersActions.length === 0) {
        $('#noEventsContainer').hide();
    }

    // update tournament
    if (!tournament.playersActions) {
        tournament.playersActions = [updatedPlayersActions];
    }

    var data = [];

    for (var i = 0; i < updatedPlayersActions.length; i++) {
        var playerActionObj = updatedPlayersActions[i];
        var newActions = createActionsFromObject(playerActionObj);

        if (insertAtBottom) {
            allPlayersActions = allPlayersActions.concat(newActions);
        }
        else {
            allPlayersActions = newActions.concat(allPlayersActions);
        }

        if (isPlayerInAllUserLineups(playerActionObj.playerId)) {
            if (insertAtBottom) {
                allUserActions = allUserActions.concat(newActions);
            }
            else {
                allUserActions = newActions.concat(allUserActions);
            }
        }

        for (var j = 0; j < newActions.length; j++) {
            var action = newActions[j];

            if (!shouldPlayerActionBeDisplayed(action.points, action.player)) continue;

            if (selectedMatches[action.matchId]) {
                data.push(action);
            }
        }
    }

    currentlyShownEventsSize += data.length;

    $('#eventsTableContainer').sortableClusterizeTable(insertAtBottom ? 'append' : 'prepend', data);
}


function playerActionRowHtml (action) {

    if (action.points == 0) return;

    if (action.isCorrection) {
        var eventClassName = " correctionEventRow";
    }
    else {
        var point = Math.abs(action.points) / action.count;
        var eventClassName = point >= hugeEventPoint ? ' hugeEventRow' : (point >= majorEventPoint ? ' majorEventRow' : '');
    }

    var html = '<tr id="a' + action.player.playerId + '" class="tableRow eventRow' + eventClassName + '" data-timestamp="' + action.timestamp + '">';

    var matchColor = matchColors[action.matchId];
    var jerseyNumber = getJerseyNumber(action.player);
    html += '<td class="tableData eventData eventPlayer singleLineText">';
    if (jerseyNumber) {
        html += '<span>' + jerseyNumber + '.</span>';
    }
    html += formatPlayerName(action.player) + '<div class="rowIndicator"></div><div class="hoverIndicator"></div></td>';

    var actionIcon = ACTIONS[action.name].icon;
    html += '<td class="tableData eventData eventIcon">' + (action.isCorrection ? '' : '<div class="eventActionIconWrapper" style="background-color: ' + matchColor + ';"><img class="eventActionIcon" width="' + actionIcon.width + '" height="' + actionIcon.height + '" src="/icongraphy/svg/' + actionIcon.icon + '"></div>') + '</td>';
    var actionString = ACTIONS[action.name].desc;
    if (action.count > 1 || (action.isCorrection && action.count < -1)) {
        actionString += ' x' + Math.abs(action.count);
    }
    html += '<td class="tableData eventData eventAction singleLineText"><span class="eventTimeText">' + action.matchTime + '\'</span>' + actionString + '</td>';

    html += '<td class="tableData eventData eventMatch">' + (action.isCorrection ? '' : '<span class="eventPointsIcon' + ((action.points > 0) ? ' positive' : ' negative') + '"</span>') + '</td>';

    var pointsText = (action.points > 0 ? '+' + action.points : action.points) + ' pts';
    html += '<td class="tableData eventData eventPoints">' + pointsText + '</td></tr>'

    html += '</tr>';

    return html;
}


function updateUserEntries () {
    userEntries.length = 0;
    userEntriesPlayersIds = '';

    for (var i = 0; i < tournament.entries.length; i++) {
        var entry = tournament.entries[i];
        if (entry.username === loggedInUsername) {
            userEntries.push(entry);
            userEntriesPlayersIds += entry.playersIds + ',';

            if (!selectedEntry) {
                selectedEntry = entry;
            }
        }
    }
}


function onTournamentUpdate (res) {
    tournament.entries = res.entries;
    tournament.progress = res.progress;

    // sort entries and update user entries
    sortEntries(tournament);
    updateUserEntries();

    fillInRankingTable(tournament);
    updateEntriesViews();
    updateCurrentStatus();
    updateTournamentStatus();
}


function onTournamentEntryAdded (newEntry, updatedPayouts) {
    var isSelectedEntryChanged = false;
    if (!selectedEntry) {
        isSelectedEntryChanged = true;
    }

    addEntryToTournament(tournament, newEntry);
    sortEntries(tournament);
    updateUserEntries();

    fillInRankingTable(tournament);
    updateEntriesCount();
    setupEntriesViews(userEntries);

    if (isSelectedEntryChanged) {
        fillInPlayersTable();
    }

    updatePrizePayoutDialog(tournament, updatedPayouts);
}


function onTournamentEntryRemoved (removedEntryId, updatedPayouts) {
    var isSelectedEntryRemoved = false;
    if (selectedEntry && selectedEntry.entryId === removedEntryId) {
        selectedEntry = undefined;
        isSelectedEntryRemoved = true;
    }

    removeEntryFromTournament(tournament, removedEntryId);
    updateUserEntries();

    fillInRankingTable(tournament);
    updateEntriesCount();
    setupEntriesViews(userEntries);

    if (isSelectedEntryRemoved) {
        fillInPlayersTable();
    }

    updatePrizePayoutDialog(tournament, updatedPayouts);
}


function onTournamentLive () {
    tournamentState = TOURNAMENT_STATE_LIVE;

    var ths = $('#playersHeadTable thead th');
    for (var i = 0; i < ths.length; i++) {
        $(ths[i]).removeClass('tourPreMatch');
    }

    ths = $('#playersTable thead th');
    for (var i = 0; i < ths.length; i++) {
        $(ths[i]).removeClass('tourPreMatch');
    }

    updateTournamentLayout();
    updateTournamentStatus();
    updatePlayersUsages();
    fillInPlayersTable();
    fillInPlayersActionsTable();
}


function onTournamentStarted (entries) {
    tournament['entries'] = entries;
    sortEntries(tournament);
    fillInRankingTable();
}


function onTournamentFinished () {
    tournamentState = TOURNAMENT_STATE_HISTORY;
    updateTournamentLayout();
}


function isPlayerInSelectedUserLineup (player) {
    return userHasEntries() && selectedEntry && playersIdsStringContainsPlayer(selectedEntry.playersIds, player.playerId);
}


function isPlayerInAllUserLineups (playerId) {
    return userHasEntries() && playersIdsStringContainsPlayer(userEntriesPlayersIds, playerId);
}


function getPlayer (playerId) {
    return allPlayers[playerId];
}


function updateEntriesCount () {
    var entriesText = $('#tournamentEntries');
    var entriesCount = tournament.entries ? tournament.entries.length : 0;
    entriesText.text(formatEntryCount(entriesCount, tournament.maxEntries));
}


function sortEntries (tournament) {
    tournament.entries.sort(function (e1, e2) {
        if (!e1.totalPoints) {
            e1.totalPoints = 0;
        }

        if (!e2.totalPoints) {
            e2.totalPoints = 0;
        }

        return e2.totalPoints - e1.totalPoints;
    })
}


function sortPlayers (players) {
    if (tournamentState === TOURNAMENT_STATE_PREMATCH) {
        players.sort(function (p1, p2) {
            return p1.name.localeCompare(p2.name);
        });
    }
    else {
        players.sort(function (p1, p2) {
            if (!p1.points) {
                p1.points = 0;
            }

            if (!p2.points) {
                p2.points = 0;
            }

            return p2.points - p1.points;
        })
    }
}


function findActionByName (actions, name) {
    if (!actions) return null;

    for (var i = 0; i < actions.length; i++) {
        var actionObj = parseAction(actions[i]);
        if (actionObj && actionObj.name === name) {
            return actionObj;
        }
    }

    return null;
}


function getAction (player, actionName) {
    if (!player.actions) return 0;

    var ind = player.actions.indexOf(actionName + '(');

    if (ind < 0) return null;

    var substr = player.actions.substring(ind + actionName.length + 2);
    ind = substr.indexOf(',');
    return { count : substr.substring(0, ind), points : substr.substring(ind + 1, substr.indexOf(')')) };
}


function chatMessageRowHtml (item) {
    var timeText = moment.unix(item.timestamp / 1000).format('h:mm A');
    return '<tr class="chatRow"><td><p class="chatUsername' + (loggedInUsername === item.username ? ' chatUsernameUser' : '') + '">' + item.username + ' - ' + timeText + '</p><div class="chatMessageContainer"><div class="chatMessageBox"><p class="chatMessage">' + item.message + '</p></div></div></td></tr>'
}


function insertChatMessage (username, message, timestamp) {
    if (message.length === 0) return;

    if (typeof timestamp === 'undefined') {
        timestamp = moment().unix() * 1000;
    }

    var chatTableContainer = $('#chatTableContainer');
    var data = chatTableContainer.sortableClusterizeTable('getData');

    data.push({
        username: username,
        message: message,
        timestamp: timestamp
    });

    chatTableContainer.sortableClusterizeTable('update', data);
}


function endTournamentTimer () {
    onTournamentLive();
}


function shouldPlayerBeDisplayed (player) {
    var match = selectedMatches[player.matchId];

    if (!match) {
        return false;
    }

    if (isYourPlayersEnabled && !isPlayerInSelectedUserLineup(player)) {
        return false;
    }

    if (isNowPlayingEnabled && !matchIsInProgress(match)) {
        return false;
    }

    if (isNowPlayingEnabled && tournamentState === TOURNAMENT_STATE_LIVE) {

        if (player.isPlaying === false) {
            return false;
        } 

    }

    return true;
}


function shouldPlayerActionBeDisplayed (points, player) {
    if (points === 0) return false;

    if (!areNonUserEventsEnabled && !isPlayerInSelectedUserLineup(player)) {
        return false;
    }

    if (isMajorEventsEnabled && Math.abs(points) < majorEventPoint) {
        return false;
    }

    return true;
}


function findUserEntryById (entryId) {
    if (!userHasEntries()) return;

    for (var i = 0; i < userEntries.length; i++) {
        if (userEntries[i].entryId === entryId) {
            return userEntries[i];
        }
    }
}


function getFormationFromEntry (entry) {
    var playersIds = entry.playersIds.split(',');
    var formation = {};

    for (var i = 0; i < playersIds.length; i++) {
        var player = getPlayer(playersIds[i]);
        var playerPosition = player ? getShortPositionForPlayer(player) : "";
        var currentCount = formation[playerPosition];

        if (!currentCount)
            formation[playerPosition] = 1;
        else
            formation[playerPosition]++;
    }

    return formation;
}


function isSelectedUserEntry (entry) {
    return userHasEntries() && selectedEntry && entry.entryId === selectedEntry.entryId;
}


function userHasEntries () {
    return userEntries.length > 0;
}


function onActionsTableScroll (perc) {
    if (!areNonUserEventsEnabled) return;

    // calculate how many elements are left to scroll
    var itemsLeft = currentlyShownEventsSize - (perc * currentlyShownEventsSize / 98); // 98 cause the scroll never reaches the end somehow

    if (!isWaitingForPlayersActions && itemsLeft < (isMajorEventsEnabled ? 10 : 50)) {
        requestPlayersActions();
    }
}


function updatePlayersUsages () {
    playersUsages = [];

    for (var i = 0; i < tournament.entries.length; i++) {
        var players = tournament.entries[i].playersIds.split(',');

        for (var j = 0; j < players.length; j++) {
            var playerId = parseInt(players[j]);

            if (!playersUsages[playerId]) {
                playersUsages[playerId] = 1;
                continue;
            }

            playersUsages[playerId]++;
        }
    }

    for (var playerId in playersUsages) {
        var count = playersUsages[playerId];
        playersUsages[playerId] = 100 * count / tournament.entries.length;
    }
}


function requestPlayersActions () {
    $('#playerActionsProgress').show();
    isWaitingForPlayersActions = true;

    var data = $('#eventsTableContainer').sortableClusterizeTable('getData');
    var timestamp = data[data.length - 1].timestamp;

    $.ajax(
        {
            type : 'GET',
            dataType : 'JSON',
            url : '/api/getPlayersActions',
            data : { tournamentId : tournament._id, timestamp : timestamp },
            statusCode : {
                200 : function (res) {
                    $('#playerActionsProgress').hide();
                    if (res.length === 0) {
                        hasReachedPlayersActionsEnd = true;
                    }
                    else {
                        newPlayersActionsReceived(res, true);
                    }
                    isWaitingForPlayersActions = false;
                },
                400 : function (err) {
                    $('#playerActionsProgress').hide();
                    createErrorDialog('Get player actions failed', err.responseText);
                },
                501 : function (err) {
                    $('#playerActionsProgress').hide();
                    createErrorDialog('Get player actions failed', err.responseText);
                }
            }
        }
    );
}


function requestPointsSystem () {
    $.ajax(
        {
            type : 'GET',
            dataType : 'JSON',
            url : '/api/getGameRules?actionsOnly=true',
            statusCode : {
                200 : function (res) {
                    pointsSystem = res;
                    createPointsSystemDialog(res);
                }
            }
        }
    );
}


function createEntryDetailsDialog (entry) {
    // hide opponents lineup during registration
    if (tournamentState === TOURNAMENT_STATE_PREMATCH && !isSelectedUserEntry(entry)) {
        return;
    }

    var formation = getFormationFromEntry(entry);
    var formationText = formatFormation(formation);

    $('#entryDialogFormationImg').attr('src', '/icongraphy/svg/icon-tour-formation-' + formationText + '.svg');
    $('#entryDialogFormationText').text(formationText);
    $('#entryDialogUsername').text(entry.username);
    $('#entryDialogPoints').text(formatNumber(entry.totalPoints) + ' pts');

    var players = [];
    var playersIds = entry.playersIds.split(',');
    for (var i = 0; i < playersIds.length; i++) {
        players.push(getPlayer(playersIds[i]));
    }

    var squadContainer = $('#entryDialogSquadContainer');
    squadContainer.empty();

    var filledFormation = {};

    for (var i = 0; i < players.length; i++) {
        var player = players[i];
        var pos = getShortPositionForPlayer(player);
        var requiredCount = formation[pos];
        var selectedCount = filledFormation[pos] ? filledFormation[pos] : 0;
        var center = LINEUP_POS_COOR_7P[pos][requiredCount][selectedCount];
        selectedCount++;
        filledFormation[pos] = selectedCount;

        var playerContainer = document.createElement('DIV');
        playerContainer.className = 'lineupPlayerContainer' + ((tournamentState != TOURNAMENT_STATE_PREMATCH)?' playerHasIndicator':'');
        playerContainer.style.top = center.y - 29 + 'px';
        playerContainer.style.left = center.x - 29 + 'px';
        playerContainer.setAttribute('data-id', player.playerId);

        var avatarContainer = document.createElement('DIV');
        avatarContainer.className = 'lineupPlayerAvatarContainer';
        playerContainer.appendChild(avatarContainer);

        var indicatorColor = "#2D2F49";
        if (tournamentState == TOURNAMENT_STATE_LIVE){
            if (! player.isPlaying){
                indicatorColor = "#FF1D25";
            }
            else{
                indicatorColor = "#53A51E";
            }
        }

        var imgAvatar = document.createElement('IMG');
        imgAvatar.className = 'lineupPlayerAvatar';
        var avatarSrc = mediumPlayerAvatarUrl(player);
        if (avatarSrc) {
            imgAvatar.src = avatarSrc;
        }
        avatarContainer.appendChild(imgAvatar);
        $(imgAvatar).load( function () {
            $(this).parent().addClass('hasAvatar');
        });
        $(avatarContainer).css("border-color", indicatorColor);

        var nameContainer = document.createElement('DIV');
        nameContainer.className = 'lineupPlayerNameContainer';
        playerContainer.appendChild(nameContainer);

        var teamLogoWrapper = document.createElement('DIV');
        teamLogoWrapper.className = 'teamLogoWrapper lineupPlayerTeamLogoWrapper';
        nameContainer.appendChild(teamLogoWrapper);

        var teamLogo = document.createElement('IMG');
        teamLogo.className = 'lineupPlayerTeamLogo';
        teamLogo.width = 20;
        teamLogo.src = smallTeamLogoUrl(player.teamOptasportsId);
        teamLogoWrapper.appendChild(teamLogo);

        var playerTeam = document.createElement('P');
        playerTeam.className = 'lineupPlayerTeamName singleLineText';
        playerTeam.innerHTML = player.teamName;
        nameContainer.appendChild(playerTeam);

        var playerName = document.createElement('P');
        playerName.className = 'lineupPlayerName singleLineText';
        playerName.innerHTML = '<label style="' + ((tournamentState != TOURNAMENT_STATE_PREMATCH) ? 'display: inline-block;':'') + 'background-color: ' + indicatorColor + ';"></label>';
        var jerseyNum = getJerseyNumber(player);
        if (jerseyNum) {
            playerName.innerHTML += '<span>' + jerseyNum + '.</span>';
        }
        playerName.innerHTML += formatPlayerNameShort(player);
        nameContainer.appendChild(playerName);

        var playerPoints = document.createElement('P');
        playerPoints.setAttribute('data-points', player.points);
        playerPoints.className = 'lineupPlayerPoints singleLineText';
        playerPoints.innerHTML = formatNumber(player.points) + ' pts';
        nameContainer.appendChild(playerPoints);

        var playerSalary = document.createElement('SPAN');
        playerSalary.className = 'lineupPlayerSalary';
        playerSalary.innerHTML = formatMoneyShort(player.salary);
        nameContainer.appendChild(playerSalary);

        squadContainer[0].appendChild(playerContainer);
    }

    var scrollTop = 0;
    $('#entryDetailsDialog').dialog({
        dialogClass: 'noTitleStuff fixed-dialog entryDialog',
        resizable: false,
        modal: true,
        autoOpen: true,
        draggable: false,
        open: function(e, ui) {
            // bind close
            $('#entryDetailsDialog').unbind().bind('click', function(e) {
                e.stopPropagation();
            });

            $('.ui-dialog.fixed-dialog, #entryDialogCloseButton').unbind().bind('click', function() {
                $('#entryDetailsDialog').dialog('close');
            });
        },
        beforeClose: function(e, ui) {
            scrollTop = $('body').scrollTop();
        },
        close: function() {
            $('body').scrollTop(scrollTop);
        }
    });
}

function updateEntryModalIndicators () {
    var entryDialog = $('#entryDetailsDialog');

    if (entryDialog.hasClass('ui-dialog-content') && entryDialog.dialog('isOpen')) {
        var playerContainers = $('#entryDialogSquadContainer .lineupPlayerContainer');

        for (var i = 0; i < playerContainers.length; i++) {
            var container = $(playerContainers[i]);
            var avatar = container.find(".lineupPlayerAvatarContainer");
            var indicator = container.find("label");
            var playerId = container.data('id');
            var player = _.find(allPlayers, {'playerId': playerId.toString()});

            if (player) {
                var indicatorColor = "#2D2F49";
                if (tournamentState == TOURNAMENT_STATE_LIVE){
                    if (player.isOutsideFormation){
                        indicatorColor = "#FF1D25";
                    }
                    else{
                        indicatorColor = "#53A51E";
                    }
                }

                if (tournamentState != TOURNAMENT_STATE_PREMATCH){
                    indicator.css("display", "inline-block");
                    container.addClass("playerHasIndicator");
                }

                avatar.css("border-color", indicatorColor);
                indicator.css("background-color", indicatorColor);
            }
        }
    }
}

function updateEntryModalPoints (players) {
    var entryDialog = $('#entryDetailsDialog');

    if (entryDialog.hasClass('ui-dialog-content') && entryDialog.dialog('isOpen')) {
        var playerContainers = $('#entryDialogSquadContainer .lineupPlayerContainer');
        var entryPoints = 0;

        for (var i = 0; i < playerContainers.length; i++) {
            var container = $(playerContainers[i]);
            var pointLabel = container.find(".lineupPlayerPoints");
            var playerId = container.data('id');
            var player = _.find(players, {'playerId': playerId.toString()});

            $(pointLabel).removeClass("playerPointsChanged");
            if (player && player.changed){
                addAnimation(pointLabel);
            }

            if (player) {
                pointLabel.data('points', player.points);
                pointLabel.text(formatNumber(player.points) + ' pts');
                entryPoints += player.points;
            }
            else {
                var currentPoints = pointLabel.data('points');
                entryPoints += currentPoints?pointLabel.data('points'):0;
            }
        }

        $('#entryDialogPoints').text(formatNumber(entryPoints) + ' pts');
    }
}

function addAnimation (pointLabel) {
    setTimeout(function(){
        $(pointLabel).addClass("playerPointsChanged");
    }, 100);
}

function createPlayerSummaryDialog (playerId) {
    var player = getPlayer(playerId);

    var teamLogoWrapper = $('#playerDialogTeamLogoWrapper');
    var teamLogo = teamLogoWrapper.find('#playerDialogTeamLogo');
    if (teamLogo.length) {
        teamLogo.remove();
    }

    teamLogo = document.createElement('IMG');
    teamLogo.setAttribute('id', 'playerDialogTeamLogo');
    teamLogo.width = 30;
    teamLogo.src = smallTeamLogoUrl(player.teamOptasportsId);
    teamLogoWrapper[0].appendChild(teamLogo);

    var avatarWrapper = $('#playerDialogAvatarWrapper');
    avatarWrapper.empty();

    var avatar = document.createElement('IMG');
    avatar.setAttribute('id', 'playerDialogAvatar');
    var avatarSrc = mediumPlayerAvatarUrl(player) || '/icongraphy/svg/icon-no-photo.svg';
    avatar.src = avatarSrc;
    avatarWrapper[0].appendChild(avatar);

    $('#playerDialogPosition').text(getPositionForPlayer(player));
    $('#playerDialogName').text(formatPlayerNameShort(player));
    $('#playerDialogSalary').text(formatMoneyShort(player.salary));
    $('#playerDialogTeamName').text(player.teamName);

    if (player.actions) {
        var actions = parsePlayerActions(player);

        $('#playerDialogNoActionContainer').hide();
        $('#playerDialogPoints').text(player.points + ' pts');

        var tableBody = $('#playerDialogEventsBody');
        tableBody.empty();

        for (var i = 0; i < actions.length; i++) {
            var action = actions[i];

            var tr = document.createElement('tr');
            tr.setAttribute('id', 's' + player.playerId);
            tr.className = 'actionRow';

            td = tr.insertCell(0);
            td.className = 'actionData actionIcon';

            var imgWrapper = document.createElement('DIV');
            imgWrapper.className = 'actionIconWrapper';
            imgWrapper.style.backgroundColor = matchColors[player.matchId];
            td.appendChild(imgWrapper);

            var actionIcon = ACTIONS[action.name].icon;
            var imgAction = document.createElement('IMG');
            imgAction.className = 'actionIconImg';
            imgAction.width = actionIcon.width;
            imgAction.height = actionIcon.height;
            imgAction.src = '/icongraphy/svg/' + actionIcon.icon;
            imgWrapper.appendChild(imgAction);

            td = tr.insertCell(1);
            td.className = 'actionData actionName';
            td.innerHTML = ACTIONS[action.name].desc;

            td = tr.insertCell(2);
            td.className = 'actionData actionCount';
            td.innerHTML = action.count;

            td = tr.insertCell(3);
            td.className = 'actionData actionMatch';

            var pointsIcon = document.createElement('SPAN');
            pointsIcon.className = 'actionPointsIcon';
            pointsIcon.className += (action.points > 0) ? ' positive' : ' negative';
            td.appendChild(pointsIcon);

            var pointsText = (action.points > 0 ? '+' + action.points : action.points) + ' pts';
            var td = tr.insertCell(4);
            td.className = 'actionData actionPoints';
            td.innerHTML = pointsText;

            tableBody[0].appendChild(tr);
        }
    }
    else {
        $('#playerDialogPoints').text('0 pts');
        $('#playerDialogNoActionContainer').show();

        var match = selectedMatches[player.matchId];

        if (match.firstTeam.teamId === player.teamId) {
            var firstTeam = match.firstTeam.teamName;
            var secondTeam = match.secondTeam.teamName;
            var score = match.firstTeam.score + '-' + match.secondTeam.score;
        }
        else  {
            firstTeam = match.secondTeam.teamName;
            secondTeam = match.firstTeam.teamName;
            score = match.secondTeam.score + '-' + match.firstTeam.score;
        }

        if (matchIsComing(match)) {
            var text = 'This player\'s match <span>' + firstTeam + '</span> against <span>' + secondTeam + '</span> starts at <span>' + moment(match.startDate).format('dddd H:mm') + '</span>.';
        }
        else if (matchIsInProgress(match)) {
            text = 'This player\'s match <span>' + firstTeam + '</span> against <span>' + secondTeam + '</span> is currently underway but so far this player did not have any playing time.';
        }
        else {
            var endTime = moment(match.startTime).add(match.totalTime + 15, 'm');
            text = 'This player\'s match <span>' + firstTeam + '</span> against <span>' + secondTeam + '</span> ended at <span>' + endTime.format('dddd H:mm') + '</span> in <span>' + score + '</span> but this player did not play.';
        }

        $('#playerDialogNoActionText').html(text);
    }

    var scrollTop = 0;
    $('#playerSummaryDialog').dialog({
        dialogClass: 'noTitleStuff fixed-dialog playerDialog',
        resizable: false,
        modal: true,
        autoOpen: true,
        draggable: false,
        open: function(e, ui) {
            // bind close
            $('#playerSummaryDialog').unbind().bind('click', function(e) {
                e.stopPropagation();
            });

            $('.ui-dialog.fixed-dialog, #playerDialogCloseButton').unbind().bind('click', function() {
                $('#playerSummaryDialog').dialog('close');
            });
        },
        beforeClose: function(e, ui) {
            scrollTop = $('body').scrollTop();
        },
        close: function () {
            $('body').scrollTop(scrollTop);
            summaryDialogOpenForPlayerId = null;
        }
    });
}


function createPrizePayoutsDialog () {

    // fill in payouts table
    var payoutsTable = $('#payoutsTableContainer');
    if (!payoutsTable.sortableClusterizeTable('isInitialized')) {
        $('#payoutsTableContainer').sortableClusterizeTable({
            scrollId: 'payoutsScrollArea',
            contentId: 'payoutsTableBody',
            rows_in_block: 8,
            generateRowHtml: payoutRowHtml
        });
    }

    updatePrizePayoutsTable(tournament);

    if (tournament.payoutsEntriesNumber) {
        $('#payoutsEntriesNumber').text('(by ' + tournament.payoutsEntriesNumber + ' entries)');
    }

    var payoutsDialog = $('#prizePayoutsDialog');
    payoutsDialog.find('#payoutsDialogTournamentName').text(tournament.name);
    payoutsDialog.find('#payoutsTotalPrizeText').text(tournamentTotalPrize(tournament));
    payoutsDialog.find('#payoutsPlayersText').text(formatNumber(tournament.entries.length));
    payoutsDialog.find('#payoutTournamentDialogLogo').attr('src', logoForTournament(tournament, MEDIUM_LOGO));
    
    var scrollTop = 0;
    payoutsDialog.dialog({
        dialogClass: 'noTitleStuff fixed-dialog payoutsDialog',
        resizable: false,
        modal: true,
        autoOpen: true,
        draggable: false,
        open: function(e, ui) {
            // bind close
            $('#prizePayoutsDialog').unbind().bind('click', function(e) {
                e.stopPropagation();
            });

            $('.ui-dialog.fixed-dialog, #payoutsDialogCloseButton').unbind().bind('click', function() {
                $('#prizePayoutsDialog').dialog('close');
            });
        },
        beforeClose: function(e, ui) {
            scrollTop = $('body').scrollTop();
        },
        close: function(e, ui) {
            $('body').scrollTop(scrollTop);
        }
    });
}


function updatePrizePayoutsTable (tour) {
    var data = [];
    var payouts = tour.payouts.split(',');
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
            prizePositions = (prizeGroupStart + 1) + '<sup>' + formatOrdinalSuffix(prizeGroupStart + 1) + '</sup> - ';
            prizeGroupStart = -1;
        }
        prizePositions += (i + 1) + '<sup>' + formatOrdinalSuffix(i + 1) + '</sup>';

        data.push({
            place: prizePositions,
            payout: formatPrize(tour, prize)
        });
    }

    $('#payoutsTableContainer').sortableClusterizeTable('update', data);
}


function updatePrizePayoutDialog(tournament, updatedPayouts) {
    var payoutsDialog = $('#prizePayoutsDialog');
    var isPayoutsDialogOpen = payoutsDialog.hasClass('ui-dialog-content') && payoutsDialog.dialog('isOpen');

    if (tournament.payouts !== updatedPayouts) {
        tournament.payouts = updatedPayouts;
        
        if (isPayoutsDialogOpen) {
            updatePrizePayoutsTable(tournament);
        }
    }

    if (isPayoutsDialogOpen) {
        payoutsDialog.find('#payoutsPlayersText').text(formatNumber(tournament.entries.length));
    }
}


function payoutRowHtml (item) {
    var html = '<tr class="payoutsRow">';

    html += '<td class="payoutsData prizePlaceData">' + item.place + '</td>';

    html += '<td class="payoutsData prizePayoutData">' + item.payout + '</td>';

    html += '</tr>';

    return html;
}


function createPointsSystemDialog (actions) {

    var pointsDialog = $('#eventsPointsDialog');

    if (typeof pointsDialog.attr('isInitialized') == 'undefined') {
        pointsDialog.attr('isInitialized', true);

        var tableBody = $('#pointsTableBody');

        var allPlayers = [];
        var attackers = [];
        var midfielders = [];
        var defenders = [];
        var goalKeepers = [];

        // generate all array
        for (var i = 0; i < actions.length; i++) {

            var action = actions[i];

            if (compareValues(action.values)) {
                action.point = action.values[0];
                allPlayers.push(action);
            }
            else {
                for (var j = 0; j < action.values.length; j++) {
                    var point = action.values[j];

                    switch (j) {
                        case 0:
                            if (point !== 0) {
                                attackers.push(action);
                            }
                            break;
                        case 1:
                            if (point !== 0) {
                                midfielders.push(action);
                            }
                            break;
                        case 2:
                            if (point !== 0) {
                                defenders.push(action);
                            }
                            break;
                        case 3:
                            if (point !== 0) {
                                goalKeepers.push(action);
                            }
                            break;
                    }
                }
            }
            
        }

        generatePositionHtml(allPlayers, 'All players', tableBody, 0);
        generatePositionHtml(attackers, 'Attacker', tableBody, 0);
        generatePositionHtml(midfielders, 'Midfielder', tableBody, 1);
        generatePositionHtml(defenders, 'Defender', tableBody, 2);
        generatePositionHtml(goalKeepers, 'Goal keeper', tableBody, 3);
        
        // Add definitions
        var textContainer = $('#definitionsContainer');

        var defsHeader = document.createElement('h5');
        defsHeader.innerHTML = 'Definitions';
        textContainer[0].appendChild(defsHeader);

        var ul = document.createElement('ul');
        textContainer[0].appendChild(ul);

        for (var i = 0; i < actions.length; i++) {

            var action = actions[i];

            // add definition
            var li = document.createElement('li');
            ul.appendChild(li);

            var def = document.createElement('h6');
            def.innerHTML = ACTIONS[action.key].desc;
            li.appendChild(def);

            var desc = document.createElement('p');
            desc.innerHTML = action.definition;
            li.appendChild(desc);
        }
        
        // add notes

        var notesHeader = document.createElement('h5');
        notesHeader.innerHTML = 'Notes';
        textContainer[0].appendChild(notesHeader);

        var ul = document.createElement('ul');
        textContainer[0].appendChild(ul);

        var li = document.createElement('li');
        ul.appendChild(li);

        var desc = document.createElement('p');
        desc.innerHTML = "Goalkeepers will receive points for goalkeeper specific events and the general scoring events. \nOutfield players will not receive goalkeeper unique events should they play in goal for any reason during a match. Players do not accrue any points during a penalty shootout.";
        li.appendChild(desc);
        
    }

    var scrollTop = 0;
    pointsDialog.dialog({
        dialogClass: 'noTitleStuff fixed-dialog pointsDialog',
        resizable: false,
        modal: true,
        autoOpen: true,
        draggable: false,
        open: function(e, ui) {
            // bind close
            $('#eventsPointsDialog').unbind().bind('click', function(e) {
                e.stopPropagation();
            });

            $('.ui-dialog.fixed-dialog, #pointsDialogCloseButton').unbind().bind('click', function() {
                $('#eventsPointsDialog').dialog('close');
            });
        },
        beforeClose: function(e, ui) {
            scrollTop = $('body').scrollTop();
        },
        close: function(e, ui) {
            $('body').scrollTop(scrollTop);
        }
    });
}

function generatePositionHtml(actions, title, tableBody, index) {
    var groupTr = document.createElement('tr');
    groupTr.className = 'groupTableRow';
    tableBody[0].appendChild(groupTr);

    var th = document.createElement('th');
    th.className = 'pointsData';
    th.setAttribute('colspan', 12);

    var p = document.createElement('p');
    p.innerHTML = title;
    th.appendChild(p);

    groupTr.appendChild(th);

    for (var i = 0; i < actions.length; i++) {

        var action = actions[i];
        var actionPoint = action.values[index];

        var tr = document.createElement('tr');
        tr.className = 'pointsTableRow';

        var td = tr.insertCell(0);
        td.className = 'pointsData pointsNameData';
        td.innerHTML = action.name;

        var wrapper = document.createElement('div');
        wrapper.className = 'actionIconWrapper';
        td.appendChild(wrapper);

        var actionIcon = ACTIONS[action.key].icon;
        var icon = document.createElement('img');
        icon.className = 'actionIconImg';
        icon.style.width = actionIcon.width;
        icon.style.height = actionIcon.height;
        icon.src = '/icongraphy/svg/' + actionIcon.icon;
        wrapper.appendChild(icon);

        td = tr.insertCell(1);
        td.className = 'pointsData pointsValueData';
        td.className += actionPoint > 0 ? ' positive' : ' negative';
        td.innerHTML = actionPoint;

        tableBody[0].appendChild(tr);

    }
}

function compareValues(values) {
    var isEqual;

    for (var i = 1; i < values.length; i++) {
        if (values[0] == values[i]) {
            isEqual = true;
        }
        else {
            return false;
        }
    }

    return isEqual;
}