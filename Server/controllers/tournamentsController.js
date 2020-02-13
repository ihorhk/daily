var models = require('../models/index.js');
var db = require('../db/dbManager.js');
var dbHelper = require('../db/docHelper.js');
var logger = require('../util/logger.js');
var moment = require('moment');
var scheduler = require('node-schedule');
var fs = require('fs');
var feedManager = require('./feedManager.js');
var feedParser = require('./FeedParser.js');
var salaryCalculator = require('../calc/salaryCalculator.js');
var tournamentsProgrammer = require('./tournamentsProgrammer.js');
var payoutCalculator = require('../calc/payoutCalculator');
var balanceController = require('../controllers/balanceController');
var socket = require('../net/socket');
var lock = require('../util/lock');
var constants = require('../util/constants');
var helper = require('../util/helper');
var emailer = require('../util/emailer');
var crypto = require('crypto');
var extend = require('util')._extend;
var Tournament = models.tournament;
var PlayMode = models.PlayMode;
var glob = require('glob');

var MOCK_MATCHES_FOLDER = process.cwd() + '/' + constants.MOCK_MATCHES_DIR + '/';
var MOCK_MATCHES_PARSING_INTERVAL = 5000;

var MAX_NUMBER_OF_NON_FEATURED_TOURNAMENTS_OPEN = 4;
var MIN_PERCENTAGE_OF_ENTRIES_TO_OPEN_NEW_NON_FEATURED_TOURNAMENT = 0.25;

const SALARY_CAP_PLAYERS_CALCULATED = 25;
const SALARY_CAP_AVERAGE_SALARY_LIMIT = 145000;
const SALARY_CAP_LOW = 850000;
const SALARY_CAP_HIGH = 1000000;


/**
 * The tournaments controller has to be initialized at the startup of the application
 */
function initTournamentsController () {
    db.getUpcomingTournaments(function (err, tournaments) {
        if (err) {
            logger.error('Failed to initialize tournaments controller: ' + err);
            return;
        }

        rescheduleUpcomingTournaments(tournaments);
        tournamentsProgrammer.init(tournaments);

    }, false, false, false, null, null, true, true);
}

function createTournamentAndScheduleIt (tournament, slate, callback, useOnlyTournamentPlayMode, tournamentCopies) {
    if (tournament.isMock && !constants.IS_RUNNING_LOCAL) {
        logger.verbose('Mock tournament creation is forbidden on this instance');
        return;
    }

    const doBusiness = function (lastSimilarTournament) {

        if (!tournamentCopies || tournamentCopies <= 0) {
            tournamentCopies = 1;
        }

        calculateSalaryCap(tournament, slate);
        applyTournamentConstraints(tournament);

        tournament.rake = tournament.entryFee * models.tournament.RAKE;

        // if there is a previous similar tournament with entries, use the payouts of that tour
        if (lastSimilarTournament && lastSimilarTournament.entries && lastSimilarTournament.entries.length > 0) {
            if (lastSimilarTournament.payoutsEntriesNumber) {
                tournament.payouts = models.tournament.parsePayoutsFromString(lastSimilarTournament.payouts);
                tournament.totalPrize = (tournament.guaranteedPrize > 0 ? tournament.guaranteedPrize : 0);
                tournament.payoutsEntriesNumber = lastSimilarTournament.payoutsEntriesNumber;
            }
            else { // recalculate
                tournament.entries = lastSimilarTournament.entries;
                payoutCalculator.calculatePayouts(tournament, true);
            }
        }
        else {
            payoutCalculator.calculatePayouts(tournament);
        }

        if (!tournament.isFeatured() && !tournament.groupId) {
            tournament.groupId = tournament.hashCode();
        }
        else {
            tournamentCopies = 1;
        }

        // create free tournaments copies if a tournament is not a freeroll
        if (tournament.entryFee > 0 && !useOnlyTournamentPlayMode) {
            var shouldCreateFreeTournamentsCopies = true;
            var tournamentActualCopies = tournamentCopies * 2;

            // multiply payouts
            var freePlayPayouts = tournament.payouts.slice();
            for (var p = 0; p < freePlayPayouts.length; p++) {
                freePlayPayouts[p] *= Tournament.FREE_TOURNAMENTS_ENTRY_FEE_MULTIPLIER;
            }
        }
        else {
            tournamentActualCopies = tournamentCopies;
        }

        if (tournament.isMock && !tournament.playMode) {
            tournament.playMode = PlayMode.REAL;
            useOnlyTournamentPlayMode = true;
        }

        if (useOnlyTournamentPlayMode) {
            var playMode = tournament.playMode;
        }
        else {
            playMode = PlayMode.REAL;
        }


        for (var i = 0; i < tournamentActualCopies; i++) {
            if (i > 0) {
                var tournamentCopy = extend({}, tournament);
            }
            else {
                tournamentCopy = tournament;
            }

            // half of the loop is for free contests, if present
            if (shouldCreateFreeTournamentsCopies && i >= tournamentCopies) {
                tournamentCopy.playMode = PlayMode.FREE;
                tournamentCopy.entryFee *= Tournament.FREE_TOURNAMENTS_ENTRY_FEE_MULTIPLIER;
                tournamentCopy.guaranteedPrize *= Tournament.FREE_TOURNAMENTS_ENTRY_FEE_MULTIPLIER;
                tournamentCopy.totalPrize *= Tournament.FREE_TOURNAMENTS_ENTRY_FEE_MULTIPLIER;
                tournamentCopy.payouts = freePlayPayouts;
            }
            else {
                tournamentCopy.playMode = playMode;
            }

            tournamentCopy.copyNumber = i;

            db.insertTournament(tournamentCopy, slate, function (err, res) {
                var tournament = this;

                if (res) {
                    tournament._id = res.insertedId;
                    scheduleTournamentStart(tournament);

                    if (!tournament.isOpen) {
                        var openingTime = Tournament.getTournamentOpeningTime(tournament);

                        // check if the opening time is already past
                        if (new Date() > openingTime) {
                            tournamentOpen(tournament);
                        }
                        else {
                            scheduleTournamentOpening(tournament);
                        }
                    }
                    else {
                        tournamentOpen(tournament);
                    }

                    var tournamentDoc = res.ops[0];
                    delete tournamentDoc.players;
                    delete tournamentDoc.payouts;
                    delete tournamentDoc.payoutsEntriesNumber;
                    delete tournamentDoc.progress;
                    delete tournamentDoc.rake;
                    tournamentDoc.entriesCount = 0;
                    socket.tournamentCreated(tournamentDoc);
                }

                if (callback) {
                    callback(tournament);
                }
            }.bind(tournamentCopy));
        }
    };



    if (tournament.programmedId && (tournament.maxEntries <= 0 || tournament.maxEntries > 100)) {
        db.getLastPlayedSimilarTournament(tournament, function (err, lastSimilarTour) {

            doBusiness(lastSimilarTour);

        }, { payouts : 1, entries : 1, totalPrize : 1, payoutsEntriesNumber : 1 })
    }
    else {
        doBusiness();
    }
}


function calculateSalaryCap (tournament, slate) {
    // calculate average salary of top N players
    var allPlayers = [];

    const comparePlayersFn = function (p1, p2) {
        return p2.salary - p1.salary > 0 ? 1 : (p2.salary - p1.salary < 0 ? -1 : 0);
    };

    for (var teamId in slate.teams) {
        var team = slate.teams[teamId];

        for (var p = 0; p < team.players.length; p++) {
            helper.insertElementInSortedArray(team.players[p], comparePlayersFn, allPlayers);
        }
    }

    var salarySum = 0;

    for (var i = 0; i < SALARY_CAP_PLAYERS_CALCULATED; i++) {
        salarySum += allPlayers[i].salary;
    }

    const averageSalary = Math.round(salarySum / SALARY_CAP_PLAYERS_CALCULATED);
    if (averageSalary < SALARY_CAP_AVERAGE_SALARY_LIMIT) {
        tournament.salaryCap = SALARY_CAP_LOW;
    }
    else {
        tournament.salaryCap = SALARY_CAP_HIGH;
    }
}


function applyTournamentConstraints (tournament) {
    // check the validity of the tournament type
    var tournamentType = tournament.type;
    var validType = false;
    Object.keys(models.TournamentType).forEach( function (key) {
        if (key === tournamentType) {
            validType = true;
        }
    });

    if (!validType) {
        logger.error('Invalid tournament type for programmed tournament. Must be one of the fields of TournamentType.');
        return;
    }

    // check subtype
    var subtype = tournament.subtype;

    if (subtype) {
        validType = false;
        Object.keys(models.TournamentSubtype).forEach(function (key) {
            if (key === subtype) {
                validType = true;
            }
        });

        if (!validType) {
            logger.error('Invalid tournament subtype for programmed tournament. If provided, must be one of the fields of TournamentSubtype.');
            return;
        }
    }

    var isMultiEntry = tournament.flags && tournament.flags.indexOf(models.TournamentFlags.MULTI_ENTRY) >= 0;

    if (tournament.type === models.TournamentType.HEAD_TO_HEAD) {
        tournament.maxEntries = 2;
        tournament.guaranteedPrize = 0;

        if (isMultiEntry) {
            tournament.flags.splice(tournament.flags.indexOf(models.TournamentFlags.MULTI_ENTRY), 1);
            isMultiEntry = false;
        }
    }

    if (isMultiEntry && tournament.entryFee > 0) {
        if (tournament.multiEntries > 0) {
            tournament.multiEntries = Math.min(tournament.multiEntries, Tournament.MAX_MULTI_ENTRIES);
        }
        else {
            if (tournament.maxEntries > 0) {
                var maxEntriesProp = Math.max(1, Math.round(tournament.maxEntries * 0.025));
                tournament.multiEntries = Math.min(maxEntriesProp, Tournament.MAX_MULTI_ENTRIES);
            }
            else {
                tournament.multiEntries = Tournament.MAX_MULTI_ENTRIES;
            }
        }
    }
    else {
        tournament.multiEntries = 1;
    }

    if (tournament.guaranteedPrize > 0 && (!tournament.flags || tournament.flags.indexOf(models.TournamentFlags.GUARANTEED) < 0)) {
        if (tournament.flags) {
            tournament.flags.push(models.TournamentFlags.GUARANTEED);
        }
        else {
            tournament.flags = [models.TournamentFlags.GUARANTEED];
        }
    }
}


function scheduleTournamentOpening (tournament) {
    var openingTime = Tournament.getTournamentOpeningTime(tournament);

    scheduler.scheduleJob(openingTime, function () {
        tournamentOpen(tournament);
    });
}


function scheduleTournamentStart (tournament) {
    scheduler.scheduleJob(tournament.startDate, function () {
        db.getTournamentById(tournament._id, function (err, tournament) {
            if (err) {
                logger.error('Failed to start tournament! ' + err);
                return;
            }

            tournamentStart(tournament);

        }, true, false, false, false, tournament.isMock);
    });
}


function scheduleMatchesStartForMockTournament (tournament) {
    if (!constants.TEST_VERSION) return;

    // for every match, schedule the start of the match
    for (var i = 0; i < tournament.matches.length; i++) {
        var match = tournament.matches[i];

        // check if folder for tournament exists
        fs.stat(MOCK_MATCHES_FOLDER + match.matchId, function(err) {

            if (err == null) {
                var matchStart = function (match) {
                    logger.debug('Match ' + match.matchId + ' has started!');

                    scheduleFeedParsingForMockTournamentMatch(match);
                };

                if (this.startDate > Date.now()) {
                    scheduler.scheduleJob(this.startDate, function () {
                        matchStart(this);
                    }.bind(this));
                }
                else {
                    matchStart(this);
                }
            }
            else {
                logger.error('Folder with mock feeds for match ' + this.matchId + ' doesnt exists');
            }
        }.bind(match));
    }
}


function scheduleFeedParsingForMockTournamentMatch (match) {
    if (new Date() > match.startDate) {
        match.startDate = moment().toDate();
    }

    match.testMockFileIndex = 0;

    // every minute after the start of the match until the end of the match, a feed is parsed from a folder related to the match
    var matchScheduler = setInterval(
        function () {

            var feedFile = getNextMockMatchToParse(match);
            logger.debug('Parsing feed for mock match ' + match.matchId + ': ' + feedFile);

            feedManager.handleFeed(feedFile, function (feedFormat, match) {

                if (match && match.isFinished()) {
                    clearInterval(matchScheduler);
                }
            }, true);

        }.bind(match),
        MOCK_MATCHES_PARSING_INTERVAL
    );
}


function getNextMockMatchToParse (match) {
    var files = fs.readdirSync(MOCK_MATCHES_FOLDER + match.matchId);

    if (match.testMockFileIndex >= files.length) return;

    var file = files[match.testMockFileIndex];
    match.testMockFileIndex++;
    return MOCK_MATCHES_FOLDER + match.matchId + '/' + file;
}

function updateTournamentsForMatch (match, matchPlayers, isMatchFinished, isMatchCancelled) {

    // acquire a lock to prevent data from being non consistent (entries.matchesPoints for example)
    lock.acquire('updateTournamentsForMatch', function () {

        var matchId = match.uID;

        // Update points for users. First get all the tournament entries for all tournaments containing the parsed matchId
        const gotTournamentsWithMatch = function (err, tournaments) {
            if (err) {
                lock.release('updateTournamentsForMatch');
                return;
            }

            var dbBatch = db.initUnorderedBulkOperation(db.Collections.Tournaments);
            var shouldExecuteBatch = false; // dont if its empty

            // loop through the tournaments and calculate the points for every player
            for (var i = 0; i < tournaments.length; i++) {
                var tournament = tournaments[i];

                // count the finished matches and find the index of the match in the matches array contained in the tournament
                var finishedMatchesCount = 0;
                var cancelledMatchesCount = 0;
                var matchPos = -1;
                var hasMatchJustFinished = false;

                // also calculate tournament progress
                var totalMinutes = 0;
                var minutesSum = 0;

                for (var j = 0; j < tournament.matches.length; j++) {
                    var tempMatch = tournament.matches[j];

                    if (tempMatch.isFinished) {
                        finishedMatchesCount++;
                    }
                    else if (tempMatch.isCancelled) {
                        cancelledMatchesCount++;
                    }

                    if (tempMatch.matchId == matchId) {
                        var tournamentMatch = tempMatch;
                        matchPos = j;

                        if (isMatchCancelled && !tournamentMatch.isCancelled) {
                            match.isCancelled = tournamentMatch.isCancelled = true;
                            hasMatchJustFinished = true;
                        }
                        else if (isMatchFinished && !tournamentMatch.isFinished) {
                            match.isFinished = tournamentMatch.isFinished = true;
                            hasMatchJustFinished = true;
                        }
                    }

                    var matchTime = tempMatch.minutesPlayed;
                    minutesSum += matchTime;
                    totalMinutes += ((tempMatch.isFinished || tempMatch.isCancelled) ? matchTime : Math.max(90, matchTime));
                }

                tournament.progress = Math.min(100, Math.round((minutesSum * 100) / totalMinutes));

                // update minutes played for that match
                var shouldUpdateMatches = (tournamentMatch.minutesPlayed != match.match_time);
                if (shouldUpdateMatches) {
                    tournamentMatch.minutesPlayed = match.match_time;
                }

                /*
                A contest ends when all the matches have finished, or when a match has been cancelled and there is only one "normal" match left
                 */
                if ((isMatchCancelled || isMatchFinished) && hasMatchJustFinished) { // check if the match hasnt already been marked as finished (multiple feeds sent)
                    if (isMatchCancelled) {
                        cancelledMatchesCount++;
                    }
                    else {
                        finishedMatchesCount++;
                    }

                    if (tournamentMatch.isCancelled && (tournament.matches.length - cancelledMatchesCount === 1)) {
                        tournamentCancelled(tournament);
                    }
                    else if ((finishedMatchesCount + cancelledMatchesCount) == tournament.matches.length) {
                        tournamentFinished(tournament);
                    }

                    shouldUpdateMatches = true;
                }

                // update only if matches time has changed
                if (shouldUpdateMatches) {
                    db.updateTournamentFields(tournament._id,
                        [ db.TOURNAMENT_UPDATE_FIELDS.MATCHES, db.TOURNAMENT_UPDATE_FIELDS.PROGRESS ],
                        [ tournament.matches, tournament.progress ]);
                }

                // ----- entries ------
                if (!tournament.entries) continue;

                const sortedEntries = [];
                const sortEntriesFn = function (e1, e2) {
                    var res = e1.totalPoints - e2.totalPoints;
                    return res > 0 ? -1 : (res < 0 ? 1 : 0);
                };

                // update points
                for (j = 0; j < tournament.entries.length; j++) {
                    var entry = tournament.entries[j];
                    updatePointsAndProgressForEntry(entry, matchPlayers, matchPos, match, tournament.matches);

                    helper.insertElementInSortedArray(entry, sortEntriesFn, sortedEntries);
                }

                tournament.entries = sortedEntries;

                // calculate payouts for entries
                const payouts = tournament.payouts.split(',');
                for (var p = 0; p < payouts.length; p++) {
                    payouts[p] = parseFloat(payouts[p]);
                }

                var payoutsToBeSplit = [];
                var lastEntryPoints = undefined;

                for (var j = 0; j < tournament.entries.length; j++) {
                    var entry = tournament.entries[j];

                    if (lastEntryPoints === entry.totalPoints) {
                        var isLastEntryEqualPoints = (j === tournament.entries.length - 1);
                        if (isLastEntryEqualPoints) {
                            payoutsToBeSplit.push(payouts[j] || 0);
                        }
                        else {
                            payoutsToBeSplit.push(payouts[j - 1] || 0);
                            continue;
                        }
                    }

                    // make the payouts even to the lowest one and spread the difference
                    if (payoutsToBeSplit.length > 0 && j > 0) {
                        payoutsToBeSplit.push(payouts[j - 1] || 0);

                        var diff = 0;
                        const basePayout = payoutsToBeSplit[payoutsToBeSplit.length - 1];
                        for (var p = 0; p < payoutsToBeSplit.length; p++) {
                            diff += payoutsToBeSplit[p] - basePayout;
                        }
                        var spreadPayout = diff / payoutsToBeSplit.length + basePayout;

                        for (p = 0; p < payoutsToBeSplit.length; p++) {
                            var place = j - (p + (isLastEntryEqualPoints ? 0 : 1));
                            var previousEntry = tournament.entries[place];
                            previousEntry.prize = spreadPayout;
                            previousEntry.pos = place + 1;
                        }

                        payoutsToBeSplit.length = 0;
                    }

                    if (lastEntryPoints !== entry.totalPoints) {
                        entry.prize = payouts[j] || 0;
                        entry.pos = j + 1;
                        lastEntryPoints = entry.totalPoints;
                    }
                }

                // add update op to batch
                db.batchUpdateTournamentEntries(tournament._id, tournament.entries, dbBatch);
                shouldExecuteBatch = true;
            }

            if (shouldExecuteBatch) {
                const dbUpdated = function (err) {
                    if (err) {
                        logger.error('Failed to execute batch to update tournaments entries: ' + err);
                    }
                    else {
                        socket.tournamentUpdate(tournament._id, tournament);
                    }

                    lock.release('updateTournamentsForMatch');
                };


                db.executeBulk(dbBatch, function (err) {

                    lock.run('updateTournamentsForMatch', dbUpdated, err, this);

                }.bind(tournament));
            }
            else {
                lock.release('updateTournamentsForMatch');
            }
        };


        db.getActiveTournamentsContainingMatch(matchId, function (err, tournaments) {
            lock.run('updateTournamentsForMatch', gotTournamentsWithMatch, err, tournaments);
        });
    });
}


function updatePointsAndProgressForEntry (entry, matchPlayers, matchPos, match, allMatches) {
    var playersIds = entry.playersIds.split(',');
    var matchPoints = 0;
    var totalMinutes = 0;
    var minutesPlayedByLineup = 0;

    for (var k = 0; k < playersIds.length; k++) {
        var playerId = playersIds[k];
        var player = matchPlayers[playerId];
        var matchTime;

        if (player) {
            // player is contained in match
            matchPoints += player.points;
            matchTime = match.match_time;
            var tempMatch = match;
        }
        else {
            // look for the match containing the player
            for (var i = 0; i < allMatches.length; i++) {
                tempMatch = allMatches[i];
                if (helper.indexOfPlayerInPlayersIdsString(tempMatch.playersIds, playerId) >= 0) {
                    matchTime = tempMatch.minutesPlayed;
                    break;
                }
            }
        }

        minutesPlayedByLineup += matchTime;
        totalMinutes += ((tempMatch.isFinished || tempMatch.isCancelled) ? matchTime : Math.max(90, matchTime));
    }

    if (!entry.matchesPoints) {
        entry.matchesPoints = [];
    }
    entry.matchesPoints[matchPos] = matchPoints;

    var totalPoints = 0;

    // calculate total points summing the matches
    for (var m = 0; m < entry.matchesPoints.length; m++) {
        if (!entry.matchesPoints[m]) continue;

        totalPoints += entry.matchesPoints[m];
    }

    entry.totalPoints = totalPoints;

    // calculate progress
    entry.progress = Math.min(100, Math.round((minutesPlayedByLineup * 100) / totalMinutes));
    entry.projectedPoints = entry.progress === 0 ? 0 : Math.round((entry.totalPoints * 100 / entry.progress));
}


function tournamentFinished (tournament) {
    logger.info('Tournament ' + tournament._id.toString() + ' has finished!');

    db.updateTournamentFields(
        tournament._id,
        [ db.TOURNAMENT_UPDATE_FIELDS.IS_ACTIVE, db.TOURNAMENT_UPDATE_FIELDS.FINISHED_AT ],
        [ false, new Date() ]);

    balanceController.assignPayoutsForTournament(tournament);
    socket.tournamentFinished(tournament._id);
}


function tournamentStart (tournament) {
    if (tournament.isMock) {
        scheduleMatchesStartForMockTournament(tournament);
    }

    if (!tournament.entries) {
        tournament.entries = [];
    }
    var entries = tournament.entries;
    tournament.entriesCount = entries.length;

    // if there is only one user (1+ entries) registered to the tournament, cancel it
    var shouldCancel = true;
    for (var i = 1; i < entries.length; i++) {
        var entry = entries[i];
        if (shouldCancel && entry.username !== entries[0].username) {
            shouldCancel = false;
            break;
        }
    }

    if (shouldCancel && (!tournament.isMock || entries.length === 0)) {
        tournamentCancelled(tournament);
        return;
    }

    logger.info('Tournament ' + tournament._id.toString() + ' has started!');

    var fieldsToBeUpdated = [db.TOURNAMENT_UPDATE_FIELDS.IS_ACTIVE, db.TOURNAMENT_UPDATE_FIELDS.IS_OPEN];
    var valuesToBeUpdated = [true, false];

    if (tournament.payouts instanceof String) { //TODO remove this crazy stuff when the models problem is fixed
        tournament.payouts = tournament.payouts.split(',');
    }

    if (tournament.payouts.length > tournament.entriesCount) {
        var payouts = payoutCalculator.calculatePayouts(tournament, true, true);

        if (payouts) {
            payouts = Tournament.payoutsToString(payouts);

            fieldsToBeUpdated.push(db.TOURNAMENT_UPDATE_FIELDS.PAYOUTS);
            valuesToBeUpdated.push(payouts);

            fieldsToBeUpdated.push(db.TOURNAMENT_UPDATE_FIELDS.PAYOUTS_ENTRIES_NUMBER);
            valuesToBeUpdated.push(tournament.payoutsEntriesNumber);
        }
    }

    db.updateTournamentFields(tournament._id, fieldsToBeUpdated, valuesToBeUpdated);
    socket.tournamentStarted(tournament._id, entries);
}


function tournamentCancelled (tournament, entriesUsernames) {
    logger.info('Tournament ' + tournament._id.toString() + ' has been cancelled!');

    if (!entriesUsernames) {
        entriesUsernames = [];
        for (var e = 0; e < tournament.entries.length; e++) {
            entriesUsernames.push(tournament.entries[e].username);
        }
    }

    db.updateTournamentFields(tournament._id,
        [ db.TOURNAMENT_UPDATE_FIELDS.IS_CANCELLED, db.TOURNAMENT_UPDATE_FIELDS.IS_OPEN, db.TOURNAMENT_UPDATE_FIELDS.IS_ACTIVE, db.TOURNAMENT_UPDATE_FIELDS.FINISHED_AT ],
        [ true, false, false, new Date() ]);
    socket.tournamentCancelled(tournament._id);

    if (entriesUsernames.length === 0) return;

    // give back the money to the registered users
    entriesUsernames.sort();
    var username;
    var count;

    var uniqueUsernames = [];
    var userBalanceBatch = db.initUnorderedBulkOperation(db.Collections.Users);
    var balanceUpdateBatch = db.initUnorderedBulkOperation(db.Collections.BalanceUpdates);

    for (var i = 0; i < entriesUsernames.length; i++) {
        if (!username) {
            username = entriesUsernames[i];
            count = 1;
            uniqueUsernames.push(username);
        }
        else {
            if (username === entriesUsernames[i]) {
                count++;
            }
            else {
                var userTotalAmount = count * tournament.entryFee;
                db.batchUpdateUserBalance(username, userTotalAmount, userBalanceBatch, tournament.playMode);
                db.batchInsertBalanceUpdate(username, userTotalAmount, models.BalanceUpdate.TOURNAMENT_CANCELLED, tournament, null, tournament.playMode, balanceUpdateBatch);

                username = entriesUsernames[i];
                count = 1;
                uniqueUsernames.push(username);
            }
        }
    }

    userTotalAmount = count * tournament.entryFee;
    db.batchInsertBalanceUpdate(username, userTotalAmount, models.BalanceUpdate.TOURNAMENT_CANCELLED, tournament, null, tournament.playMode, balanceUpdateBatch);
    db.batchUpdateUserBalance(username, userTotalAmount, userBalanceBatch, tournament.playMode);
    db.executeBulk(balanceUpdateBatch, function (err) {
        if (err) {
            logger.error('Failed to insert batch of balance updates after tournament cancelled: ' + err);
        }
    });
    db.executeBulk(userBalanceBatch, function (err) {
        if (err) {
            emailer.sendErrorEmail('Failed to execute batch to update users balance for tournament ' + tournament._id, err + ' cancel ||| entries: ' + this);
            logger.emerg('Failed to execute batch to update users balance for tournament ' + tournament._id + ' cancel: ' + err);
            return;
        }

        // get the updated users and notify via socket
        db.getUsers(this, { username : 1, balance : 1, freeMoneyBalance : 1 }, function (err, users) {
            if (!err) {
                for (var i = 0; i < users.length; i++) {
                    var user = users[i];

                    if (Tournament.isTournamentFreePlayMode(tournament)) {
                        socket.freeMoneyBalanceUpdate(user.username, user.freeMoneyBalance);
                    }
                    else {
                        socket.balanceUpdate(user.username, user.balance);
                    }
                }
            }
        });
    }.bind(uniqueUsernames));
}


function tournamentOpen (tournament) {
    logger.info('Tournament ' + tournament._id.toString() + ' has opened! #' + tournament.copyNumber);

    tournament.isOpen = true;

    // for tournaments that are copies within the same group, calculate slate salaries only for the first copy
    if (tournament.copyNumber && tournament.copyNumber > 1) {
        db.updateTournamentFields(tournament._id, db.TOURNAMENT_UPDATE_FIELDS.IS_OPEN, true);
    }
    else {
        db.getSlateById(tournament.slateId, function (err, slate) {
            if (err) {
                logger.error('Failed to open tournament ' + tournament._id + ': ' + err);
                return;
            }

            calculateSalaryForOpenTournament(slate, function (slateDoc) {
                tournament.slate = slateDoc;

                db.updateTournamentFields(tournament._id, db.TOURNAMENT_UPDATE_FIELDS.IS_OPEN, true);
            });

            for (var i = 0; i < slate.matches.length; i++) {
                var slateMatch = slate.matches[i];

                db.deletePlayersActions(slateMatch.matchId);
                db.deleteMatch(slateMatch.matchId);
            }

            if (tournament.isMock) {
                mockTournamentOpen(tournament, slate);
            }
        })
    }
}

function mockTournamentOpen(tournament, slate) {
    if (!constants.IS_RUNNING_LOCAL) return;

    for (var m = 0; m < slate.matches.length; m++) {
        var slateMatch = slate.matches[m];

        // we need to parse the matches and change their data so that they look like pre matches
        var basePath = MOCK_MATCHES_FOLDER + slateMatch.matchId;
        glob(basePath + '/*', function (err, files) {

            if (files.length === 0 || err) {
                logger.error('Failed to open mock tournament, no mock matches found at ' + basePath);
                return;
            }

            var parser = new feedParser.FeedParser();
            parser.parseFeed(files[0], function (feedFormat, match, err) {
                if (err) {
                    logger.error('File parsing failed! '+file +' - Err: '+ err);
                    return;
                }

                match.date = slateMatch.startDate;
                match.period = models.MatchPeriod.PRE_MATCH;
                match.match_time = 0;
                match.resultType = null;
                match.first_half_time = -1;
                match.second_half_time = -1;
                match.winner = null;

                for (var j = 0; j < 2; j++) {
                    var teamData = match.teamsData[j];
                    teamData.bookings = [];
                    teamData.goals = [];
                    teamData.goals_conceded = 0;
                    teamData.missedPenalties = [];
                    teamData.penaltyShots = [];
                    teamData.score = 0;
                    teamData.shootOutScore = -1;
                    teamData.substitutions = [];

                    for (var p = 0; p < teamData.matchPlayers.length; p++) {
                        var player = teamData.matchPlayers[p];
                        player.actions = [];
                        player.points = 0;
                        player.stats = new models.stats.Stats();
                    }
                }

                db.insertOrUpdateMatch(match, null, null);
            });

        });
    }
}


function calculateSalaryForOpenTournament (slateDoc, callback) {
    if (slateDoc.salariesCalculated) return; // dont recalculate

    var teamsToCompetitions = [];
    var competitionsIds = [];

    for (var i = 0; i < slateDoc.matches.length; i++) {
        var match = slateDoc.matches[i];

        competitionsIds.push(match.competitionId);
        teamsToCompetitions.push({ teamId : match.firstTeamId, competitionId : match.competitionId });
        teamsToCompetitions.push({ teamId : match.secondTeamId, competitionId : match.competitionId });
    }

    db.getTeamsByIdsFromMultipleCompetitions(teamsToCompetitions, function (err, competitions) {
        if (err) {
            logger.error(res, 'Failed to calculate salaries for tournament opening: ' + err);
            return;
        }

        // add players to slate
        dbHelper.addTeamsToSlateDoc(slateDoc, competitions);

        // finally calculate salary
        salaryCalculator.calculateSalaryForSlate(slateDoc, callback, competitionsIds);
    });
}


function rescheduleUpcomingTournaments (tournaments) {
    logger.info('Rescheduling upcoming tournaments.');

    for (var i = 0; i < tournaments.length; i++) {
        var tournament = tournaments[i];

        if (!tournament.isOpen) {
            var openingTime = Tournament.getTournamentOpeningTime(tournament);

            if (Date.now() > openingTime) {
                tournamentOpen(tournament);
            }
            else {
                scheduleTournamentOpening(tournament);
            }
        }
        else if (Date.now() > tournament.startDate) {
            tournamentStart(tournament);
        }
        else {
            scheduleTournamentStart(tournaments[i]);
        }
    }
}

function addEntryToTournament (tournamentModel, username, lineup, callback) {
    if (!tournamentModel.entries) {
        tournamentModel.entries = [];
    }
    var entries = tournamentModel.entries;
    var tournamentEntryDoc = { username : username, playersIds : lineup, prize : 0 };
    var userEntriesCount = 0;
    var lastEntry;

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.username !== username) continue;

        userEntriesCount++;
        lastEntry = entry;
    }

    var maxNumberOfEntries = (tournamentModel.isMultiEntry() ? tournamentModel.multiEntries : 1);

    // max number of multi entries reached
    if (userEntriesCount >= maxNumberOfEntries) {
        callback(null, null, true);
        return;
    }

    userEntriesCount++;

    // there was only one entry before, so update the title to add the entry number
    if (userEntriesCount === 2) {
        lastEntry.title = getTitleForEntry(lastEntry, userEntriesCount);
    }

    tournamentEntryDoc.entryNumber = userEntriesCount;
    tournamentEntryDoc.title = getTitleForEntry(tournamentEntryDoc, userEntriesCount);
    entries.push(tournamentEntryDoc);

    if (tournamentModel.entries.length > tournamentModel.payoutsEntriesNumber) {
        payoutCalculator.calculatePayouts(tournamentModel);
    }
    else {
        tournamentModel.totalPrize = payoutCalculator.calculateTotalPrize(tournamentModel.entriesCount, tournamentModel.entryFee, tournamentModel.rake);
    }

    // generate entry id. It needs to be unique within user entries
    crypto.randomBytes(8, function(err, buffer) {
        tournamentEntryDoc.entryId = buffer.toString('hex');

        db.updateTournamentEntriesAndPayouts(tournamentModel, entries, function (err) {
            if (err) {
                callback(err);
                return;
            }

            balanceController.updateBalanceForNewTournamentEntry(username, tournamentModel);
            socket.tournamentEntryAdded(tournamentModel.tournamentId, tournamentEntryDoc, Tournament.payoutsToString(tournamentModel.payouts));

            callback(null, tournamentEntryDoc);
        });
    });

    // create a new tournament copy if necessary
    if (!tournamentModel.isFeatured() && tournamentModel.maxEntries > 0 &&
                tournamentModel.entriesCount >= (tournamentModel.maxEntries * MIN_PERCENTAGE_OF_ENTRIES_TO_OPEN_NEW_NON_FEATURED_TOURNAMENT)) {

        // we need to lock this part of the process, otherwise more contests than the allowed amount could be created because of asynchroniciticism
        lock.acquire('checkIfShouldCreateNewIdenticalContest', function () {

            const countTournamentsCallback = function (err, count) {
                if (err) {
                    lock.release('checkIfShouldCreateNewIdenticalContest');
                    return;
                }

                if (count < MAX_NUMBER_OF_NON_FEATURED_TOURNAMENTS_OPEN) {

                    // the tournament model that we have now it incomplete: we also need the slate
                    const gotSlateCallback = function (err, slate) {
                        if (err) {
                            lock.release('checkIfShouldCreateNewIdenticalContest');
                            return;
                        }

                        // insert a copy of the tournament and finally release the lock
                        createTournamentAndScheduleIt(tournamentModel, slate, function () {
                            lock.release('checkIfShouldCreateNewIdenticalContest');
                        }, true);
                    };


                    db.getSlateById(tournamentModel.slateId, function (err, slate) {
                        lock.run('checkIfShouldCreateNewIdenticalContest',gotSlateCallback, err, slate);
                    }, true);
                }
                else {
                    lock.release('checkIfShouldCreateNewIdenticalContest');
                }
            };


            db.getCountOfNonFullTournamentsWithGroupId(tournamentModel.groupId, function (err, count) {
                lock.run('checkIfShouldCreateNewIdenticalContest', countTournamentsCallback, err, count);
            });
        });
    }
}

function deleteEntryFromTournament (tournament, entryId, username, callback) {
    if (!tournament.entries) {
        tournament.entries = [];
    }
    var entries = tournament.entries;
    var entryIndex = -1;
    var userEntriesCount = 0;
    var userEntries = [];

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.username !== username) continue;

        userEntriesCount++;
        if (entry.entryId === entryId) {
            entryIndex = i;
        }
        else {
            userEntries.push(entry);
        }
    }

    // not found
    if (entryIndex < 0) {
        callback();
        return;
    }

    const removedEntry = entries[entryIndex];
    entries.splice(entryIndex, 1);
    userEntriesCount--;

    // update title if there is only one entry remaining, to remove the entry number
    if (userEntriesCount === 1) {
        entry = userEntries[0];
        entry.entryNumber = 1;
        entry.title = getTitleForEntry(entry, userEntriesCount);
    }
    else if (userEntriesCount != removedEntry.entryNumber) {
        // fix entry numbers
        for (i = 0; i < userEntries.length; i++) {
            entry = userEntries[i];
            entry.entryNumber = i + 1;
            entry.title = getTitleForEntry(entry, userEntriesCount);
        }
    }

    if (tournament.entries.length < tournament.payoutsEntriesNumber) {
        payoutCalculator.calculatePayouts(tournament);
    }
    else {
        tournament.totalPrize = payoutCalculator.calculateTotalPrize(tournament.entries, tournament.entryFee, tournament.rake);
    }

    const payoutsString = Tournament.payoutsToString(tournament.payouts);

    db.updateTournamentEntriesAndPayouts(tournament, entries, function (err) {
        if (!err) {
            balanceController.updateBalanceForRemovedTournamentEntry(username, tournament);
            socket.tournamentEntryRemoved(tournament.tournamentId, removedEntry, payoutsString);
        }

        callback(err, removedEntry);
    });
}


function getTitleForEntry (entry, userEntriesCount) {
    if (userEntriesCount === 1) {
        return entry.username;
    }
    return entry.username + ' #' + entry.entryNumber;
}


exports.updateTournamentsForMatch = updateTournamentsForMatch;
exports.initTournamentsController = initTournamentsController;
exports.createTournamentAndScheduleIt = createTournamentAndScheduleIt;
exports.calculateSalaryForOpenTournament = calculateSalaryForOpenTournament;
exports.tournamentCancelled = tournamentCancelled;
exports.addEntryToTournament = addEntryToTournament;
exports.deleteEntryFromTournament = deleteEntryFromTournament;