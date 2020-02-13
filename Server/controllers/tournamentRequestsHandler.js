var models = require('../models/index.js');
var Tournament = models.tournament;
var db = require('../db/dbManager.js');
var dbHelper = require('../db/docHelper.js');
var logger = require('../util/logger.js');
var moment = require('moment');
var fs = require('fs');
var feedManager = require('./feedManager.js');
var salaryCalculator = require('../calc/salaryCalculator.js');
var tournamentsProgrammer = require('./tournamentsProgrammer.js');
var tournamentsController = require('./tournamentsController.js');
var balanceController = require('./balanceController');
var payoutCalculator = require('../calc/payoutCalculator');
var crypto = require('crypto');
var tournamentTypes = require('../models/enums/TournamentType');
var tournamentFlags = require('../models/enums/TournamentFlags');
var helper = require('../util/helper');
var constants = require('../util/constants');
var lock = require('../util/lock');
var PlayMode = models.PlayMode;

var MOCK_TOURNAMENTS_START_INTERVAL = 2; // mins


/**
 * Creates a new tournament and a new slate if a slate param is provided, otherwise it checks if the value passed with
 * slateId is a valid id for an actual existing slate
 * @param req
 * @param res
 */
function createTournament (req, res) {
    var body = req.body;

    if (!isRequestValidForAdmin(req)) {
        res.status(400).send('Missing master key');
        return;
    }

    if (body.slate) {
        //create a new slate from the provided list of matches
        var matchesIds = body.slate.split(',');

        // check if a slate already exists for the given matches
        db.getSlateByMatchesIds(matchesIds, function (err, slateDoc) {
            if (err) {
                renderTournamentCreationError(err);
                return;
            }

            var shouldCreateSlate = !slateDoc;

            var createTournamentCallback = function (slateDoc, shouldInsertSlate) {

                if (body.isMock) {
                    //start matches every N mins
                    for (var i = 0; i < slateDoc.matches.length; i++) {
                        slateDoc.matches[i].startDate = moment(parseInt(body.startTime)).add((MOCK_TOURNAMENTS_START_INTERVAL * i) + 1, 'm').toDate();
                    }
                }

                tournamentsController.calculateSalaryForOpenTournament(slateDoc, function (updatedSlate) {

                    if (shouldInsertSlate) {
                        var conflictSlate = db.insertSlateFromDocumentAndCheckConflicts(updatedSlate);
                        if (conflictSlate) {
                            updatedSlate = conflictSlate;
                        }
                    }
                    handleTournamentCreation(req, res, updatedSlate);
                });
            };

            if (req.body.isMock && !shouldCreateSlate) {
                db.deleteSlate(slateDoc._id);
                shouldCreateSlate = true;
            }

            if (shouldCreateSlate) {
                db.getMatchesByIdsFromCompetitions(null, matchesIds, function (err, competitions) {

                    if (err) {
                        renderTournamentCreationError(res, 'Failed to get matches by ids. ' + err);
                        return;
                    }

                    // check that there is at least one match in the slate
                    var isValidSlate = false;
                    var teamsToCompetitions = [];

                    for (var i = 0; i < competitions.length; i++) {
                        var competition = competitions[i];

                        if (competition.matches.length === 0) continue;

                        isValidSlate = true;

                        for (var m = 0; m < competition.matches.length; m++) {
                            var match = competition.matches[m];
                            teamsToCompetitions.push({ teamId : match.firstTeamId, competitionId : competition.competitionId });
                            teamsToCompetitions.push({ teamId : match.secondTeamId, competitionId : competition.competitionId });
                        }
                    }

                    if (!isValidSlate) {
                        renderTournamentCreationError('Failed to create tournament! No matches found matching the given ids: ' + matchesIds);
                        return;
                    }

                    db.getTeamsByIdsFromMultipleCompetitions(teamsToCompetitions, function (err, competitionsTeams) {
                        // set the teams to the competitions
                        for (var c = 0; c < competitions.length; c++) {
                            var competition = competitions[c];
                            if (competition.matches.length === 0) continue;

                            for (var ct = 0; ct < competitionsTeams.length; ct++) {
                                if (competitionsTeams[ct].competitionId === competition.competitionId) {
                                    competition.teams = competitionsTeams[ct].teams;
                                    break;
                                }
                            }
                        }

                        var slateDoc = dbHelper.createDocumentForSlate(competitions);
                        createTournamentCallback(slateDoc, true);
                    });
                });
            }
            else {
                createTournamentCallback(slateDoc, false);
            }
        });
    }
    else if (body.slateId) {

        // check that we actually have a slate in the DB with the given id
        db.getSlateById(body.slateId, function (err, slateDoc) {
            if (err || !slateDoc) {
                renderTournamentCreationError(res, 'Failed to find a slate with the given id: ' + body.slateId + '. ' + err);
                return;
            }

            handleTournamentCreation(req, res, slateDoc);
        });
    }
    else {
        renderTournamentCreationError(res, 'No slate provided.');
    }
}


// create tournament from request
function handleTournamentCreation (req, res, slateDoc) {
    var body = req.body;

    if (!body.name || !body.type || !body.startTime || !body.lineupSize) {
        res.status(400).send();
        return;
    }

    if (body['flags[]']) {
        body.flags = body['flags[]'];
        delete body['flags[]'];
    }

    var startDate = new Date();
    startDate.setTime(body.startTime);

    var maxEntries = body.maxEntries ? parseInt(body.maxEntries) : -1;
    if (isNaN(maxEntries)) {
        maxEntries = -1;
    }

    var multiEntries = body.multiEntries ? parseInt(body.multiEntries) : -1;
    if (isNaN(multiEntries)) {
        multiEntries = -1;
    }

    var entryFee = parseFloat(body.entryFee);
    if (isNaN(entryFee)) {
        entryFee = 0;
    }

    var guaranteedPrize = parseFloat(body.guaranteedPrize);
    if (isNaN(guaranteedPrize)) {
        guaranteedPrize = 0;
    }

    var tournament = new Tournament.Tournament(
        body.name,
        body.summary,
        body.type,
        body.subtype,
        body.flags,
        entryFee,
        maxEntries,
        guaranteedPrize,
        startDate,
        body.lineupSize,
        body.isOpen,
        multiEntries
    );

    tournament.slateId = slateDoc._id.toString();
    tournament.isMock = (body.isMock === undefined) ? false : (body.isMock === 'true');

    if (body.playMode) {
        var playMode = body.playMode.toLowerCase();
        if (playMode === PlayMode.FREE || body.playMode == PlayMode.REAL) {
            tournament.playMode = playMode;
            var forcePlayMode = true;
        }
    }

    tournamentsController.createTournamentAndScheduleIt(tournament, dbHelper.createSlateFromDoc(slateDoc), null, forcePlayMode);

    res.status(200).send();

    return tournament;
}


function renderTournamentCreationError(res, msg) {
    logger.error(msg);
    res.status(501).send(msg);
}


/*
 *   200: success
 202: constraints failed (multiEntries limit reached, max entries reached) msg is provided
 400: bad request
 401: user not logged in
 501: server err
 */
function createTournamentEntry (req, res) {
    if (!req.user) {
        if (req.body.masterKey === constants.API_MASTER_KEY) {
            req.user = req.body.user;

            if (!req.user) {
                res.status(401).send();
                return;
            }
        }
        else {
            res.status(401).send();
            return;
        }
    }
    else if (req.user.isEmailValidated === false) {
        res.status(403).send({ isEmailValidated : false, responseText : 'Your account needs to be verified in order to join contests. ' +
        '\nSimply click the link in the e-mail that we have sent you and you are ready to go.'});
        return;
    }
    else if (req.user.tcVersion != helper.getTermsAndConditions().version) {
        res.status(403).send({ termsAndConditions : helper.getTermsAndConditions() });
        return;
    }
    else if (req.user.isLocked) {
        
    }

    var body = req.body;

    if (!body.playersIds || !body.tournamentId) {
        res.status(400).send();
        return;
    }

    const sendResponse = function (res, code, msg) {
        lock.release('createTournamentEntry');
        res.status(code).send(msg);
    };

    // put everything inside a lock to prevent inconsistencies when modifying the tournament entries
    lock.acquire('createTournamentEntry', function () {

        const gotTournamentCallback = function (err, tournamentModel, tournamentDoc) {

            if (err) {
                sendResponse(res, 501, err);
                return;
            }

            if (!tournamentModel.isOpen) {
                sendResponse(res, 202, 'The registrations for this contest are closed.');
                return;
            }

            if (tournamentModel.isCancelled) {
                sendResponse(res, 202, 'The contest has been cancelled.');
                return;
            }

            if (tournamentModel.lineupSize !== body.playersIds.split(',').length) {
                sendResponse(res, 202, 'The number of players in the lineup doesn\'t match the requirements of the contest.');
                return;
            }

            if (tournamentModel.isMock && !constants.IS_RUNNING_LOCAL) { // safety check
                sendResponse(res, 404);
                return;
            }

            // check that the user has sufficient balance
            if (Tournament.isTournamentFreePlayMode(tournamentModel)) {
                var balance = req.user.freeMoneyBalance ? parseFloat(req.user.freeMoneyBalance) : 0;
            }
            else {
                balance = req.user.balance ? parseFloat(req.user.balance) : 0;

                // check responsible gaming settings
                if (req.user.settings.allowRealMoney === false) {
                    sendResponse(res, 202, 'Real money contests are currently disabled for your account. ' +
                        'You change change this setting in your account page, under Settings > Responsible Gaming.');
                    return;
                }
                if (req.user.settings.monthlySpendingCap && (req.user.monthlySpending + tournamentModel.entryFee) > req.user.settings.monthlySpendingCap) {
                    sendResponse(res, 202, 'The entry fee of this contest exceeds the monthly spending cap that you have previously set. You can change this setting' +
                        ' under Settings > Responsible Gaming.');
                    return;
                }
                if (req.user.settings.maxEntryFee && (tournamentModel.entryFee > req.user.settings.maxEntryFee)) {
                    sendResponse(res, 202, 'The entry fee of this contest exceeds the maximum entry fee you have previously set. You can change this setting' +
                        ' under Settings > Responsible Gaming.');
                    return;
                }
            }

            if (balance < tournamentModel.entryFee) {
                sendResponse(res, 202, 'You have insufficient funds to register to this contest.');
                return;
            }

            tournamentModel.entriesCount = (tournamentModel.entries ? tournamentModel.entries.length : 0) + 1;

            if (tournamentModel.maxEntries && tournamentModel.maxEntries > 0 && tournamentModel.entriesCount > tournamentModel.maxEntries) {
                sendResponse(res, 202, 'Sorry, the maximum number of entries for this contest has been reached.');
                return;
            }

            if (!isLineupValid(tournamentDoc, body.playersIds)) {
                sendResponse(res, 202, 'The lineup is not valid.');
                return;
            }


            // check that the sum of the salaries of every player is less than the salary cap
            const sumSalariesCallback = function (err, totalSalary) {
                if (err) {
                    sendResponse(res, 501, err);
                    return;
                }

                if (totalSalary > tournamentModel.salaryCap) {
                    sendResponse(res, 202, 'The lineup is not valid, the salary cap has been exceeded.');
                    return;
                }


                const addEntryCallback = function (err, entry, hasReachedMaxMultiEntries) {
                    if (err) {
                        sendResponse(res, 501, err);
                    }
                    else if (hasReachedMaxMultiEntries) {
                        sendResponse(res, 202, "You have reached the maximum number of multiple entries for this contest (" + tournamentModel.multiEntries + ').');
                    }
                    else {
                        sendResponse(res, 200, entry.entryId);
                    }
                };

                tournamentsController.addEntryToTournament(tournamentModel, req.user.username, body.playersIds, function (err, entry, hasReachedMaxMultiEntries) {
                    lock.run('createTournamentEntry', addEntryCallback, err, entry, hasReachedMaxMultiEntries);
                });
            };


            db.calculateTotalSalaryForEntryInSlate(body.playersIds.split(','), tournamentModel.slateId, function (err, totalSalary) {
                lock.run('createTournamentEntry', sumSalariesCallback, err, totalSalary);
            });
        };



        db.getTournamentById(body.tournamentId, function (err, tournamentModel, tournamentDoc) {

            lock.run('createTournamentEntry', gotTournamentCallback, err, tournamentModel, tournamentDoc);

        }, true, false, false, true, false, true);

    });
}


function editTournamentEntry (req, res) {
    if (!req.user) {
        res.status(401).send();
        return;
    }

    var body = req.body;

    if (!body.entryId || !body.playersIds || !body.tournamentId || body.hasInactivePlayers === undefined) {
        res.status(400).send();
        return;
    }

    // check the lineup validity
    db.getTournamentById(body.tournamentId, function (err, tournament) {
        if (err) {
            res.status(501).send(err);
            return;
        }

        if (!isLineupValid(tournament, body.playersIds)) {
            res.status(202).send('The lineup is not valid.');
            return;
        }

        var entryFound = false;

        if (tournament.entries && tournament.entries.length > 0) {
            // look for the entry
            for (var i = 0; i < tournament.entries.length; i++) {
                if (tournament.entries[i].entryId === body.entryId) {
                    var entry = tournament.entries[i];
                    break;
                }
            }

            if (!entry || entry.username !== req.user.username) {
                entryFound = false;
            }
            else {
                entryFound = true;
            }
        }

        if (!entryFound) {
            res.status(501).send('No entry found for the given id');
            return;
        }

        // check that the lineup size is the same
        if (entry.playersIds.split(',').length !== body.playersIds.split(',').length) {
            res.status(202).send('The number of players in the lineup doesn\'t match the requirements of the contest.');
            return;
        }

        db.updateEntryLineup(body.tournamentId, body.entryId, body.playersIds, JSON.parse(body.hasInactivePlayers), function (err) {
            if (err) {
                res.status(501).send(err);
                return;
            }

            res.status(200).send();
        });

    }, true, false, false, true, false, false);
}


/*
 A lineup is valid when all the players belong to the teams contained in the tournament, and when their formation is valid.
 */
function isLineupValid (tournamentDoc, playersIds) {
    var playersIdsArr = playersIds.split(',');
    var playersPositions = [];

    for (var i = 0; i < playersIdsArr.length; i++) {
        var playerId = playersIdsArr[i];
        var ind = helper.indexOfPlayerInPlayersIdsString(tournamentDoc.players, playerId);

        if (ind < 0) {
            return false;
        }

        // parse position
        var playerString = tournamentDoc.players.substring(ind + 1);
        playerString = playerString.substring(0, playerString.indexOf(','));
        playersPositions.push(playerString.split('%')[2]);
    }

    // count occurrences for each position
    var positionCount = [];
    for (i = 0; i < playersPositions.length; i++) {
        var pos = playersPositions[i];
        var currentCount = positionCount[pos];

        if (!currentCount) {
            positionCount[pos] = 1;
        }
        else {
            positionCount[pos]++;
        }
    }

    var formations = (playersIdsArr.length === 7 ? Tournament.TEAM_FORMATIONS_7P : Tournament.TEAM_FORMATIONS_11P);
    for (i = 0; i < formations.length; i++) {
        var formation = formations[i];
        var isValid = true;

        for (pos in positionCount) {
            if (formation[pos] !== positionCount[pos]) {
                isValid = false;
                break;
            }
        }

        if (isValid) {
            return true;
        }
    }

    return false;
}


function deleteTournamentEntry (req, res) {
    if (!req.user) {
        res.status(401).send();
        return;
    }

    var body = req.body;

    if (!body.entryId || !body.tournamentId) {
        res.status(400).send();
        return;
    }

    const sendResponse = function (res, code, msg) {
        lock.release('deleteTournamentEntry');
        res.status(code).send(msg);
    };

    // put everything inside a lock to prevent inconsistencies when modifying the tournament entries
    lock.acquire('deleteTournamentEntry', function () {

        const gotTournamentCallback = function (err, tournamentModel) {
            if (err) {
                sendResponse(res, 501, err);
                return;
            }

            // check if user can withdraw the entry
            if (tournamentModel.maxEntries > 0 && tournamentModel.entriesCount === tournamentModel.maxEntries) {
                sendResponse(res, 202, 'The contest is full: it\'s no longer possible to withdraw the entry.');
                return;
            }

            if (!tournamentModel.isOpen) {
                sendResponse(res, 202, 'Registrations to the contest are closed: it\'s no longer possible to withdraw the entry.');
                return;
            }


            const entryDeletedCallback = function (err, entry) {
                if (err) {
                    sendResponse(res, 501, err);
                    return;
                }

                if (!entry) {
                    sendResponse(res, 404);
                    return;
                }

                sendResponse(res, 200);
            };

            tournamentsController.deleteEntryFromTournament(tournamentModel, body.entryId, req.user.username, function (err, entry) {
                lock.run('deleteTournamentEntry', entryDeletedCallback, err, entry);
            });
        };


        db.getTournamentById(body.tournamentId, function (err, tournamentModel) {

            lock.run('deleteTournamentEntry', gotTournamentCallback, err, tournamentModel)

        }, true, false, false, false, false, true);

    });
}


function getLobbyTournamentsAndData (req, res) {
    if (req.user) {
        var shouldCountUserEntries = true;
        var playMode = req.user.playMode;
        var includeMock = constants.IS_RUNNING_LOCAL;
    }
    else {
        playMode = PlayMode.REAL;
    }

    // user play mode is overridden by query
    if (req.query.playMode && (req.query.playMode === PlayMode.REAL || req.query.playMode === PlayMode.FREE)) {
        playMode = req.query.playMode;
    }

    db.getLobbyTournaments(function (err, tournaments) {
            if (err) {
                res.status(501).send(err);
                return;
            }

            fixFieldsForLobbyTournaments(tournaments);

            var resObj = {
                tournaments : tournaments,
                tournamentTypes : tournamentTypes.getTournamentTypesStrings(),
                tournamentFlags : tournamentFlags.getTournamentFlagsToString()
            };

            if (req.user) {
                resObj['username'] = req.user.username;
            }

            db.getAllCompetitions(function (err, competitions) {
                if (err) {
                    res.status(501).send(err);
                    return;
                }

                resObj['competitions'] = competitions;

                res.status(200).send(resObj);
            });
        },
        true, shouldCountUserEntries, false, shouldCountUserEntries ? req.user.username : null, playMode, true, includeMock);
}


function getLiveTournaments (req, res) {
    var shouldCountUserEntries = (req.user !== undefined);
    var playMode = (req.user) ? req.user.playMode : PlayMode.REAL;

    db.getActiveTournaments(function (err, tournaments) {
            if (err) {
                res.status(501).send(err);
                return;
            }

            fixFieldsForLobbyTournaments(tournaments);

            res.status(200).send(tournaments);
        },
        true, shouldCountUserEntries, false, shouldCountUserEntries ? req.user.username : null, playMode, true);
}


function fixFieldsForLobbyTournaments (tournaments) {
    // get competitions ids from matches and remove field
    for (var i = 0; i < tournaments.length; i++) {
        var tournament = tournaments[i];

        for (var m = 0; m < tournament.matches.length; m++) {
            var match = tournament.matches[m];
            delete match.playersIds;
        }

        delete tournament.payouts;
    }
}


function getTournament (req, res, shouldGetSlate) {
    var tournamentId = req.query.id;

    if (!tournamentId) {
        res.status(400).send('Error: no tournament id sent to server.');
        return;
    }

    if (!helper.isObjectIdValid(tournamentId)) {
        res.status(404).send();
        return;
    }

    // get the tournament by id without creating the model
    db.getTournamentById(tournamentId, function (err, tournamentDoc) {
        if (err) {
            res.status(501).send('An error has been encountered while loading the contest. Please try again.');
            return;
        }

        if (!tournamentDoc) {
            res.status(404).send();
            return;
        }

        res.status(200).send(tournamentDoc);

    }, true, true, shouldGetSlate, false, !shouldGetSlate, false); // include matches if slate is not returned
}


// get tournament and adds some fields to the matches if they have already started
function getTournamentInfo (req, res) {
    var tournamentId = req.query.id;

    if (!tournamentId) {
        res.status(400).send('Error: no tournament id sent to server.');
        return;
    }

    // get the tournament by id without creating the model
    db.getTournamentById(tournamentId, function (err, tournamentDoc) {
        if (err) {
            res.status(501).send(err);
            return;
        }

        var matchesIds = [];
        for (var i = 0; i < tournamentDoc.matches.length; i++) {
            matchesIds.push(tournamentDoc.matches[i].matchId);
        }

        const matchesRequiredFields = {
            matchId : 1,
            'firstTeam.teamId' : 1,
            'firstTeam.score' : 1,
            'secondTeam.teamId' : 1,
            'secondTeam.score' : 1,
            period : 1,
            totalTime : 1
        };

        db.getMatchesByIds(matchesIds, matchesRequiredFields, function (err, matches) {

            var matchesToGetFromCompetitions = {};
            var competitionsToQuery = [];

            // update matches fields
            for (var m = 0; m < tournamentDoc.matches.length; m++) {
                var tourMatch = tournamentDoc.matches[m];
                var matchFound = false;

                for (var i = 0; i < matches.length; i++) {
                    if (tourMatch.matchId === matches[i].matchId) {
                        var match = matches[i];
                        matchFound = true;

                        tourMatch.period = match.period;
                        tourMatch.totalTime = match.totalTime;
                        tourMatch.firstTeamScore = match.firstTeam.score;
                        tourMatch.secondTeamScore = match.secondTeam.score;

                        break;
                    }
                }

                if (!matchFound) {
                    matchesToGetFromCompetitions[tourMatch.matchId] = tourMatch;
                }

                competitionsToQuery[tourMatch.competitionId] = 1;
            }

            // we need to get the remaining matches from the competitions collection
            db.getMatchesByIdsFromCompetitions(Object.keys(competitionsToQuery), matchesIds, function (err, competitions) {

                if (err) {
                    res.status(501).send(err);
                    return;
                }

                tournamentDoc.competitions = [];

                for (var c = 0; c < competitions.length; c++) {
                    var competition = competitions[c];

                    tournamentDoc.competitions.push({ id : competition.competitionId, name : competition.name });

                    if (!competition.matches || competition.matches.length === 0) continue;

                    for (var m = 0; m < competition.matches.length; m++) {
                        var competitionMatch = competition.matches[m];
                        var tourMatch = matchesToGetFromCompetitions[competitionMatch.matchId];

                        if (!tourMatch) continue;

                        tourMatch.firstTeamScore = competitionMatch.firstTeamScore;
                        tourMatch.secondTeamScore = competitionMatch.secondTeamScore;
                        tourMatch.period = competitionMatch.period;
                        tourMatch.totalTime = 0;
                    }
                }

                res.status(200).send(tournamentDoc);

            }, false, true);
        });

    }, true, true, false, false, true, false);
}


function renderPlayerStatsTest (res) {
    db.getAllPlayersFromTeamsInCompetition(null, true, function (err, players) {
        if (err) {
            res.status(501).send('An error has been encountered while loading the contest. Please try again.');
            return;
        }

        players = players.sort(function (p1, p2) {
            if (!p1.salary) {
                if (!p2.salary) {
                    return 0;
                }

                return p2.salary;
            }

            if (!p2.salary) {
                return p1.salary;
            }

            return p2.salary - p1.salary;
        });

        db.getPointsStatsForAllThePlayersFromMatches(null, moment().subtract(4, 'months').toDate(), function (err, avg) {
            res.render('playerStatsTest', {
                players: players,
                avg: salaryCalculator.calculatePointsAverage(avg)
            });
        });
    });
}


function getMyTournaments (req, res) {
    if (!req.user) {
        res.status(401).send();
        return;
    }

    db.getTournamentsForUser(req.user, true, true, function (err, tournaments) {

        if (err) {
            res.status(501).send(err);
            return;
        }

        res.status(200).send({ tournaments : tournaments, userPlayers : createPlayersStringForUserEntries(tournaments), username : req.user.username });

    }, req.user.playMode)
}


function getMyTournamentsHistory (req, res) {
    //TODO implement paging
    if (!req.user) {
        res.status(401).send();
        return;
    }

    db.getTournamentsForUser(req.user, false, true, function (err, tournaments) {
        if (err) {
            res.status(501).send(err);
            return;
        }

        res.status(200).send({ tournaments : tournaments, userPlayers : createPlayersStringForUserEntries(tournaments), username : req.user.username });

    }, req.user.playMode)
}


function createPlayersStringForUserEntries (tournaments) {
    var string = '';
    var playersAdded = {};

    for (var i = 0; i < tournaments.length; i++) {
        var tournament = tournaments[i];

        for (var e = 0; e < tournament.entries.length; e++) {
            var entryPlayers = tournament.entries[e].playersIds.split(',');

            for (var p = 0; p < entryPlayers.length; p++) {
                var playerId = entryPlayers[p];

                if (playersAdded[playerId]) continue;

                playersAdded[playerId] = 1;

                var rgx = new RegExp(',(' + playerId + '(.*?),)|(^' + playerId + '(.*?),)');
                var match = tournament.players.match(rgx);

                //TODO remove test when fixed
                if (!match) {
                    logger.error('No match for player ' + playerId + ' in createPlayersStringForUserEntries. Tournament players: ' + tournament.players);
                    continue;
                }

                string += match[1];
            }
        }

        delete tournament.players;
    }

    return string;
}


function getTournamentOverview (req, res) {
    // get tournament and details of matches contained in the slate
    var tournamentId = req.query.id;

    if (!tournamentId) {
        res.status(400).send('Error: no tournament id sent to server.');
        return;
    }

    if (!helper.isObjectIdValid(tournamentId)) {
        res.status(404).send();
        return;
    }

    var username = req.user ? req.user.username : null;

    db.getTournamentOverview(tournamentId, function (err, tournament) {
        if (err) {
            res.status(501).send(err);
            return;
        }

        if (!tournament) {
            res.status(404).send();
            return;
        }

        var resObj = { tournament : tournament };

        if (username) {
            resObj['username'] = username;
        }

        res.status(200).send(resObj);

    }, username);
}


function getPlayersActions (req, res) {
    var tournamentId = req.query.tournamentId;

    if (!tournamentId) {
        res.status(400).send('Error: missing tournament id');
        return;
    }

    // restrict actions query to included players, otherwise load all players from tournament
    if (req.query.includedPlayers) {
        var includedPlayers = JSON.parse(req.query.includedPlayers);

        if (!(includedPlayers instanceof Array)) {
            res.status(400).send('Error: included players field provided, but not matching the required type Array');
            return;
        }
    }
    else {
        includedPlayers = '';
    }

    db.getTournamentByIdSimple(tournamentId, function (err, tournament) {

        if (err) {
            res.status(501).send(err);
            return;
        }

        if (!tournament) {
            res.status(404).send();
            return;
        }

        var matchesIds = [];
        for (var m = 0; m < tournament.matches.length; m++) {
            var match = tournament.matches[m];
            matchesIds.push(match.matchId);
            if (!req.query.includedPlayers) {
                includedPlayers += match.playersIds;
            }
        }

        var lastActionTimestamp = req.query.timestamp;

        // check if its valid timestamp
        if (lastActionTimestamp) {
            lastActionTimestamp = parseInt(lastActionTimestamp);

            if (isNaN(new Date(lastActionTimestamp).getTime())) {
                lastActionTimestamp = null;
            }
        }

        const requiredFields = {
            matchId : 1,
            players : 1
        };

        const filterOptions = {
            maximumTimestamp : lastActionTimestamp,
            limitResults : true,
            includedPlayers : includedPlayers
        };

        db.getPlayersActions(matchesIds, function (err, playersActions) {

            if (err) {
                res.status(501).send(err);
                return;
            }

            res.status(200).send(playersActions.actions);

        }, requiredFields, filterOptions);

    }, { 'matches.playersIds' : 1, 'matches.matchId' : 1 });
}


function cancelTournament (req, res) {
    var tournamentId = req.body.tournamentId;

    if (!isRequestValidForAdmin(req)) {
        res.status(400).send('Missing master key');
        return;
    }

    if (!tournamentId) {
        res.status(400).send('Error: no tournament id sent to server.');
        return;
    }

    db.getTournamentById(tournamentId, function (err, tournament) {
        if (err) {
            res.status(501).send(err);
            return;
        }

        if (!tournament) {
            res.status(404).send();
            return;
        }

        db.getEntriesUsernamesForTournament(tournament._id, function (err, entries) {
            if (err) {
                res.status(501).send(err);
                return;
            }

            tournamentsController.tournamentCancelled(tournament, entries);

            res.status(200).send();
        });
    });
}


function getProgrammedTournaments (req, res) {
    if (!isRequestValidForAdmin(req)) {
        res.status(400).send('Missing master key');
        return;
    }

    fs.readFile(constants.PROGRAMMED_TOURNAMENTS_FILE, 'utf8', function (err, file) {
        if (err) {
            res.status(501).send(err);
            return;
        }

        res.status(200).send(file);
    });
}


function isRequestValidForAdmin (req) {
    return ((req.user && req.user.isAdmin()) || req.body.masterKey === constants.API_MASTER_KEY || req.query.masterKey === constants.API_MASTER_KEY);
}


exports.createTournament = createTournament;
exports.createTournamentEntry = createTournamentEntry;
exports.editTournamentEntry = editTournamentEntry;
exports.deleteTournamentEntry = deleteTournamentEntry;
exports.getLobbyTournamentsAndData = getLobbyTournamentsAndData;
exports.getLiveTournaments = getLiveTournaments;
exports.getMyTournaments = getMyTournaments;
exports.getMyTournamentsHistory = getMyTournamentsHistory;
exports.getTournament = getTournament;
exports.getTournamentInfo = getTournamentInfo;
exports.getTournamentOverview = getTournamentOverview;
exports.cancelTournament = cancelTournament;
exports.getProgrammedTournaments = getProgrammedTournaments;
exports.getPlayersActions = getPlayersActions;
//exports.handleTournamentDeletion = handleTournamentDeletion;