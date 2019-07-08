var selectedOption;
var selectedOptionPanel;
var allTournaments;
var gameRules;
var termsAndConditions;
var allUsers;

var selectedMatchesTournamentCreation;

const USER_MONEY_LAUNDRY_LIMIT = 25000;
const USER_WARNING_LIMIT = 2000;


$ (function () {
    initUI();
});


function initUI() {
    var manageTournamentsOption = $('#manageTournamentsOption');
    manageTournamentsOption.click(function () {
        if (optionSelected(this, $('#manageTournamentsContainer'))) {
            window.location = '/admin#manageTournaments';
            if (!allTournaments) {
                initManageTournaments();
            }
        }
    });

    var createTournamentOption = $('#createTournamentOption');
    createTournamentOption.click(function () {
        if (optionSelected(this, $('#createTournamentContainer'))) {
            window.location = '/admin#createTournament';
            initTournamentCreation();
        }
    });

    var programmedTournamentsOption = $('#programmedTournamentsOption');
    programmedTournamentsOption.click(function () {
        if (optionSelected(this, $('#programmedTournamentsContainer'))) {
            window.location = '/admin#programmedTournaments';
            initProgrammedTournaments();
        }
    });

    var manageUsersOption = $('#manageUsersOption');
    manageUsersOption.click(function () {
        if (optionSelected(this, $('#manageUsersContainer'))) {
            window.location = '/admin#manageUsers';
            if (!allUsers) {
                initManageUsers();
            }
        }
    });

    var termsAndConditionsOption = $('#termsAndConditionsOption');
    termsAndConditionsOption.click(function () {
        if (optionSelected(this, $('#termsAndConditionsContainer'))) {
            window.location = '/admin#termsAndConditions';
            if (!termsAndConditions) {
                initTermsAndConditions();
            }
        }
    });

    var gameRulesOption = $('#gameRulesOption');
    gameRulesOption.click(function () {
        if (optionSelected(this, $('#gameRulesContainer'))) {
            window.location = '/admin#gameRules';
            if (!gameRules) {
                initGameRules();
            }
        }
    });

    var hash = window.location.hash;
    switch (hash) {
        case '#createTournament':
            createTournamentOption.click();
            break;
        case '#manageTournaments':
            manageTournamentsOption.click();
            break;
        case '#programmedTournaments':
            programmedTournamentsOption.click();
            break;
        case '#manageUsers':
            manageUsersOption.click();
            break;
        case '#termsAndConditions':
            termsAndConditionsOption.click();
            break;
        case '#gameRules':
            gameRulesOption.click();
            break;
        default:
            manageTournamentsOption.click();
    }

    $('#tournamentCreationForm').on('submit', function () {
        return handleTournamentCreationSubmission();
    });

    var now = new Date();
    $('#startDay').val(now.getUTCDate());
    $('#startMonth').val(now.getMonth() + 1);
    $('#startYear').val(now.getFullYear());
    $('#startHour').val(now.getHours());
    $('#startMinute').val(now.getMinutes());

    $('#manageTournamentNameFilter').on('input', function () {
        var filterSearchQuery = $(this).val();
        applyNameFilterToManageTournaments(filterSearchQuery);
    });

    $('#mainLogo').click(function () {
        goToContests();
    });

    initEditUserDialog();
}


function optionSelected (option, optionPanel) {
    if (selectedOptionPanel && selectedOptionPanel[0] == optionPanel[0]) return false;

    if (selectedOption) {
        selectedOptionPanel.hide();
        selectedOption.removeAttr('selected');
    }

    optionPanel.show();
    selectedOptionPanel = optionPanel;

    selectedOption = $(option);
    selectedOption.attr('selected', true);

    return true;
}


function initManageTournaments () {
    $('#manageTournamentsTable').hide();
    $('#adminLoadingView').show();

    $.ajax(
        {
            type : 'GET',
            url : '/api/getLobbyTournamentsAndData?playMode=real',
            dataType : 'json',
            statusCode : {
                200 : function (res) {
                    // load also live tournaments
                    var upcomingTournaments = res.tournaments;

                    $.ajax(
                        {
                            type : 'GET',
                            url : '/api/getLiveTournaments',
                            dataType : 'json',
                            statusCode : {
                                200 : function (res) {
                                    allTournaments = upcomingTournaments.concat(res);

                                    $('#manageTournamentsTable').show();
                                    $('#adminLoadingView').hide();

                                    onManageTournamentsDataResponse(allTournaments);
                                }
                            }
                        }
                    );
                }
            }
        }
    );
}


function initManageUsers () {
    $('#manageUsersTable').hide();
    $('#adminLoadingView').show();

    $.ajax(
        {
            type : 'GET',
            url : '/api/getUsersAdminData',
            dataType : 'json',
            statusCode : {
                200 : function (users) {
                    $('#manageUsersTable').show();
                    $('#adminLoadingView').hide();

                    allUsers = users;
                    onManageUsersDataResponse(users);
                }
            }
        }
    );
}


function initTournamentCreation () {
    $('#tournamentCreationForm').hide();
    $('#adminLoadingView').show();

    $.ajax(
        {
            type : 'GET',
            url : '/api/getTournamentCreationData',
            dataType : 'json',
            statusCode : {
                200 : function (res) {
                    $('#tournamentCreationForm').show();
                    $('#adminLoadingView').hide();

                    onTournamentCreationDataResponse(res);
                }
            }
        }
    );
}


function initProgrammedTournaments () {
    $('#adminLoadingView').show();

    $.ajax(
        {
            type : 'GET',
            url : '/api/getProgrammedTournaments',
            dataType : 'json',
            statusCode : {
                200 : function (res) {
                    $('#adminLoadingView').hide();

                    onProgrammedTournamentsDataResponse(res);
                }
            }
        }
    );
}


function initTermsAndConditions () {
    $('#adminLoadingView').show();

    $.ajax(
        {
            type : 'GET',
            url : '/api/getTermsAndConditions',
            dataType : 'json',
            statusCode : {
                200 : function (res) {
                    $('#adminLoadingView').hide();

                    termsAndConditions = res;
                    onTermsAndConditionsResponse(res);
                }
            }
        }
    );
}


function initGameRules () {
    $('#adminLoadingView').show();

    $.ajax(
        {
            type : 'GET',
            url : '/api/getGameRules',
            dataType : 'json',
            statusCode : {
                200 : function (res) {
                    $('#adminLoadingView').hide();

                    gameRules = res;
                    onGameRulesResponse(res);
                }
            }
        }
    );
}


function onManageTournamentsDataResponse (tournaments) {
    tournaments.sort(function (t1, t2) {
        return new Date(t1.startDate) - new Date(t2.startDate);
    });

    var table = $('#manageTournamentsTable');
    table.empty();

    var thead = $('<thead></thead>');
    table.append(thead);
    var trHeader = $('<tr></tr>');
    thead.append(trHeader);
    trHeader.append('<th data-sort="string">Contest</th>');
    trHeader.append('<th data-sort="money">Entry Fee</th>');
    trHeader.append('<th data-sort="money">Total Prizes</th>');
    trHeader.append('<th data-sort="entries">Entries</th>');
    trHeader.append('<th id="tournamentStartTimeHeader" data-sort="timestamp">Start Time</th>');
    trHeader.append('<th></th>');

    var tbody = table.append('<tbody></tbody>');

    for (var i = 0; i < tournaments.length; i++) {
        insertManageTournamentsRow(tbody, tournaments[i], i);
    }

    setupStupidTable(table);

    // table is already sorted, but we call this method so that the sorting column can be remembered
    $('th#tournamentStartTimeHeader').stupidsort('asc');
}


function insertManageTournamentsRow(tbody, tournament, pos) {
    var tr = $('<tr id="' + tournament._id + '" class="'+ ((pos % 2 === 0) ? 'even' : 'odd') + '"></tr>');
    tbody.append(tr);

    tr.append('<td class="adminTableCell">' + tournament.name + '</td>');

    var entryFeeFormat = (tournament.entryFee > 0) ? formatAdminMoney(tournament.entryFee) : 'Free';
    var entryFeeTd = $('<td class="adminTableCell numbersCell">' + entryFeeFormat + '</td>');
    entryFeeTd.appendTo(tr);

    var prize = tournament.totalPrize || tournament.guaranteedPrize || 0;
    var prizeFormat = formatAdminMoney(prize);

    var prizesTd = $('<td class="adminTableCell numbersCell">' + prizeFormat + '</td>');
    prizesTd.appendTo(tr);

    var entriesFormat = formatEntryCount(tournament.entriesCount, tournament.maxEntries);
    var entriesTd = $('<td class="adminTableCell">' + entriesFormat + '</td>');
    entriesTd.appendTo(tr);

    var startDate = moment(tournament.startDate);
    var startDateFormat = startDate.format("ddd D-MM HH:mm");
    var timestamp = (startDate.unix() * 1000);
    var timeTd = $('<td class="adminTableCell" data-value="' + timestamp + '">' + startDateFormat + '</td>');
    timeTd.appendTo(tr);

    var removeTd = $('<td class="adminTableCell">');
    var removeButton = $('<img src="/icongraphy/svg/icon-entry-remove0.svg" style="width: 20px; height: 20px; cursor: pointer">');
    removeButton.appendTo(removeTd);
    removeTd.appendTo(tr);

    if (removeButton) {
        removeButton.click(function () {
            showConfirmTournamentCancel(this);
        }.bind(tournament))
    }
}


function onManageUsersDataResponse (users) {
    users = users.sort(function (u1, u2) {
        if (u1.username.toLowerCase() < u2.username.toLowerCase()) return -1;
        if (u1.username.toLowerCase() > u2.username.toLowerCase()) return 1;
        return 0;
    });

    var table = $('#manageUsersTable');
    table.empty();

    var thead = $('<thead></thead>');
    table.append(thead);
    var trHeader = $('<tr></tr>');
    thead.append(trHeader);
    trHeader.append('<th></th>');
    trHeader.append('<th></th>');
    trHeader.append('<th id="usernameHeader" class="usernameCell" data-sort="string">Username</th>');
    trHeader.append('<th data-sort="money">Balance</th>');
    trHeader.append('<th data-sort="int">Contests</th>');
    trHeader.append('<th data-sort="int">Entries</th>');
    trHeader.append('<th data-sort="money">Bets</th>');
    trHeader.append('<th data-sort="money">Won</th>');
    trHeader.append('<th data-sort="money">Dep+With</th>');
    trHeader.append('<th data-sort="money">Deposits</th>');
    trHeader.append('<th data-sort="money">Withdrawals</th>');
    trHeader.append('<th data-sort="string">Real Name</th>');
    trHeader.append('<th data-sort="timestamp">Reg. Date</th>');
    trHeader.append('<th data-sort="string">E-mail</th>');
    trHeader.append('<th data-sort="timestamp">Birth Date</th>');
    trHeader.append('<th data-sort="string">Country</th>');
    trHeader.append('<th data-sort="string">Address</th>');
    trHeader.append('<th data-sort="string">Mode</th>');

    var tbody = table.append('<tbody></tbody>');

    fillInUsersTable(tbody);

    setupStupidTable(table);

    // table is already sorted, but we call this method so that the sorting column can be remembered
    $('th#usernameHeader').stupidsort('asc');
}


function fillInUsersTable (tbody) {
    for (var i = 0; i < allUsers.length; i++) {
        insertManageUsersRow(tbody, allUsers[i], i);
    }
}


function refreshUsersTable () {
    var table = $('#manageUsersTable');
    var tbody = table.find('tbody');
    tbody.empty();
    fillInUsersTable(tbody);
    table.stupidRefresh();
}


function insertManageUsersRow(tbody, user, pos) {
    //TODO cleanup test
    if (user.username === 'bigdogitaly') {
        user.totalDeposits = 1500;
        user.totalWithdrawals = 1200;
        user.isLocked = true;
    }
    if (user.username === 'homiebpaid') {
        user.totalDeposits = 1550;
        user.totalWithdrawals = 2200;
        user.isLocked = true;
    }
    if (user.username === 'AcabLoZio') {
        user.totalDeposits = 200;
        user.totalWithdrawals = 50;
    }
    if (user.username === 'johanr') {
        user.totalDeposits = 15200;
        user.totalWithdrawals = 12000;
    }

    var depWithSum = user.totalWithdrawals + user.totalDeposits;

    if (depWithSum > USER_MONEY_LAUNDRY_LIMIT) {
        var trClass = 'userLaundry';
    }
    else if (depWithSum > USER_WARNING_LIMIT) {
        trClass = 'userWarning';
    }
    else {
        trClass = (pos % 2 === 0) ? 'even' : 'odd';
    }

    var tr = $('<tr id="' + user.username + '" class="' + trClass + '"></tr>');
    tbody.append(tr);

    var flagsTd = $('<td></td>');
    var flagsDiv = $('<div class="userFlagsContainer"></div>');
    flagsTd.append(flagsDiv);
    if (user.isLocked) {
        flagsDiv.append('<img class="userFlagIcon" src="/icongraphy/img/lock.png">')
    }
    if (user.isIdVerified) {
        flagsDiv.append('<img class="userFlagIcon" src="/icongraphy/img/tick.png">')
    }
    tr.append(flagsTd);

    var editTd = $('<td class="editUserCell"></td>');
    editTd.click(function () {
        showEditUserDialog(user);
    });
    tr.append(editTd);

    tr.append('<td class="adminTableCell">' + user.username + '</td>');
    tr.append('<td class="adminTableCell numbersCell">' + formatAdminMoney(user.balance) + '</td>');
    tr.append('<td class="adminTableCell numbersCell">' + user.totalContests + '</td>');
    tr.append('<td class="adminTableCell numbersCell">' + user.totalEntries + '</td>');
    tr.append('<td class="adminTableCell numbersCell">' + formatAdminMoney(user.totalBet) + '</td>');
    tr.append('<td class="adminTableCell numbersCell">' + formatAdminMoney(user.totalWon) + '</td>');
    tr.append('<td class="adminTableCell numbersCell">' + formatAdminMoney(user.totalWithdrawals + user.totalDeposits) + '</td>');
    tr.append('<td class="adminTableCell numbersCell">' + formatAdminMoney(user.totalDeposits) + '</td>');
    tr.append('<td class="adminTableCell numbersCell">' + formatAdminMoney(user.totalWithdrawals) + '</td>');
    var registrationDateTd = $('<td class="adminTableCell">' + moment(user.registrationDate).format("DD MMM 'YY") + '</td>');
    tr.append('<td class="adminTableCell">' + user.firstName + ' ' + user.lastName + '</td>');
    registrationDateTd.attr('data-value', new Date(user.registrationDate).valueOf());
    tr.append(registrationDateTd);
    tr.append('<td class="adminTableCell">' + user.email + '</td>');
    var birthDateTd = $('<td class="adminTableCell">' + moment(user.birthDate).format("DD MMM 'YY") + '</td>');
    birthDateTd.attr('data-value', new Date(user.birthDate).valueOf());
    tr.append(birthDateTd);
    tr.append('<td class="adminTableCell">' + user.country + '</td>');
    tr.append('<td class="adminTableCell">' + user.city + ', ' + user.street + ', ' + user.zipCode + '</td>');
    tr.append('<td class="adminTableCell">' + user.playMode + '</td>');
}


function onTournamentCreationDataResponse (res) {
    var contestTypes = res.tournamentTypes;
    var contestTypesDropdown = $('#tournamentTypes');
    contestTypesDropdown.empty();

    Object.keys(contestTypes).forEach(function (key) {
        contestTypesDropdown.append('<option>' + key + '</option>');
    });

    var contestFlags = res.tournamentFlags;
    var contestFlagsContainer = $('#tournamentFlagsContainer');
    contestFlagsContainer.empty();

    Object.keys(contestFlags).forEach(function (key) {
        var label = $('<label class="adminOptionText">' + key + '</label>');
        label.append('<input class="tournamentFlag adminInput" type="checkbox" name="'+ key +'">');
        contestFlagsContainer.append(label);
    });

    // fill in matches
    var matchesTable = $('#matchesSelectorTable');
    matchesTable.empty();

    selectedMatchesTournamentCreation = [];

    var thead = $('<thead></thead>');
    matchesTable.append(thead);
    var trHeader = $('<tr></tr>');
    thead.append(trHeader);
    trHeader.append('<th data-sort="string">Competition</th>');
    trHeader.append('<th data-sort="full_date">Start Date</th>');
    trHeader.append('<th data-sort="full_date">Teams</th>');

    var matches = [];
    var competitions = res.competitions;

    for (var i = 0; i < competitions.length; i++) {
        var competition = competitions[i];

        for (var m = 0; m < competition.matches.length; m++) {
            var match = competition.matches[m];
            match.competitionName = competition.name;
            match.startDate = new Date(match.startDate);
            matches.push(match);
        }
    }

    matches.sort(function (m1, m2) {
        return m1.startDate - m2.startDate;
    });

    var tbody = matchesTable.append('<tbody></tbody>');

    for (i = 0; i < matches.length; i++) {
        match = matches[i];

        var tr = $('<tr id="' + match.matchId + '" class="'+ ((i % 2 === 0) ? 'even' : 'odd') + '"></tr>');
        tbody.append(tr);

        tr.click(function () {
            var match = this.match;
            var tr = this.tr;

            if (tr.attr('selected')) {
                selectedMatchesTournamentCreation.splice(selectedMatchesTournamentCreation.indexOf(match), 1);
                tr.removeAttr('selected');
            }
            else {
                selectedMatchesTournamentCreation.push(match);
                tr.attr('selected', true);
            }

            updateMatchesSelectionInTournamentCreation();
        }.bind({ match : match, tr : tr }));

        tr.append('<td class="adminTableCell">' + match.competitionName + '</td>');
        tr.append('<td class="adminTableCell">' + moment(match.startDate).format("ddd D-MM HH:mm") + '</td>');
        tr.append('<td class="adminTableCell">' + match.firstTeamName + ' vs ' + match.secondTeamName + '</td>');
    }

    setupStupidTable(matchesTable);
}


function updateMatchesSelectionInTournamentCreation () {
    var table = $('#selectedMatchesContainer');
    table.empty();

    var firstMatch;

    for (var i = 0; i < selectedMatchesTournamentCreation.length; i++) {
        var match = selectedMatchesTournamentCreation[i];

        var tr = $('<tr id="' + match.matchId + '"></tr>');
        table.append(tr);

        if (!firstMatch || match.startDate < firstMatch.startDate) {
            firstMatch = match;
        }

        tr.append('<td class="adminTableCell adminOptionText">' + match.competitionName + '</td>');
        tr.append('<td class="adminTableCell adminOptionText">' + moment(match.startDate).format("ddd D-MM HH:mm") + '</td>');
        tr.append('<td class="adminTableCell adminOptionText">' + match.firstTeamName + ' vs ' + match.secondTeamName + '</td>');
    }

    if (selectedMatchesTournamentCreation.length > 0) {
        $('#startDay').val(firstMatch.startDate.getUTCDate());
        $('#startMonth').val(firstMatch.startDate.getMonth() + 1);
        $('#startYear').val(firstMatch.startDate.getFullYear());
        $('#startHour').val(firstMatch.startDate.getHours());
        $('#startMinute').val(firstMatch.startDate.getMinutes());
    }
}


function handleTournamentCreationSubmission () {
    var name = $('#name').val();
    var summary = $('#summary').val();
    var day = $('#startDay').val();
    var month = $('#startMonth').val();
    var year = $('#startYear').val();
    var hour = $('#startHour').val();
    var minute = $('#startMinute').val();
    var gtdPrize = $('#guaranteedPrize').val();
    var entryFee = $('#entryFee').val();
    var maxEntries = $('#maxEntries').val();
    var multiEntries = $('#multiEntries').val();
    var isOpen = $('#isOpen').prop('checked');
    var isFreePlayMode = $('#freePlayMode').prop('checked');
    var isRealPlayMode = $('#realPlayMode').prop('checked');
    var tournamentType = $('#tournamentTypes').val();
    var tournamentFlags = [];

    if (isFreePlayMode) {
        if (!isRealPlayMode) {
            var playMode = PLAY_MODE.FREE;
        }
    }
    else if (isRealPlayMode) {
        playMode = PLAY_MODE.REAL;
    }

    var flagsOptions = $('.tournamentFlag');
    for (var i = 0; i < flagsOptions.length; i++) {
        var option = $(flagsOptions[i]);
        if (option.prop('checked')) {
            tournamentFlags.push(option.prop('name'));
        }
    }

    var errorMsg;

    if (!name || name.length < 3 || !day || !month || !year || !hour || !minute ||
                        (!isFreePlayMode && !isRealPlayMode) || selectedMatchesTournamentCreation.length === 0) {

        errorMsg = 'All the fields marked with * are required';
    }

    var startDate = new Date(year, parseInt(month) - 1, day, hour, minute, 0, 0);
    var slate = '';

    for (i = 0; i < selectedMatchesTournamentCreation.length; i++) {
        slate += selectedMatchesTournamentCreation[i].matchId;

        if (i !== selectedMatchesTournamentCreation.length - 1) {
            slate += ',';
        }
    }

    var errorText = $('#tournamentCreationError');

    if (errorMsg) {
        errorText.text(errorMsg);
    }
    else {
        errorText.text('');

        $('#loadingProgress').show();

        var data = {
            name : name,
            summary : summary,
            entryFee : entryFee,
            guaranteedPrize : gtdPrize,
            startTime : startDate.valueOf(),
            isOpen : isOpen,
            maxEntries : maxEntries,
            multiEntries : multiEntries,
            lineupSize : 7,
            type : tournamentType,
            flags : tournamentFlags,
            playMode : playMode,
            slate : slate
        };

        showConfirmTournamentCreation(data);
    }

    return false;
}


function showConfirmTournamentCreation (data) {
    var message = 'Create contest ' + data.name + '?';
    var confirmCallback = function () {
        $.ajax({
            type : 'POST',
            url : '/api/createTournament',
            data : data,
            dataType : 'json',
            statusCode : {
                200 : function () {
                    alert('Contest created with success');
                },
                400 : function (res) {
                    alert('400 Error: ' + res.responseText);
                },
                500 : function (res) {
                    alert('500 Error: ' + res.statusText);
                },
                501 : function (res) {
                    alert('501 Error: ' + res.responseText);
                }
            }
        });
    };

    createWarningDialog('Confirm', message, 'Create Contest', confirmCallback, 'Cancel');
}


function showConfirmTournamentCancel (tournament) {
    var message = 'Cancel tournament ' + tournament.name + '?';
    var confirmCallback = function () {
        $.ajax({
            type : 'POST',
            url : '/api/cancelTournament',
            data : { tournamentId : tournament._id },
            dataType : 'json',
            statusCode : {
                200 : function () {
                    alert('Contest cancelled with success');
                    $('#' + tournament._id).remove();
                },
                400 : function (res) {
                    alert('400 Error: ' + res.responseText);
                },
                404 : function (res) {
                    alert('404 Error: tournament not found');
                },
                501 : function (res) {
                    alert('501 Error: ' + res.responseText);
                }
            }
        });
    };

    createWarningDialog('Confirm', message, 'Cancel Contest', confirmCallback, 'Don\'t');
}


function showConfirmUpdateTermsAndConditions (content, version) {
    var message = 'Update Terms and Conditions to version ' + version + '?';

    const confirmCallback = function () {
        $.ajax({
            type : 'POST',
            url : '/api/updateTermsAndConditions',
            data : { version : version, content : content },
            dataType : 'json',
            statusCode : {
                200 : function () {
                    alert('Terms and Conditions updated successfully');
                },
                202 : function (res) {
                    alert(res.responseText);
                },
                400 : function (res) {
                    alert('400 Error: ' + res.responseText);
                },
                401 : function () {
                    alert('Not authorized');
                },
                501 : function (res) {
                    alert('501 Error: ' + res.responseText);
                }
            }
        });
    };

    createWarningDialog('Confirm', message, 'Update', confirmCallback, 'Cancel');
}


function showConfirmUpdateGameRules (content, version, updateMessage, actions) {
    var message = 'Update Game Rules to version ' + version + '?';

    const confirmCallback = function () {
        $.ajax({
            type : 'POST',
            url : '/api/updateGameRules',
            data : { version : version, content : content, message : updateMessage, actions : JSON.stringify(actions) },
            dataType : 'json',
            statusCode : {
                200 : function () {
                    alert('Game Rules updated successfully');
                },
                202 : function (res) {
                    alert(res.responseText);
                },
                400 : function (res) {
                    alert('400 Error: ' + res.responseText);
                },
                401 : function () {
                    alert('Not authorized');
                },
                501 : function (res) {
                    alert('501 Error: ' + res.responseText);
                }
            }
        });
    };

    createWarningDialog('Confirm', message, 'Update', confirmCallback, 'Cancel');
}


function applyNameFilterToManageTournaments (name) {
    var table = $('#manageTournamentsTable');
    var tbody = table.find('tbody');

    for (var i = 0; i < allTournaments.length; i++) {
        var tournament = allTournaments[i];
        var isValid = isTournamentValidForNameFilter(name, tournament);
        var row = $('#manageTournamentsTable #' + tournament._id)[0];

        if (isValid && !row) {
            insertManageTournamentsRow(tbody, tournament, 0);
        }
        else if (!isValid && row) {
            row.remove();
        }
    }

    table.stupidRefresh();
}


function isTournamentValidForNameFilter (filterSearchQuery, tournament) {
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

    return true;
}


function onProgrammedTournamentsDataResponse (programmedTournaments) {
  /* Fields used by programmed tournaments:
        minStartTime
    maxStartTime
    name
    summary
    type
    entryFee
    maxEntries
    guaranteedPrize
    lineupSize
    isOpen
    flags
    multiEntries
    weekDays
    startDay
    endDay
    */
    //TODO show programmed tournaments in container

}


function onTermsAndConditionsResponse (termsAndConditions) {
    $('#termsAndConditionsVersion').val(termsAndConditions.version);
    $('#termsAndConditionsContent').val(termsAndConditions.content);

    $('#updateTermsAndConditionsButton').click(function () {
        var version = $('#termsAndConditionsVersion').val();
        var content = $('#termsAndConditionsContent').val();
        showConfirmUpdateTermsAndConditions(content, version);
    });
}


function onGameRulesResponse (gameRules) {
    $('#gameRulesVersion').val(gameRules.version);
    $('#gameRulesContent').val(gameRules.content);

    var pointsSystemBody = $('#pointsSystemTableBody');
    var definitionsContainer = $('#definitionsContainer');
    for (var i = 0; i < gameRules.actions.length; i++) {
        var action = gameRules.actions[i];

        var tr = $('<tr id="' + action.key + '"></tr>');
        tr.append('<td>' + action.name + '</td>');
        tr.append('<td><input value="' + action.values[0] + '" type="number"></td>');
        tr.append('<td><input value="' + action.values[1] + '" type="number"></td>');
        tr.append('<td><input value="' + action.values[2] + '" type="number"></td>');
        tr.append('<td><input value="' + action.values[3] + '" type="number"></td>');
        pointsSystemBody.append(tr);

        definitionsContainer.append('<p class="actionDefinitionTitle">' + action.name + '</p>');
        definitionsContainer.append('<textarea id="' + action.key + '" class="actionDefinition" rows="3">' + action.definition + '</textarea>');
    }

    $('#updateGameRulesButton').click(function () {
        var version = $('#gameRulesVersion').val();
        var content = $('#gameRulesContent').val();
        var updateMessage = $('#gameRulesUpdateMessage').val();
        var actions = gameRules.actions;

        for (var i = 0; i < actions.length; i++) {
            var action = gameRules.actions[i];
            var pointsTds = pointsSystemBody.find('#' + action.key).children();

            action.values[0] = parseInt($(pointsTds[1]).find('input').val());
            action.values[1] = parseInt($(pointsTds[2]).find('input').val());
            action.values[2] = parseInt($(pointsTds[3]).find('input').val());
            action.values[3] = parseInt($(pointsTds[4]).find('input').val());

            var definitionVal = definitionsContainer.find('#' + action.key);
            action.definition = definitionVal.val();
        }

        showConfirmUpdateGameRules(content, version, updateMessage, actions);
    });
}


function formatAdminMoney (money) {
    return '€' + money.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}


function initEditUserDialog () {
    var dialog = $('#editUserDialog');
    var lockedLabel = dialog.find('#accountLockedLabel');
    var lockedCheckbox = dialog.find('#accountLockedToggle');
    var idVerifiedLabel = dialog.find('#idVerifiedLabel');
    var idVerifiedCheckbox = dialog.find('#idVerifiedToggle');

    lockedLabel.click(function () {
        lockedCheckbox.click()
    });
    idVerifiedLabel.click(function () {
        idVerifiedCheckbox.click()
    });
}


function showEditUserDialog (user) {
    var dialog = $('#editUserDialog');
    dialog.find('.dialogTitle').text('Edit User: ' + user.username);

    var lockedCheckbox = dialog.find('#accountLockedToggle');
    var idVerifiedCheckbox = dialog.find('#idVerifiedToggle');

    lockedCheckbox.prop('checked', user.isLocked || false);
    idVerifiedCheckbox.prop('checked', user.isIdVerified || false);

    dialog
        .dialog({
            dialogClass: 'noTitleStuff fixed-dialog',
            resizable: false,
            modal: true,
            autoOpen: true,
            draggable: false,
            open: function(e, ui) {
                // bind close
                $('#editUserDialog').unbind().bind('click', function(e) {
                    e.stopPropagation();
                });

                $('.ui-dialog.fixed-dialog, .dialogCloseButton').unbind().bind('click', function() {
                    $('#editUserDialog').dialog('close');
                });

                $('#closeEditUserDialog').unbind().bind('click', function() {
                    $('#editUserDialog').dialog('close');
                });

                $('#applyEditUserDialog').unbind().bind('click', function() {
                    user.isLocked = lockedCheckbox.is(':checked');
                    user.isIdVerified = idVerifiedCheckbox.is(':checked');

                    updateUser(user);

                    $('#editUserDialog').dialog('close');
                });
            }
        });
}


function updateUser (user) {
    var data = {
        username : user.username,
        isLocked : user.isLocked,
        isIdVerified : user.isIdVerified
    };

    $.ajax({
        type : 'POST',
        url : '/api/updateUserAdmin',
        data : data,
        dataType : 'json',
        statusCode : {
            200 : function () {
                refreshUsersTable();
                alert('User updated successfully');
            },
            400 : function (res) {
                alert('400 Error: ' + res.responseText);
            },
            404 : function (res) {
                alert('404 Error: ' + res.responseText);
            },
            500 : function (res) {
                alert('500 Error: ' + res.statusText);
            },
            501 : function (res) {
                alert('501 Error: ' + res.responseText);
            }
        }
    });
}