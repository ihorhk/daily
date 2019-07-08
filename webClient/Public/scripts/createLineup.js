var LINEUP_POS_COOR_7P = {
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

var socket = io();

var currentPos = ALL_POS;
var players = [];
var selectedPlayers = [];
var selectedTeams = [];
var tournament;
var remainingSalary;

var editEntry;
var editEntryPlayersIds;

var selectedFormation = '';
var playerContainers = [];

var loadPlayerIdx = 0;
var loadPlayerTimer = null;

var filteredTeamIds = [];
var filterNameQuery = '';

var playerMatchStats;


$ (function () {
    // get tournament id and optional entry id from query
    var arr = location.search.split('&');

    for (var i = 0; i < arr.length; i++) {
        var q = arr[i];

        if (q.indexOf('contest') >= 0) {
            var tournamentId = q.substring(q.indexOf('=') + 1);
        }
        else if (q.indexOf('entry') >= 0) {
            var editEntryId = q.substring(q.indexOf('=') + 1);
        }
    }

    if (!tournamentId) {
        goToContests();
        return;
    }

    $.ajax(
        {
            type : 'GET',
            url : '/api/getTournament',
            data : { id : tournamentId },
            dataType : 'json',
            statusCode : {
                200 : function (res) {
                    tournament = res;

                    if (isUserLoggedIn() && editEntryId && tournament.entries) {
                        for (var i = 0; i < tournament.entries.length; i++) {
                            var entry = tournament.entries[i];
                            if (entry.entryId === editEntryId && entry.username === getLoggedInUsername()) {
                                editEntry = tournament.entries[i];
                                editEntryPlayersIds = editEntry.playersIds.split(',');

                                $('#enterButton').text('EDIT LINEUP');

                                break;
                            }
                        }
                    }

                    initWithTournament(tournament);
                },
                400 : function (err) {
                    createErrorDialog('Get contest failed', err.responseText);
                },
                404 : function () {
                    createErrorDialog('Get contest failed', 'The contest could not be found.');
                },
                501 : function (err) {
                    createErrorDialog('Get contest failed', err.responseText, 'Reload', function () {
                        location.reload();
                    });
                }
            }
        }
    );

    initUI();
});


function initUI () {
    setupPositionTabs();

    $('#enterButton').hide();

    $('.mainHeaderItem').click(function () {
        if (selectedPlayers.length > 0) {
            confirmExitLineup($(this));
            return false;
        }
    });
}


function setupPositionTabs () {
    var positionButtons = $('.positionButton');

    positionButtons.on('click', function () {

        // select pressed button
        $(this).addClass('selected');

        var positionButtons = $('.positionButton');
        for (var i = 0; i < positionButtons.length; i++) {
            if (positionButtons[i] === this) continue;

            $(positionButtons[i]).removeClass('selected');
        }

        currentPos = $(this).attr('data-pos');
        fillInPlayersTable();
    });
}


function initWithTournament (tournament) {
    remainingSalary = tournament.salaryCap;

    setupTournamentInfo();

    if (!tournament.isOpen) {
        $('#draftTeamContainer').hide();
        $('#tournamentBackToLobby').hide();
        $('#tournamentClosedContainer').show();
        var button = $('#tournamentClosedButton');
        var text = $('#tournamentClosedText');
        var buttonExpand = $('#matchesShowButton');

        // too early
        if (Date.parse(tournament.startDate) > new Date()) {
            button.text('Back to Contests');
            button.click(function() {
                goToContests();
            });

            text.text('It is too early to draft your lineup for this event. Salaries and players will become available closer to the date of the contest.');
            buttonExpand.hide();
        }
        // too late!
        else {
            button.text('Back to Contests');
            button.click(function() {
                goToContests();
            });

            text.text('Too late! We are sorry, registrations to this contest are now closed.');
            buttonExpand.hide();
        }

        return;
    }

    //  handle back to lobby button
    $('#tournamentBackToLobby').click(function() {
        if (selectedPlayers.length > 0) {
            confirmExitLineup()
        }
        else {
            exitLineup();
        }
    });

    // add all matches view before match views
    setupAllMatchesView();
    
    var slate = tournament.slate;

    //sort matches by start date
    slate.matches.sort(function (m1, m2) {
        return Date.parse(m1.startDate) - Date.parse(m2.startDate);
    });

    // assign to each match a 'players' fields containing the players of both teams
    for (var i = 0; i < slate.matches.length; i++) {
        var match = slate.matches[i];
        var matchPlayers = [];
        var matchTeams = [];
        match.players = matchPlayers;

        // look for the teams that play in the match
        for (var j = 0; j < slate.teams.length; j++) {
            var team = slate.teams[j];

            var isMatchTeam = false;
            if (team.teamId == match.firstTeamId) {
                matchTeams[0] = team;
                isMatchTeam = true;
            }
            else if (team.teamId == match.secondTeamId) {
                matchTeams[1] = team;
                isMatchTeam = true;
            }

            if (isMatchTeam) {
                //add all players to array
                for (var k = 0; k < team.players.length; k++) {
                    var player = team.players[k];
                    player.teamId = team.teamId;
                    player.teamOptasportsId = team.optasportsId;
                    player.competitionId = match.competitionId;
                    matchPlayers.push(player);
                }
            }
        }

        setupMatchView(match, matchTeams);
        selectedTeams.push(match.firstTeamId);
        selectedTeams.push(match.secondTeamId);
    }

    initFilter(tournament);

    setupTournamentButtons();
    setupPlayersTable();
    setupLineupSquad();

    $('#availableFormationContainer').on('click', '.formationItemInner', function () {
        if ($(this).hasClass('selected')) {
            $(this).removeClass('selected');
            selectedFormation = '';

            $('.lineupPlayerContainer:not([data-player])').removeAttr('data-pos');
            updateLineupPlayers();
            updateSelectablePlayers();
        }
        else {
            $('#availableFormationContainer .formationItemInner').removeClass('selected');
            $(this).addClass('selected');

            selectedFormation = $(this).attr('id');
            setLineupFormation();
        }
    });

    $('#playersTableBody').on('click', 'tr', function () {
        var playerId = $(this).attr('id');
        getMatchesStatsHistoryForPlayer(players[playerId]);
    });

    $('#squadContainer').on('click', '.lineupPlayerContainer[data-player]', function () {
        var playerId = $(this).closest('.lineupPlayerContainer').attr('data-player');
        getMatchesStatsHistoryForPlayer(players[playerId]);
    });

    $('#squadContainer').on('click', '.removePlayerFromLineupButton', function () {
        var playerId = $(this).closest('.lineupPlayerContainer').attr('data-player');
        removePlayerFromLineup(players[playerId]);
    });

    var playersTableContainer = $('#availabePlayersContainer');
    playersTableContainer.on('mouseenter', '.inactivePlayerIcon', function () {
        var tooltip = $('#inactivePlayerTooltip');
        var offsetLeft = $(this).offset().left - playersTableContainer.offset().left;
        var offsetTop = $(this).offset().top - playersTableContainer.offset().top;
        offsetTop -= tooltip.height() + 7;
        offsetLeft -= (tooltip.width() - $(this).width()) / 2;
        tooltip.css({left:offsetLeft, top:offsetTop}).show();
    });

    playersTableContainer.on('mouseleave', '.inactivePlayerIcon', function () {
        $('#inactivePlayerTooltip').hide();
    });

    $('#draftTeamCompleteCloseButton').bind('click', function () {
        $('#draftTeamCompleteOverlay').hide();
    });

    // add socket listener
    socket.on('tournamentEntryAdded:' + tournament._id, function (res) {
        onTournamentEntryAdded(res.entry);
    });

    socket.on('tournamentEntryRemoved:' + tournament._id, function (res) {
        onTournamentEntryRemoved(res.entryId);
    });
}


function onTournamentEntryAdded (newEntry) {
    addEntryToTournament(tournament, newEntry);

    updateEntriesCount();
}


function onTournamentEntryRemoved (removedEntryId) {
    removeEntryFromTournament(tournament, removedEntryId);

    updateEntriesCount();
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
    $('#tournamentPrizePool').text(formatPrize(tournament, tournament.totalPrize || tournament.guaranteedPrize || 0));

    $.timer(tournament.startDate, endTimer);
}


function setupTournamentButtons () {
    var enterButton = $('#enterButton');
    enterButton.show();
    enterButton.click(function () {
        if ($(this).attr('disabled') || selectedPlayers.length != tournament.lineupSize || !tournament.isOpen) return;

        if (editEntry) {
            confirmEditLineup();
        }
        else {
            confirmEnterTournament();
        }
    });

    $('#clearButton').click(function () {
        confirmClearLineup();
    });
}


function initFilter(tournament) {
    //team filter
    teams = _.sortBy(_.unionBy(tournament.slate.teams, 'teamId'), 'name');

    var teamList = $('#filterSearchTeamList');

    var li = document.createElement('li');
    li.className = 'filterSearchTeamItem';
    li.setAttribute('data-teamName', '');
    li.innerHTML = 'All Teams';
    teamList[0].appendChild(li);

    for (var i = 0; i < teams.length; i++) {
        var team = teams[i];

        var li = document.createElement('li');
        li.className = 'filterSearchTeamItem';
        li.setAttribute('data-teamId', team.teamId);
        li.setAttribute('data-teamName', team.name);
        li.innerHTML = team.name;

        var imgTeamLogo = document.createElement('IMG');
        imgTeamLogo.className = 'filterSearchTeamLogo';
        imgTeamLogo.width = 22;
        imgTeamLogo.src = smallTeamLogoUrl(team.optasportsId);
        imgTeamLogo.setAttribute('data-rjs', mediumTeamLogoUrl(team.optasportsId));
        li.appendChild(imgTeamLogo);

        teamList[0].appendChild(li);
        retinajs($(imgTeamLogo));
    }

    $(document).on('click', '.filterSearchTeamItem', function() {
        var teamId = $(this).attr('data-teamId');
        if (teamId)
            filteredTeamIds = [teamId];
        else
            filteredTeamIds = [];

        var teamName = $(this).attr('data-teamName');
        $('#filterSearchTeam').val(teamName);
        $('#filterSearchTeam').change();
    });

    $('#filterSearchTeam').on('change', function () {
        fillInPlayersTable();
    });

    //name filter
    $('#filterSearchName').on('input', function () {
        filterNameQuery = $(this).val();

        fillInPlayersTable();
    });
}


function setupAllMatchesView () {
    var matchesSlider = $('#matchesSlider');

    var matchView = document.createElement('DIV');
    matchView.className = 'matchView allMatchesView';
    matchView.setAttribute('selected', true);
    matchView.addEventListener('click', function () {
        selectedTeams = [];
        for (var i = 0; i < tournament.slate.matches.length; i++) {
            var match = tournament.slate.matches[i];
            selectedTeams.push(match.firstTeamId);
            selectedTeams.push(match.secondTeamId);
        }
        matchViewSelected(this);
    });

    var matchViewInner = document.createElement('DIV');
    matchViewInner.className = 'matchViewInner allMatchesViewInner';
    matchView.appendChild(matchViewInner);

    var dateText = document.createElement('DIV');
    dateText.className = 'matchDateView allMatchesDateView';
    matchViewInner.appendChild(dateText);

    var matchDate = document.createElement('SPAN');
    matchDate.className = 'matchDate';
    matchDate.innerHTML = 'All Matches';
    dateText.appendChild(matchDate);

    matchesSlider[0].appendChild(matchView);

    var container = $('#matchesContainer');

    if (tournament.slate.matches.length > 4) {
        $('#matchesShowButton').on('click', function () {
            if (container.hasClass('collapsed')) {
                container.removeClass('collapsed');
                container.animate({height: matchesSlider.height()}, 400);
                $(this).text('Collapse');
            }
            else {
                container.addClass('collapsed');
                container.animate({height: '83px'}, 400);
                $(this).text('Expand');
            }
        });
    }
    else {
        container.addClass('singleRow');
        $('#matchesShowButton').hide();
    }
}


function setupMatchView (match, teams) {
    var matchesSlider = $('#matchesSlider');

    var matchView = document.createElement('DIV');
    matchView.setAttribute('id', match.matchId);
    matchView.className = 'matchView';
    matchView.addEventListener('click', function (event) {
        selectedTeams = [this.firstTeamId, this.secondTeamId];
        matchViewSelected(event.currentTarget);
    }.bind(match));

    var matchViewInner = document.createElement('DIV');
    matchViewInner.className = 'matchViewInner';
    matchView.appendChild(matchViewInner);

    var teamView = document.createElement('DIV');
    teamView.className = 'teamView';
    matchViewInner.appendChild(teamView);

    var teamName = document.createElement('SPAN');
    teamName.className = 'teamName singleLineText';
    teamName.innerHTML = teams[0].abbreviation;
    teamView.appendChild(teamName);

    var teamLogo = document.createElement('DIV');
    teamLogo.className = 'teamLogo';
    teamView.appendChild(teamLogo);

    var teamLogoWrapper = document.createElement('DIV');
    teamLogoWrapper.className = 'teamLogoWrapper';
    teamLogoWrapper.innerHTML = '<img src="' + smallTeamLogoUrl(teams[0].optasportsId) + '" data-rjs="' + mediumTeamLogoUrl(teams[0].optasportsId) + '"/>';
    teamLogo.appendChild(teamLogoWrapper);

    var teamVS = document.createElement('SPAN');
    teamVS.className = 'match-vs';
    teamVS.innerHTML = 'VS';
    teamView.appendChild(teamVS);

    teamLogo = document.createElement('DIV');
    teamLogo.className = 'teamLogo';
    teamView.appendChild(teamLogo);

    teamLogoWrapper = document.createElement('DIV');
    teamLogoWrapper.className = 'teamLogoWrapper';
    teamLogoWrapper.innerHTML = '<img src="' + smallTeamLogoUrl(teams[1].optasportsId) + '" data-rjs="' + mediumTeamLogoUrl(teams[1].optasportsId) + '"/>';
    teamLogo.appendChild(teamLogoWrapper);

    teamName = document.createElement('SPAN');
    teamName.className = 'teamName singleLineText';
    teamName.innerHTML = teams[1].abbreviation;
    teamView.appendChild(teamName);

    var dateText = document.createElement('DIV');
    dateText.className = 'matchDateView';
    matchViewInner.appendChild(dateText);

    var matchDate = document.createElement('SPAN');
    matchDate.className = 'matchDate';
    matchDate.innerHTML = moment(match.startDate).format('ddd D-MM HH:mm');
    dateText.appendChild(matchDate);

    matchesSlider[0].appendChild(matchView);
}


function matchViewSelected (view) {
    // select this and deselect others
    var matchViews = $('.matchView');

    for (var i = 0; i < matchViews.length; i++) {
        var matchView = $(matchViews[i]);
        matchView.attr('selected', matchViews[i] === view);
    }

    fillInPlayersTable();
}


function setupPlayersTable () {

    //create headers
    var tableHead = document.createElement('thead');

    var header = document.createElement('tr');
    tableHead.appendChild(header);

    var th = document.createElement('th');
    th.className = 'availablePlayerTeam';
    header.appendChild(th);

    th = document.createElement('th');
    th.className = 'availablePlayerPosition';
    th.setAttribute('data-sort', 'string');
    header.appendChild(th);

    var button = document.createElement('button');
    button.className = 'playersHeaderText';
    button.innerHTML = 'Position';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'availablePlayerName';
    th.setAttribute('data-sort', 'string');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'playersHeaderText';
    button.innerHTML = 'Player';
    th.appendChild(button);

    var salaryHeader = document.createElement('th');
    salaryHeader.className = 'availablePlayerSalary';
    salaryHeader.setAttribute('data-sort', 'money_short');
    salaryHeader.setAttribute('data-sort-default', 'desc');
    header.appendChild(salaryHeader);

    button = document.createElement('button');
    button.className = 'playersHeaderText';
    button.innerHTML = 'Salary';
    salaryHeader.appendChild(button);

    th = document.createElement('th');
    th.className = 'availablePlayerAdd';
    header.appendChild(th);

    var headTable = $('#playersHeadTable');
    headTable[0].appendChild(tableHead);

    $('#playersTableContainer').sortableClusterizeTable({
        scrollId: 'playersScrollArea',
        contentId: 'playersTableBody',
        rows_in_block: 15,
        generateRowHtml: playerRowHtml,
        clusterChanged: function() {
            retinajs($('.availablePlayerTeamLogo'));
            updateSelectablePlayers();
        },
        sortable: true,
        sortInfo: {
            column: 3,
            dataType: 'money_short',
            direction: $.fn.sortableClusterizeTable.dir.DESC,
            valueFns: [
                null,
                function (player) {
                    return getShortPositionForPlayer(player);
                },
                function (player) {
                    return formatPlayerName(player);
                },
                function (player) {
                    return formatMoneyShort(player.salary);
                },
                null
            ]
        },
        secondSortInfo: {
            dataType: 'string',
            direction: $.fn.sortableClusterizeTable.dir.ASC,
            sortFn: function (player) {
                return formatPlayerName(player);
            }
        }
    });

    $('#playersTableBody').on('click', '.addPlayerToLineupButton', function (e) {
        e.stopPropagation();

        var tr = $(this).closest('tr');

        if (tr.attr('disabled')) return;

        var playerId = tr.prop('id');
        addPlayerToLineup(players[playerId]);
    });

    fillInPlayersTable();
}


function fillInPlayersTable () {
    var matches = tournament.slate.matches;
    var availablePlayers = [];

    for (var j = 0; j < matches.length; j++) {
        var match = matches[j];

        if (selectedTeams.indexOf(match.firstTeamId) < 0 && selectedTeams.indexOf(match.secondTeamId) < 0) {
            continue;
        }

        var matchPlayers = match.players;

        for (var i = 0; i < matchPlayers.length; i++) {
            var player = matchPlayers[i];
            players[player.playerId] = player;

            // filter only the selected positions and filter out players that are in the lineup if its being edited
            if (isPlayerSuitableForCurrentSelection(player)) {
                availablePlayers.push(player);
            }
        }
    }

    var data = [];
    var availablePositions = getAvailableLineupPositions();

    for (var i = 0; i < availablePlayers.length; i++) {
        var player = availablePlayers[i];
        data.push(player);
    }

    $('#playersTableContainer').sortableClusterizeTable('update', data);
    drawClusterizeHeadTable($('#playersTable'));
}


function playerRowHtml (player) {
    var html = '<tr id="'+ player.playerId + '" class="tableRow playerRow' + (player.isInactive ? ' inactivePlayerRow' : '') + '">';
    
    html += '<td class="tableData playerData availablePlayerTeam"><div class="rowIndicator"></div><div class="hoverIndicator"></div><img class="availablePlayerTeamLogo" width="25" src="' + smallTeamLogoUrl(player.teamOptasportsId) + '" data-rjs="' + mediumTeamLogoUrl(player.teamOptasportsId) + '"></td>';

    html += '<td class="tableData playerData availablePlayerPosition">'+ getShortPositionForPlayer(player) + '</td>';

    var jerseyNumber = getJerseyNumber(player);
    html += '<td class="tableData playerData availablePlayerName singleLineText">';
    if (jerseyNumber) {
        html += '<span>' + jerseyNumber + '.</span>';
    }
    html +=  formatPlayerName(player) + '</td>';

    html += '<td class="tableData playerData availablePlayerSalary">' + formatMoneyShort(player.salary) + '</td>';

    if (player.isInactive) {
        html += '<td class="tableData playerData availablePlayerAdd"><span class="inactivePlayerIcon"></span></td>';
    }
    else {
        html += '<td class="tableData playerData availablePlayerAdd"><button class="addPlayerToLineupButton"></button></td>';
    }

    html += '</tr>';

    return html;
}


function setupLineupSquad () {
    var squad = $('#squadContainer');

    for (var i = 0; i < tournament.lineupSize; i++) {
        var playerContainer = document.createElement('DIV');
        playerContainer.className = 'lineupPlayerContainer';

        var avatar = document.createElement('DIV');
        avatar.className = 'lineupPlayerAvatarContainer';
        playerContainer.appendChild(avatar);

        var removeButton = document.createElement('BUTTON');
        removeButton.className = 'removePlayerFromLineupButton';
        avatar.appendChild(removeButton);

        var nameContainer = document.createElement('DIV');
        nameContainer.className = 'lineupPlayerNameContainer';
        nameContainer.innerHTML = 'AVAILABLE';
        playerContainer.appendChild(nameContainer);

        squad[0].appendChild(playerContainer);
        playerContainers.push($(playerContainer));
    }

    playerSelectionChanged();

    // fill in lineup table with players in the lineup being edited
    if (editEntry) {
        for (var i = 0; i < editEntryPlayersIds.length; i++) {
            var player = players[editEntryPlayersIds[i]];
            addPlayerToLineup(player);
        }
    }
    else {
        selectedFormation = '1-2-2-2';
        setLineupFormation();
        updateAvailableFormations();
    }
}


function setLineupFormation (formation) {
    var formation = selectedFormation.split('-');
    var positionCount = countPositionsOfLineupPlayers();
    var emptyContainers = $('.lineupPlayerContainer:not([data-player])');
    var idx = 0;

    for (var i = 0; i < POSITIONS.length; i++) {
        var position = POSITIONS[i];
        var requiredCount = formation[i];
        var selectedCount = positionCount[position];
        if (!selectedCount) selectedCount = 0;

        for (var j = 0; j < (requiredCount - selectedCount); j++) {
            var playerContainer = $(emptyContainers[idx]);
            playerContainer.attr('data-pos', position);
            idx++;
        }
    }

    updateLineupPlayers();
    updateSelectablePlayers();
}


function addPlayerToLineup (player) {
    var playerPos = getShortPositionForPlayer(player);
    var emptyContainers = selectedFormation.length ? $('.lineupPlayerContainer:not([data-player])[data-pos="' + playerPos + '"]') : $('.lineupPlayerContainer:not([data-player])');
    
    if (emptyContainers.length < 1) {
        return;
    }

    selectedPlayers.push(player);

    var playerContainer = $(emptyContainers[0]);
    playerContainer.attr('data-pos', playerPos);
    playerContainer.attr('data-player', player.playerId);

    var nameContainer = playerContainer.find('.lineupPlayerNameContainer');
    nameContainer.text('');

    var teamLogoWrapper = document.createElement('DIV');
    teamLogoWrapper.className = 'teamLogoWrapper lineupPlayerTeamLogoWrapper';
    nameContainer[0].appendChild(teamLogoWrapper);

    var teamLogo = document.createElement('IMG');
    teamLogo.className = 'lineupPlayerTeamLogo';
    teamLogo.width = 20;
    teamLogo.src = smallTeamLogoUrl(player.teamOptasportsId);
    teamLogoWrapper.appendChild(teamLogo);

    var playerTeam = document.createElement('P');
    playerTeam.className = 'lineupPlayerTeamName';
    playerTeam.innerHTML = getTeam(player.teamId).abbreviation;
    nameContainer[0].appendChild(playerTeam);

    var playerName = document.createElement('P');
    playerName.className = 'lineupPlayerName';
    playerName.innerHTML = formatPlayerNameShort(player);
    nameContainer[0].appendChild(playerName);

    var playerSalary = document.createElement('SPAN');
    playerSalary.className = 'lineupPlayerSalary';
    playerSalary.innerHTML = formatMoneyShort(player.salary);
    nameContainer[0].appendChild(playerSalary);
    
    var avatarContainer =  playerContainer.find('.lineupPlayerAvatarContainer');
    avatarContainer.find('.lineupPlayerAvatar').remove();

    var imgAvatar = $('<img class="lineupPlayerAvatar" width="100%"/>').appendTo(avatarContainer);

    var avatarSrc = mediumPlayerAvatarUrl(player);
    if (avatarSrc) {
        imgAvatar.attr('src', avatarSrc);
    }
    else {
        avatarContainer.css('background-image', 'url(/icongraphy/svg/icon-no-photo.svg)');
        avatarContainer.addClass('hasAvatar');
    }

    imgAvatar.load( function () {
        avatarContainer.addClass('hasAvatar');
    });

    playerSelectionChanged();
}


function removePlayerFromLineup (player) {
    var playerContainer = $('.lineupPlayerContainer[data-player="' + player.playerId + '"]');
    removePlayerFromContainer(playerContainer);

    var ind = selectedPlayers.indexOf(player);
    selectedPlayers.splice(ind, 1);

    playerSelectionChanged();
}


function removePlayerFromContainer (playerContainer) {
    if (selectedFormation.length === 0) {
        playerContainer.removeAttr('data-pos');
    }

    playerContainer.removeAttr('data-player');

    var playerAvatarContainer = playerContainer.find('.lineupPlayerAvatarContainer');
    playerAvatarContainer.removeClass('hasAvatar');
    playerAvatarContainer.css('background-image', 'url(/icongraphy/svg/icon-avatar.svg)');
    playerContainer.find('.lineupPlayerAvatarContainer img').remove();
    playerContainer.find('.lineupPlayerNameContainer').text('AVAILABLE');
}


function updateLineupPlayers () {
    for (i = 0; i < POSITIONS.length; i++) {
        var position = POSITIONS[i];
        var positionContainers = $('.lineupPlayerContainer[data-pos="' + position + '"]');
        if (positionContainers.length === 0) 
            continue;

        var centers = LINEUP_POS_COOR_7P[position][positionContainers.length];
        
        for (var j = 0; j < positionContainers.length; j++) {
            var playerContainer = $(positionContainers[j]);
            var center = centers[j];

            playerContainer.css({
                top: center.y - playerContainer.height() / 2,
                left: center.x - playerContainer.width() / 2
            });
        }
    }
}


function playerSelectionChanged () {
    updateRemainingSalary();
    updateLineupPlayers();
    updateSelectablePlayers();
    updateAvailableFormations();

    $('#enterButton').attr('disabled', (selectedPlayers.length != tournament.lineupSize));
    $('#clearButton').attr('disabled', (selectedPlayers.length == 0));
    if (selectedPlayers.length == tournament.lineupSize)
        $('#draftTeamCompleteOverlay').show();
    else
        $('#draftTeamCompleteOverlay').hide();
}


function updateRemainingSalary () {
    var salarySpent = 0;

    for (var i = 0; i < selectedPlayers.length; i++) {
        salarySpent += selectedPlayers[i].salary;
    }

    remainingSalary = tournament.salaryCap - salarySpent;
    $('#remainingSalaryText').text(formatMoneyShort(remainingSalary));

    var averageSalary = (tournament.lineupSize == selectedPlayers.length) ? 0 : Math.floor(remainingSalary / (tournament.lineupSize - selectedPlayers.length));
    $('#averageSalaryText').text(formatMoneyShort(averageSalary));

    var width = 100 - salarySpent / tournament.salaryCap * 100;
    $('#remainingSalaryBar .progress-bar').css({width: width + '%'});
}


function countPositionsOfLineupPlayers () {
    // count positions occurrences among selected players
    var positionCount = [];
    for (var i = 0; i < selectedPlayers.length; i++) {
        var pos = getShortPositionForPlayer(selectedPlayers[i]);
        var currentCount = positionCount[pos];

        if (!currentCount) {
            positionCount[pos] = 1;
        }
        else {
            positionCount[pos]++;
        }
    }
    return positionCount;
}


function getAvailableLineupFormations () {
    // find the available formations given the current positions of the players
    var formations = (tournament.lineupSize == 7 ? window.TEAM_FORMATIONS_7P : window.TEAM_FORMATIONS_11P);
    var availableFormations = [].concat(formations);

    var positionCount = countPositionsOfLineupPlayers();

    for (var j = 0; j < POSITIONS.length; j++) {
        var position = POSITIONS[j];
        var count = positionCount[position];

        if (!count || count < 1) continue;

        for (var i = 0; i < availableFormations.length; i++) {
            var formation = availableFormations[i];

            if (formation[position] < count) {
                availableFormations.splice(i--, 1);
            }
        }
    }

    return availableFormations;
}


function getAvailableLineupPositions () {
    var positionCount = countPositionsOfLineupPlayers();
    var availableFormations = getAvailableLineupFormations();

    // finally get the available positions
    var availablePositions = [];
    for (var j = 0; j < POSITIONS.length; j++) {
        var position = POSITIONS[j];
        var count = positionCount[position];

        if (!count || count < 1) {
            availablePositions.push(position);
            continue;
        }

        // check if position is available for selected formation
        if (selectedFormation.length) {
            var formation = selectedFormation.split('-');
            if (formation[j] > count) {
                availablePositions.push(position);
            }
        }
        else {
            for (var i = 0; i < availableFormations.length; i++) {
                formation = availableFormations[i];
                if (formation[position] > count) {
                    availablePositions.push(position);
                    break;
                }
            }
        }
    }

    return availablePositions;
}


function isPlayerAvailableToLineup (player, availablePositions, remainingSalary, selectedTeams) {
    return (!isPlayerInLineup(player)
            && player.salary <= remainingSalary
            && availablePositions.indexOf(getShortPositionForPlayer(player)) >= 0
            && selectedTeams.indexOf(player.teamId) >= 0);
}


function updateSelectablePlayers () {
    // disable or enable players rows
    var playersRows = $('.playerRow');
    var availablePositions = getAvailableLineupPositions();

    for (var i = 0; i < playersRows.length; i++) {
        var row = playersRows[i];
        var player = players[row.id];

        var isEnabled = isPlayerAvailableToLineup(player, availablePositions, remainingSalary, selectedTeams);
        var isSelected = isPlayerInLineup(player);

        $(row).attr('disabled', !isEnabled);
        $(row).attr('selected_entry', isSelected);
    }
}


function updateAvailableFormations () {
    // update available formations
    var formationContainer = $('#availableFormationContainer');
    formationContainer.empty();

    var availableFormations = getAvailableLineupFormations();

    for (var i = 0; i < availableFormations.length; i++) {
        var formation = formatFormation(availableFormations[i]);

        var item = document.createElement('DIV');
        item.className = 'formationItem';

        var itemInner = document.createElement('BUTTON');
        itemInner.setAttribute('id', formation);
        itemInner.className = 'formationItemInner';
        item.appendChild(itemInner);

        var itemText = document.createElement('SPAN');
        itemText.className = 'tabItemText';
        itemText.innerHTML = formation;
        itemInner.appendChild(itemText);

        formationContainer[0].appendChild(item);
    }

    if (selectedFormation.length) {
        $('#' + selectedFormation).addClass('selected');
    }
}


function updateEntriesCount () {
    var entriesText = $('#tournamentEntries');
    var entriesCount = tournament.entries ? tournament.entries.length : 0;
    entriesText.text(formatEntryCount(entriesCount, tournament.maxEntries));
}


function endTimer () {
    $('#enterButton').hide();
    $('#tournamentStartTitle').text('REGISTRATION CLOSED');
    $('#tournamentTimer').hide();
}


function isPlayerSuitableForCurrentSelection (player) {
    if (currentPos !== ALL_POS && getShortPositionForPlayer(player) !== currentPos) {
        return false;
    }

    // filter team
    if (filteredTeamIds.length > 0 && filteredTeamIds.indexOf(player.teamId) < 0) {
        return false;
    }

    // filter player name
    if (filterNameQuery.replace(/\s/g, '').length > 0) {
        var queryWords = filterNameQuery.split(/[\s-\/]/);
        var name = formatPlayerName(player);
        var nameWords = name.split(/[\s-\/]/);

        for (var i = 0; i < queryWords.length; i++) {
            var queryWord = queryWords[i].toLowerCase();
            var validWord = false;

            for (var j = 0; j < nameWords.length; j++) {
                if (nameWords[j].toLowerCase().indexOf(queryWord) === 0) {
                    validWord = true;
                    break;
                }
            }

            if (!validWord) return false;
        }
    }

    return true;
}


function isPlayerInLineup (player) {
    return selectedPlayers.indexOf(player) >= 0;
}


function getLineupPlayersIdsString () {
    var playersIds = '';

    for (var i = 0; i < selectedPlayers.length; i++) {
        playersIds += selectedPlayers[i].playerId;

        if (i !== selectedPlayers.length - 1) {
            playersIds += ',';
        }
    }

    return playersIds;
}


function getMatchesStatsHistoryForPlayer (player) {
    if (!player) 
        return;

    $.ajax(
        {
            type : 'GET',
            url : '/api/getMatchesStatsHistoryForPlayer',
            data : { playerId : player.playerId, teamId : player.teamId, competitionId : player.competitionId },
            dataType : 'json',
            statusCode : {
                200 : function (res) {
                    createPlayerDetailsDialog(player, res);
                },
                400 : function (err) {
                    createErrorDialog('Get match history', err.responseText);
                },
                404 : function (err) {
                    createErrorDialog('Get match history', err.responseText);
                },
                501 : function (err) {
                    createErrorDialog('Get match history', err.responseText);
                }
            }
        }
    );
}


function createPlayerDetailsDialog (player, matches) {

    setupPlayerDialogInfo(player, matches);

    var scrollTop = 0;
    $('#playerDetailsDialog').dialog({
        dialogClass: 'noTitleStuff fixed-dialog playerDialog',
        resizable: false,
        modal: true,
        autoOpen: true,
        draggable: false,
        open: function(e, ui) {
            // bind close
            $('#playerDetailsDialog').unbind().bind('click', function(e) {
                e.stopPropagation();
            });

            $('.ui-dialog.fixed-dialog, #playerDialogCloseButton').bind('click', function() {
                $('#playerDetailsDialog').dialog('close');
            });

            // draw salary chart
            $('#playerDialogSubTabSalary').click();
        },
        beforeClose: function(e, ui) {
            scrollTop = $('body').scrollTop();
        },
        close: function(e, ui) {
            $('body').scrollTop(scrollTop);
        }
    });
}


function setupPlayerDialogInfo (player, matches) {
    $('#playerDialogAvatarContainer').empty();
    var avatarSrc = largePlayerAvatarUrl(player) || '/icongraphy/svg/icon-no-photo.svg';
    $('<img id="playerDialogAvatar" src="' + avatarSrc + '"/>').appendTo($('#playerDialogAvatarContainer'));

    var teamLogo = $('<img id="playerDialogTeamLogo" src="' + smallTeamLogoUrl(player.teamOptasportsId) + '" data-rjs="' + mediumTeamLogoUrl(player.teamOptasportsId) + '"/>');
    var teamLogoWrapper = $('#playerDialogTeamLogoContainer');
    teamLogoWrapper.empty();
    teamLogo.appendTo(teamLogoWrapper);
    retinajs(teamLogo);
    
    var jerseyNum = getJerseyNumber(player);
    if (jerseyNum) {
        $('#playerDialogJerseyNumber').text(jerseyNum);
    }
    $('#playerDialogName').text(formatPlayerName(player));
    $('#playerDialogProfileSalary').text(formatMoney(player.salary));
    $('#playerDialogProfilePosition').text(getShortPositionForPlayer(player));

    var team = getTournamentTeamWithId(tournament, player.teamId);
    var teamName = (team !== null) ? team.name : '-';
    $('#playerDialogProfileTeam').text(teamName);

    // bind tab buttons
    $('.profileDialogTab').off('click').on('click', function() {
        $('.profileDialogTab.selected').removeClass('selected');
        $(this).addClass('selected');

        if ($(this).attr('id') === 'profileDialogTabOverview') {
            $('#playerDialogTabContentOverview').addClass('selected');
            $('#playerDialogTabContentMatchStats').removeClass('selected');
            $('#playerDialogTabContentCharts').removeClass('selected');
        }
        else if ($(this).attr('id') === 'profileDialogTabAllMatches') {
            $('#playerDialogTabContentOverview').removeClass('selected');
            $('#playerDialogTabContentMatchStats').addClass('selected');
            $('#playerDialogTabContentCharts').removeClass('selected');
        }
    });

    $('#profileDialogTabOverview').click();

    // bind overview sub tab buttons
    playerMatchStats = calcPlayerStats(matches);

    $('.playerDialogOverviewSubTab').off('click').on('click', function() {
        $('.playerDialogOverviewSubTab.selected').removeClass('selected');
        $(this).addClass('selected');

        var position = getShortPositionForPlayer(player);
        if ($(this).attr('id') == 'playerDialogSubTabLastGame') {
            fillInPlayerActionsStatsTable(playerMatchStats[0], position);
        }
        else if ($(this).attr('id') == 'playerDialogSubTabLast10Games') {
            fillInPlayerActionsStatsTable(playerMatchStats[1], position);
        }
        else if ($(this).attr('id') == 'playerDialogSubTabAllSeason') {
            fillInPlayerActionsStatsTable(playerMatchStats[2], position);
        }
    });

    $('#playerDialogSubTabLastGame').click();

    // Prepare charts data
    var salaryChartData = [['Date', 'Salary']];
    var pointsChartData = [['Date', 'Points']];

    for (var i = 0; i < matches.length; i++) {
        var match = matches[i];
        var chart = parseChartDataFromMatch(match);

        if (chart) {
            salaryChartData.push([chart.date, parseInt(chart.salary)]);
            pointsChartData.push([chart.date, parseInt(chart.points)]);
        }
    }

    // bind charts sub tab buttons
    $('.playerDialogChartsSubTab').off('click').on('click', function() {
        $('.playerDialogChartsSubTab.selected').removeClass('selected');
        $(this).addClass('selected');

        if ($(this).attr('id') == 'playerDialogSubTabSalary') {
            drawPlayerCharts(salaryChartData);
        }
        else if ($(this).attr('id') == 'playerDialogSubTabPoints') {
            drawPlayerCharts(pointsChartData);
        }
    });

    // fillPlayerStatsTable(player); //TODO add extra tab for player stats + player info (commentary, news)
    fillInMatchStatsTable(player, matches);
}


function fillInPlayerActionsStatsTable (stats, position) {
    var statsTable1 = $('#playerDialogActionsStatsTable1');
    var statsTable2 = $('#playerDialogActionsStatsTable2');
    statsTable1.empty();
    statsTable2.empty();

    if (stats.length === 0) {
        var tr = $('<tr class="statsRow">');
        tr.appendTo(statsTable1);

        var noStatsTd = $('<td class="statsData noStatsAvailable">No recent stats avaialble</td>');
        noStatsTd.appendTo(tr);
        return;
    }

    var i = 0;

    for (var key in ACTIONS) {
        if (!ACTIONS.hasOwnProperty(key)) continue;

        var action = ACTIONS[key];
        var isValidAction = action.isSummary || isValidActionForPosition(key, position);

        var statFound = false;
        var table = (i < 11) ? statsTable1 : statsTable2;

        for (var j = 0; j < stats.length; j++) {
            var stat = stats[j];
            if (key === stat.name) {
                addActionStatRowToPlayerDialogOverviewTable(table, action, isValidAction, stat);
                statFound = true;
                break;
            }
        }

        if (!statFound && !action.isSummary) {
            addActionStatRowToPlayerDialogOverviewTable(table, action, isValidAction);
        }

        if (!action.isSummary) {
            i++;
        }
    }
}


function addActionStatRowToPlayerDialogOverviewTable (table, action, isValidAction, stat) {
    var hasCount = (stat && stat.count > 0);
    var tr = document.createElement('tr');
    tr.className = 'statsRow';
    tr.className += isValidAction ? '' : ' invalidAction';

    var nameTd = tr.insertCell(0);
    nameTd.className = 'text-left statsData overviewStatsName';
    var name = (action ? action.desc : ACTIONS[stat.name].desc);
    nameTd.innerHTML = name;

    var countTd = tr.insertCell(1);
    countTd.className = 'text-center statsData overviewStatsCount';

    if (!action.isSummary) {
        var count = hasCount ? stat.count : '-';
        countTd.innerHTML = isValidAction ? count : '';
    }

    var pointTd = tr.insertCell(2);
    pointTd.className = 'text-right statsData overviewStatsPoint';
    var points = (hasCount || action.isSummary) ? formatNumber(stat.points) + ' pts' : '-';
    pointTd.innerHTML = isValidAction ? points : '';

    table[0].appendChild(tr);
}


function addActionStatCellToPlayerDialogMatchesRow(html, stat) {
    var hasCount = (stat && stat.count > 0);
    var points = hasCount ? formatNumber(stat.points) : '-';

    html += '<td class="statsData allMatchesStatsData"' + (hasCount ? ' title="' + stat.count + '"' : '') + '>' + points + '</td>';
}


function fillInMatchStatsTable (player, matches) {
    var headTable = $('#matchStatsHeadTable thead');
    var tableHead = $('#matchStatsTableHead');
    var tableBody = $('#matchStatsTableBody');

    headTable.empty();
    tableHead.empty();
    tableBody.empty();

    if (matches.length === 0) {
        var tr = $('<tr class="statsRow">');
        tr.appendTo(tableBody);

        var noStatsTd = $('<td class="statsData noStatsAvailable">No recent stats avaialble</td>');
        noStatsTd.appendTo(tr);
        return;
    }

    var team = getTournamentTeamWithId(tournament, player.teamId);
    var teamName = (team !== null) ? team.name : '-';

    // add headers
    tr = document.createElement('tr');
    tr.className = 'statsRow';

    var th = document.createElement('th');
    th.className = 'statsData matchStatsDate';
    th.innerHTML = 'DATE';
    tr.appendChild(th);

    th = document.createElement('th');
    th.className = 'statsData matchStatsPoints';
    th.innerHTML = 'POINTS';
    tr.appendChild(th);

    th = document.createElement('th');
    th.className = 'statsData matchStatsSalary';
    th.innerHTML = 'SALARY';
    tr.appendChild(th);

    th = document.createElement('th');
    th.className = 'statsData matchStatsOptTeam';
    th.innerHTML = 'OPPONENT';
    tr.appendChild(th);

    for (var key in ACTIONS) {
        if (!ACTIONS.hasOwnProperty(key) || ACTIONS[key].isSummary) continue;

        th = document.createElement('th');
        th.className = 'statsData matchStatsData';
        th.innerHTML = key;
        th.title = ACTIONS[key].desc;
        tr.appendChild(th);
    }

    headTable[0].appendChild(tr);
    // tableHead[0].appendChild(tr);
    tableHead[0].innerHTML = headTable[0].innerHTML;

    var matchesData = [];
    var matchesCount = matches ? matches.length : 0;

    for (var m = matchesCount; m >= 0; m--) {
        var match = matches[m];

        if (match != null && match.salary != null) {
            match.optTeamName = teamName === match.firstTeamName ? match.secondTeamName : match.firstTeamName;
            matchesData.push(match);
        }
    }

    var matchStatsTable = $('#matchStatsTableContainer');
    if (!matchStatsTable.sortableClusterizeTable('isInitialized')) {
        matchStatsTable.sortableClusterizeTable({
            scrollId: 'matchStatsScrollArea',
            contentId: 'matchStatsTableBody',
            rows_in_block: 12,
            generateRowHtml: matchRowHtml,
            hasHorizontalScrollBar: true,
            clusterChanged: function () {
                $('.statsData').tooltip({
                    position: {
                        my: "center bottom-4",
                        at: "center top",
                        using: function( position, feedback ) {
                            $( this ).css( position );
                            $( "<div>" )
                            .addClass( "arrow" )
                            .addClass( feedback.vertical )
                            .addClass( feedback.horizontal )
                            .appendTo( this );
                        }
                    }
                });
            },
        });
    }
    matchStatsTable.sortableClusterizeTable('update', matchesData);

    drawClusterizeHeadTable($('#matchStatsTable'));
}


function matchRowHtml (match) {
    var chartData = parseChartDataFromMatch(match);
    var points = chartData ? chartData.points : 0;

    var html = '<tr class="statsRow">';
    
    html += '<td class="statsData matchStatsDate">' + formatDate(match.matchStartDate, true) + '</td>';
    html += '<td class="statsData">' + formatNumber(points) + '</td>';
    html += '<td class="statsData">' + formatMoneyShort(match.salary) + '</td>';
    html += '<td class="statsData matchStatsOptTeam">' + match.optTeamName + '</td>';

    var matchStats = parseStatsFromMatch(match);

    for (var key in ACTIONS) {
        if (!ACTIONS.hasOwnProperty(key)) continue;
        var action = ACTIONS[key];

        if (action.isSummary) continue;

        var statFound = false;

        for (var s = 0; s < matchStats.length; s++) {
            var stat = matchStats[s];
            if (key === stat.name) {
                if (stat.count > 0) {
                    html += '<td class="statsData allMatchesStatsData" title="' + stat.count + '">' + formatNumber(stat.points) + '</td>';
                    statFound = true;
                }
                break;
            }
        }

        if (!statFound) {
            html += '<td class="statsData allMatchesStatsData">-</td>';
        }
    }
    
    html += '</tr>';
    return html;
}


function drawPlayerCharts (chartData) {
    if (chartData.length <= 1) {
        $('#playerDialogChartContainer').hide();
        return;
    }

    $('#playerDialogChartContainer').show();

    google.charts.load('current', {packages: ['corechart', 'line']});
    google.charts.setOnLoadCallback(drawChart);

    function drawChart() {
        var chartOptions = {
            legend: {position: 'none'}
        };
        var chart = new google.visualization.LineChart(document.getElementById('playerDialogChartContainer'));
        chart.draw(google.visualization.arrayToDataTable(chartData), chartOptions);
    }
}


function confirmExitLineup (menuOption) {
    if (editEntry && !hasEditLineupChanged()) {
        exitLineup();
        return;
    }

    var confirmDialog = $('#backToLobbyDialog');
    var page = (menuOption ? menuOption.text() : 'Contests');
    confirmDialog.find('#backToLobbyYesButton').text('GO TO ' + page.toUpperCase());

    if (menuOption) {
        var text = 'Are you sure you want to go to the ' + page + ' page?<br>Your drafted team will be lost!';
    }
    else {
        text = 'Are you sure you want to go back to the Contests page?<br>Your drafted team will be lost!';
    }
    confirmDialog.find('.dialogMessage').html(text);

    confirmDialog
        .dialog({
            dialogClass: 'noTitleStuff fixed-dialog',
            resizable: false,
            modal: true,
            autoOpen: true,
            draggable: false,
            open: function(e, ui) {
                // bind close
                $('#backToLobbyDialog').unbind().bind('click', function(e) {
                    e.stopPropagation();
                });

                $('.ui-dialog.fixed-dialog, #backToLobbyDialogCloseButton').unbind().bind('click', function () {
                    $('#backToLobbyDialog').dialog('close');
                });

                $('#backToLobbyYesButton').unbind().bind('click', function () {
                    $('#backToLobbyDialog').dialog('close');
                    exitLineup(menuOption);
                });

                $('#backToLobbyNoButton').unbind().bind('click', function () {
                    $('#backToLobbyDialog').dialog('close');
                });
            }
        });
}


function confirmClearLineup () {
    var message = 'Are you sure you want to clear this team?';

    var confirmDialog = $('#clearLineupDialog');
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
                $('#clearLineupDialog').unbind().bind('click', function(e) {
                    e.stopPropagation();
                });

                $('.ui-dialog.fixed-dialog, #clearLineupDialogCloseButton').unbind().bind('click', function () {
                    $('#clearLineupDialog').dialog('close');
                });

                $('#clearLineupYesButton').unbind().bind('click', function () {
                    for (var i = 0; i < playerContainers.length; i++) {
                        removePlayerFromContainer(playerContainers[i]);
                    }
                    $('#availablePlayersTable').stupidRefresh();
                    selectedPlayers.length = 0;
                    playerSelectionChanged();

                    $('#clearLineupDialog').dialog('close');
                });

                $('#clearLineupNoButton').unbind().bind('click', function () {
                    $('#clearLineupDialog').dialog('close');
                });
            }
        });
}


function confirmEnterTournament () {
    var message = 'Your team is ready to enter the contest.<br><br>Are you sure to enter for ' + (tournament.entryFee === 0 ? 'free' : '<span>' + formatPrize(tournament, tournament.entryFee) + '</span>') + '?';

    var confirmDialog = $('#teamReadyDialog');
    confirmDialog.find('.dialogTitle').text('Your team is ready');
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
                $('#teamReadyDialog').unbind().bind('click', function(e) {
                    e.stopPropagation();
                });

                $('.ui-dialog.fixed-dialog, #teamReadyDialogCloseButton').unbind().bind('click', function () {
                    $('#teamReadyDialog').dialog('close');
                });

                $('#teamReadyYesButton').unbind().bind('click', function () {
                    enterTournament();
                    $('#teamReadyDialog').dialog('close');
                });

                $('#teamReadyNoButton').unbind().bind('click', function () {
                    $('#teamReadyDialog').dialog('close');
                });
            }
        });
}


function confirmEditLineup () {
    var hasInactivePlayers = false;
    for (var i = 0; i < selectedPlayers.length; i++) {
        if (selectedPlayers[i].isInactive) {
            hasInactivePlayers = true;
            break;
        }
    }

    var message = hasInactivePlayers ? 'The lineup contains inactive players.' : 'You have changed your team.';
    message += '<br><br>Are you sure that you want to discard your previous team and use this new team in the contest?';

    var confirmDialog = $('#teamReadyDialog');
    confirmDialog.find('.dialogTitle').text('Team changed');
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
                $('#teamReadyDialog').unbind().bind('click', function(e) {
                    e.stopPropagation();
                });

                $('.ui-dialog.fixed-dialog, #teamReadyDialogCloseButton').unbind().bind('click', function () {
                    $('#teamReadyDialog').dialog('close');
                });

                $('#teamReadyYesButton').unbind().bind('click', function () {
                    editLineup(hasInactivePlayers);
                    $('#teamReadyDialog').dialog('close');
                });

                $('#teamReadyNoButton').unbind().bind('click', function () {
                    $('#teamReadyDialog').dialog('close');
                });
            }
        });
}


function enterTournament () {
    var playersIds = getLineupPlayersIdsString();

    var data = {
        tournamentId : tournament._id,
        playersIds : playersIds
    };

    $.ajax(
        {
            type : 'POST',
            url : '/api/createTournamentEntry',
            data : data,
            statusCode : {
                200 : function (res) {
                    createContestEnteredDialog(res);
                },
                202 : function (msg) {
                    createWarningDialog('Lineup creation failed', msg);
                },
                400 : function () {
                    createErrorDialog('Lineup creation failed', 'Failed to register to contest: bad request.');
                },
                401 : function () {
                    goToLogin();
                },
                403 : function (res) {
                    var json = JSON.parse(res.responseText);
                    if (json.termsAndConditions) {
                        var msg = 'The Terms and Conditions have been updated. Please read carefully and accept them in order to register to the contest.\n ' +
                            'If you decide to decline them you will still be able to withdraw money from your balance, but without the possibility to continue playing.';
                        createTermsAndConditionsDialog(msg, json.termsAndConditions, userHasAcceptedNewTermsAndConditions);
                    }
                    else if (!json.isEmailValidated)  {
                        createWarningDialog("Lineup creation failed", json.responseText, "Close", null, "Send new e-mail", function () {
                            requestNewAccountVerificationEmail();
                        });
                    }
                },
                501 : function (err) {
                    createErrorDialog('Lineup creation failed', 'Failed to register to contest: ' + err.responseText);
                }
            }
        }
    );
}


function editLineup (hasInactivePlayers) {
    var playersIds = getLineupPlayersIdsString();

    var data = {
        entryId : editEntry.entryId,
        tournamentId : tournament._id,
        playersIds : playersIds,
        hasInactivePlayers : hasInactivePlayers
    };

    $.ajax(
        {
            type : 'POST',
            url : '/api/editTournamentEntry',
            data : data,
            statusCode : {
                200 : function () {
                    window.location.href = '/myContests';
                },
                202 : function (msg) {
                    createWarningDialog('Lineup edition failed', msg);
                },
                400 : function () {
                    createErrorDialog('Lineup edition failed', 'Failed to edit the lineup: bad request.');
                },
                401 : function () {
                    goToLogin();
                },
                501 : function (err) {
                    createErrorDialog('Lineup edition failed', 'Failed to edit the lineup: ' + err.responseText);
                }
            }
        }
    )
}


function createContestEnteredDialog (entryId) {
    var message = 'Congratulations, your team will complete in the contest <span>\'' + tournament.name + '\'</span>.<br><br>Good luck!';

    var contestEnteredDialog = $('#contestEnteredDialog');
    contestEnteredDialog.find('.dialogMessage').html(message);

    contestEnteredDialog
        .dialog({
            dialogClass: 'noTitleStuff fixed-dialog',
            resizable: false,
            modal: true,
            autoOpen: true,
            draggable: false,
            open: function(e, ui) {
                // bind close
                $('#contestEnteredDialog').unbind().bind('click', function(e) {
                    e.stopPropagation();
                });

                $('.ui-dialog.fixed-dialog, #contestEnteredDialogCloseButton').unbind().bind('click', function() {
                    $('#contestEnteredDialog').dialog('close');
                });

                $('#contestLobbyButton').unbind().bind('click', function () {
                    goToContestLobby(tournament._id, entryId);
                });

                $('#backToAllContestsButton').unbind().bind('click', function () {
                    goToContests();
                });
            }
        });
}


function exitLineup (menuOption) {
    if (menuOption) {
        window.location = menuOption.find('a').attr('href');
    }
    else if (window.history.length > 0) {
        window.history.back();
    }
    else {
        goToContests();
    }
}


function hasEditLineupChanged () {
    if (editEntryPlayersIds.length !== selectedPlayers.length) return true;

    for (var i = 0; i < editEntryPlayersIds.length; i++) {
        var playerId = editEntryPlayersIds[i];
        var playerFound = false;

        for (var j = 0; j < selectedPlayers.length; j++) {
            if (selectedPlayers[j].playerId === playerId) {
                playerFound = true;
                break;
            }
        }

        if (!playerFound) {
            return true;
        }
    }

    return false;
}


function getTeam (teamId) {
    return _.find(tournament.slate.teams, {'teamId': teamId});
}


function userHasAcceptedNewTermsAndConditions (terms) {
    $.ajax(
        {
            type: 'POST',
            url : '/api/userHasAcceptedNewTermsAndConditions',
            dataType : 'json',
            data : { version : terms.version },
            statusCode : {
                200 : function (res) {
                    enterTournament();
                },
                202 : function (res) {
                    createWarningDialog('Request failed', res.responseText);
                },
                501 : function (res) {
                    createErrorDialog('Request failed', res.responseText);
                }
            }
        }
    )
}