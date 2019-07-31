var fs = require('fs');
var logger = require('../util/logger.js');
var parser = require('./FeedParser.js');
var helper = require('../util/helper.js');
var models = require('../models/index.js');
var constants = require('../util/constants.js');
var db = require('./../db/dbManager.js');
var dbHelper = require('./../db/docHelper');
var tournamentsController = require('./tournamentsController.js');
var notificationController = require('./notificationController');
var lock = require('../util/lock');
var optasportsIdScraper = require('../util/optasportsIdsScraper');
var salaryCalculator = require('../calc/salaryCalculator');
var moment = require('moment');
var scheduler = require('node-schedule');
var socket = require('../net/socket');


function handleFeed (file, callback, isMock) {
    logger.info('Parsing feed...');

    var feedParser = new parser.FeedParser();
    feedParser.parseFeed(file, function (feedFormat, result, err) {
        if (err) {
            logger.error('File parsing failed! '+file +' - Err: '+ err);
            return;
        }

        switch (feedFormat) {
            case constants.FEED_FORMAT_F1:
                competitionMatchesParsingCompleted(result);
                break;

            case constants.FEED_FORMAT_F9:
                matchParsingCompleted(result, feedParser, file, isMock);
                break;

            case constants.FEED_FORMAT_F40:
                competitionTeamsParsingCompleted(result);
                break;
        }

        if (callback) {
            callback(feedFormat, result, err);
        }

        // rename file
        if (feedFormat !== constants.FEED_FORMAT_F9) {
            var fromName = file.substring(0, file.lastIndexOf('.'));
            fs.rename(file, fromName + '_' + moment().format('DDMMYYYY_HHmmss') + '.xml');
        }

        logger.info(feedFormat + ' feed parsing completed.');
    });
}


/*
The parsed match is inserted in the db, and the stats for the players in the match are updated.
The socket event "matchUpdate" is sent.
Tournaments containing the match are updated, recalculating scores etc.
If the match is finished, the database is backed up on the cloud.
 */
function matchParsingCompleted (match, feedParser, file) {
    saveMatchFeedToFolder(match, file);

    var isMatchFinished = match.isFinished();
    var isMatchCancelled = match.isCancelled();
    if (isMatchFinished || isMatchCancelled) {
        setTimeout(function () {
            db.backupDatabase(true);
        }, 5000);
    }

    /*
     The player in the match could not have the same position that its assigned to him in its team, competition-wise.
     So to keep it consistent we need to retrieve the players from competitions, then we calculate the points for their actions.
     Finally we insert the match, actions etc etc
     */
    const requiredFields = { 'teams.players.position' : 1, 'teams.players.playerId' : 1, 'teams.name' : 1, 'teams.abbreviation' : 1,};
    db.getTeamsByIdsFromCompetition(match.competition.uID, [ match.teamsData[0].team.uID, match.teamsData[1].team.uID ], function (err, res) {

        if (err) {
            logger.error('Failed to complete match parsing! ' + err);
            return;
        }

        if (!res) {
            logger.verbose('Match parsed but no competition found in database for ID ' + match.competition.uID);
            return;
        }

        // points calculation
        const positionsForPlayers = {};
        for (var i = 0; i < res.teams.length; i++) {
            var team = res.teams[i];
            for (var j = 0; j < team.players.length; j++) {
                var position = team.players[j].position;
                if (position === 'Forward') {
                    position = 'Striker';
                }
                positionsForPlayers[team.players[j].playerId] = position;
            }

            // set correct name and abbrv
            var matchTeam = (match.teamsData[0].team.uID === team.teamId) ? match.teamsData[0].team : match.teamsData[1].team;
            matchTeam.name = team.name;
            matchTeam.abbreviation = team.abbreviation;
        }

        feedParser.calculatePointsForEveryPlayer(match, positionsForPlayers);

        // do database business
        const matchInsertedCallback = function (matchDoc, playersActionsDoc) {

            // update stats of players that played in the match
            updateStatsForMatch(match, match.competition.uID, isMatchFinished, playersActionsDoc, function (err, updatedPlayersActions) {

                if (err) {
                    logger.error('Failed to update stats for match ' + match.uID + ': ' + err);
                    return;
                }

                db.updateMatchInCompetition(match.competition.uID, match);

                // send socket event
                if (matchDoc) {
                    if (updatedPlayersActions && updatedPlayersActions.players.length > 0) {
                        var unwindPlayersActions = dbHelper.unwindPlayersActions(updatedPlayersActions, match.uID);
                    }
                    socket.matchUpdate(matchDoc, unwindPlayersActions);
                }

            });
        };

        // called only the first time that the match is inserted
        const matchCreationCallback = function (matchDoc) {
            if (match.isComing() && matchDoc.firstTeam.players && matchDoc.secondTeam.players) {
                // find inactive players and notify
                findAndUpdateNonPlayingPlayers(matchDoc);
            }
        };

        db.insertOrUpdateMatch(match, matchInsertedCallback, matchCreationCallback);

        // update tournaments
        if (!match.isComing() || isMatchCancelled) {
            var matchPlayers = {};

            for (var i = 0; i < 2; i++) {
                var teamData = match.teamsData[i];
                var players = teamData.matchPlayers;

                for (var j = 0; j < players.length; j++) {
                    matchPlayers[players[j].player.uID] = players[j];
                }
            }

            tournamentsController.updateTournamentsForMatch(match, matchPlayers, isMatchFinished, isMatchCancelled);
        }

    }, requiredFields);
}


function saveMatchFeedToFolder (match, file) {
    // save all the feeds in a folder specific for the match
    if (!constants.IS_RUNNING_LOCAL) {
        var testDir = process.cwd() + '/' + constants.MOCK_MATCHES_DIR + '/' + match.uID;
        if (!fs.existsSync(testDir)) {
            require('mkdirp').mkdirp(testDir);
        }
        fs.createReadStream(file).pipe(fs.createWriteStream(testDir + '/' + new Date().valueOf() + '.xml'));
    }
}


function competitionMatchesParsingCompleted (competition) {
    db.insertCompetitionMatches(competition);
}


function competitionTeamsParsingCompleted (competition) {
    db.insertCompetitionTeams(competition);

    optasportsIdScraper.scrapePlayersOptasportsIds(competition.competitionId);
}


/*
After a match has been parsed for the first time (pre match), the formation of the teams is known: what we want to do here is to find which ones are
the players of the teams that are not playing in the match, and notify the users having lineups containing those players.
The inactive players are marked in the slate, and also entries containing players that are inactive are marked in the tournaments.
 */
function findAndUpdateNonPlayingPlayers (matchDoc) {

    lock.acquire('updateEntriesForInactivePlayers', function () {

        // compare the players in the teams and the ones in the match and find the inactive ones
        const gotTeamsByIdsFromCompetitionsCallback = function (err, competition) {

            var matchInactivePlayers = {}; //players non playing mapped by their ids

            for (var i = 0; i < competition.teams.length; i++) {
                var team = competition.teams[i];
                var teamPlayers = team.players;
                var matchPlayers = (team.teamId === matchDoc.firstTeam.teamId) ? matchDoc.firstTeam.players : matchDoc.secondTeam.players;

                for (var j = 0; j < teamPlayers.length; j++) {
                    var teamPlayer = teamPlayers[j];
                    var isPlaying = false;

                    for (var k = 0; k < matchPlayers.length; k++) {
                        if (matchPlayers[k].playerId === teamPlayer.playerId) {
                            isPlaying = true;
                            break;
                        }
                    }

                    if (!isPlaying) {
                        matchInactivePlayers[teamPlayer.playerId] = teamPlayer;
                    }
                }
            }


            // get the tournaments containing the match and find the users that have lineups containing inactive players
            const gotOpenTournamentsWithMatch = function (err, tournaments, matchInactivePlayers) {
                if (err) {
                    logger.error('Failed to update non-playing players after match parsing: ' + err);
                    lock.release('updateEntriesForInactivePlayers');
                    return;
                }

                // update the slates related to the tournaments, setting the players that are not playing
                var slatesToBeUpdated = [];
                var usersToBeNotified = {};

                var updateTournamentEntriesBatch = db.initUnorderedBulkOperation(db.Collections.Tournaments);
                var shouldExecuteBatch = false; // dont if its empty

                for (var i = 0; i < tournaments.length; i++) {
                    var tournament = tournaments[i];
                    slatesToBeUpdated[tournament.slateId] = 1;

                    if (!tournament.entries) continue;

                    var shouldUpdateEntriesForTournament = false;

                    // find the entries containing players that are not playing
                    for (var e = 0; e < tournament.entries.length; e++) {
                        var entry = tournament.entries[e];
                        var playersIds = entry.playersIds;
                        var entryInactivePlayers = [];

                        for (var playerId in matchInactivePlayers) {
                            if (helper.indexOfPlayerInPlayersIdsString(playersIds, playerId) >= 0) {
                                entryInactivePlayers.push(playerId);
                            }
                        }

                        if (entryInactivePlayers.length > 0) {
                            entry.hasInactivePlayers = true;
                            shouldUpdateEntriesForTournament = true;

                            var username = tournament.entries[e].username;

                            var userToBeNotifiedObj = usersToBeNotified[username];
                            if (userToBeNotifiedObj) {
                                var playersObj = userToBeNotifiedObj.players[tournament._id];
                                if (playersObj) {
                                    userToBeNotifiedObj.players[tournament._id] = playersObj.concat(entryInactivePlayers);
                                }
                                else {
                                    userToBeNotifiedObj.tournaments.push(tournament);
                                    userToBeNotifiedObj.players = {};
                                    userToBeNotifiedObj.players[tournament._id] = entryInactivePlayers;
                                }
                            }
                            else {
                                usersToBeNotified[username] = {
                                    tournaments : [ tournament ],
                                    players : {}
                                };
                                usersToBeNotified[username].players[tournament._id] = entryInactivePlayers;
                            }
                        }
                    }

                    if (shouldUpdateEntriesForTournament) {
                        db.batchUpdateTournamentEntries(tournament._id, tournament.entries, updateTournamentEntriesBatch);
                        shouldExecuteBatch = true;
                    }
                }

                // notify the people
                for (var user in usersToBeNotified) {
                    if (!usersToBeNotified.hasOwnProperty(user)) continue;

                    var userToBeNotifiedObj = usersToBeNotified[user];
                    notificationController.notifyUserForTournamentsWithNonPlayingPlayers(user, userToBeNotifiedObj.tournaments, userToBeNotifiedObj.players);
                }

                if (shouldExecuteBatch) {
                    db.executeBulk(updateTournamentEntriesBatch, function (err) {
                        if (err) {
                            logger.error('Failed to execute batch to update tournaments entries for inactive lineups: ' + err);
                        }

                        lock.release('updateEntriesForInactivePlayers');
                    });
                }
                else {
                    lock.release('updateEntriesForInactivePlayers');
                }

                // update slates: get them, then set the excluded players as inactive, and finally update in db
                var slatesIds = Object.keys(slatesToBeUpdated);
                if (slatesIds.length === 0) return;

                updateSlatesForInactivePlayers(slatesIds, matchInactivePlayers);
            };


            db.getOpenTournamentsContainingMatch(matchDoc.matchId, function (err, tournaments) {

                lock.run('updateEntriesForInactivePlayers', gotOpenTournamentsWithMatch, err, tournaments, matchInactivePlayers);

            }, true, true);
        };


        db.getTeamsByIdsFromCompetition(matchDoc.competitionId, [matchDoc.firstTeam.teamId, matchDoc.secondTeam.teamId], function (err, competitions) {

            lock.run('updateEntriesForInactivePlayers', gotTeamsByIdsFromCompetitionsCallback, err, competitions);

        });

    });
}


function updateSlatesForInactivePlayers (slatesIds, excludedPlayers) {
    const LOCK_UPDATE_SLATES_INACTIVE_PLAYERS = 'updateSlatesForInactivePlayers';

    lock.acquire(LOCK_UPDATE_SLATES_INACTIVE_PLAYERS, function () {


        const gotSlatesCallback = function (err, slates) {
            if (err) {
                logger.error('Failed to update inactive players in slates: ' + err);
                lock.release(LOCK_UPDATE_SLATES_INACTIVE_PLAYERS);
                return;
            }

            var dbBatch = db.initUnorderedBulkOperation(db.Collections.Slates);

            // go through the slates and mark the inactive players
            for (var i = 0; i < slates.length; i++) {
                var slate = slates[i];

                for (var t = 0; t < slate.teams.length; t++) {
                    var team = slate.teams[t];

                    for (var p = 0; p < team.players.length; p++) {
                        if (excludedPlayers[team.players[p].playerId]) {
                            team.players[p].isInactive = true;
                        }
                    }
                }

                db.batchUpdateSlateTeams(slate._id, slate.teams, dbBatch);
            }

            db.executeBulk(dbBatch, function (err) {
                if (err) {
                    logger.error('Failed to execute batch to update slate inactive players: ' + err);
                }

                lock.release(LOCK_UPDATE_SLATES_INACTIVE_PLAYERS);
            });
        };


        db.getSlatesByIds(slatesIds, function (err, slates) {
            lock.run(LOCK_UPDATE_SLATES_INACTIVE_PLAYERS, gotSlatesCallback, err, slates)
        });
    });
}


/*
Updates the players action for the given match.
If the match has finished, the players in the competitions are updated with the points scored in the match, and their salaries
relative to the match are stored.

When no slate containing the match is found the players stats are not stored, because that means that the salary calculation
for the players hadn't been done: adding new stats for the points without a relative salary update would create inconsistency in the game.
 */
function updateStatsForMatch (match, competitionId, isMatchFinished, playersActionsDoc, callback) {
    if (!playersActionsDoc.players || playersActionsDoc.players.length === 0) {
        if (callback) {
            callback();
            return;
        }
    }

    // the slate is used to set the salaries of the players
    db.getSlateContainingMatch(match.uID, function (err, slate) {
        if (err) {
            logger.error('Failed to update stats for match ' + match.uID + ': ' + err);
            if (callback) {
                callback(err);
            }
            return;
        }

        if (slate !== null) {// dont store players actions if no slate has been created, because players dont have salaries
            db.insertOrUpdatePlayersActionsForMatch(match, playersActionsDoc, slate, function (err, updatedPlayersActions) {
                if (callback) {
                    callback(err, updatedPlayersActions);
                }
            });
        }

        // also update stored stats for players in competition
        if (isMatchFinished) {
            // add the stats of every player to their recent stats and update match in competition
            db.getTeamsByIdsFromCompetition(competitionId, [ match.teamsData[0].team.uID, match.teamsData[1].team.uID ],
                function (err, competition) {
                    if (err) {
                        logger.error('Failed to update players recent stats: ' + err);
                        return;
                    }

                    updateFinishedMatchStats(match, competition);
                });
        }
    });
}


// updates the players stored in the competition with the points of the given match
function updateFinishedMatchStats (match, competition) {
    var matchId = match.uID;
    var teamsDoc = competition.teams;
    var teamsData = match.teamsData;

    for (var i = 0; i < 2; i++) {
        var teamId = teamsDoc[i].teamId;
        var teamIndex = (teamId == teamsData[0].team.uID) ? 0 : 1;
        var matchPlayers = teamsData[teamIndex].matchPlayers;
        var teamDoc = teamsDoc[i];

        var playersDoc = teamDoc.players;

        // for every match player, look for the corresponding player in the doc
        for (var p = 0; p < matchPlayers.length; p++) {
            var player = matchPlayers[p];

            var playerId = player.player.uID;

            for (var j = 0; j < playersDoc.length; j++) {
                if (playersDoc[j].playerId === playerId) {
                    var playerDoc = playersDoc[j];

                    /*
                     If the last match id of the recent stats is the same as the current one, stop doing what we are doing
                     (i.e. maybe the feed got pushed twice or smth)
                     */
                    if (playerDoc.lastPlayedMatchId && playerDoc.lastPlayedMatchId === matchId) return;

                    playerDoc.lastPlayedMatchId = matchId;

                    // add the points of the current match to the list of the points of the last played matches for the player
                    updatePointsOfLastPlayedMatchesForPlayer(playerDoc, player.points);
                    break;
                }
            }
        }

        db.updateTeamPlayersWithTeamDoc(competition.competitionId, teamDoc); // commit players final stats
    }
}


// the points are stored as a comma separated string. Convert the string to array, insert the latest points at the head of it, and convert back to string
function updatePointsOfLastPlayedMatchesForPlayer (playerDoc, points) {
    var values = playerDoc.pointsOfLastPlayedMatches;

    if (!values || values.length === 0) {
        // if the player has no points in his history, simply assign the last ones
        playerDoc.pointsOfLastPlayedMatches = points + ',';
        return [points];
    }

    var arr = values.split(',');
    arr.unshift(points);

    // dont store more than the matches used to calculate the salary
    var size = Math.min(arr.length, salaryCalculator.getNumberOfMatchesUsedForCalculations());
    var res = '';

    for (var i = 0; i < size; i++) {
        if (i !== 0) {
            res += ',';
        }

        res += arr[i];
    }

    playerDoc.pointsOfLastPlayedMatches = res;

    return arr;
}


function scheduleOldFeedsRemoval() {
    logger.info('Scheduling old feeds removal to run every Tuesday, early morning.');

    var rule = new scheduler.RecurrenceRule();
    rule.dayOfWeek = 2;
    rule.hour = 4;
    rule.minute = 0;

    scheduler.scheduleJob(rule, function () {
        logger.info('Removing old feeds');

        removeOldFeeds(process.cwd() + constants.FTP_FEED_BASE_PATH);
        removeOldFeeds(process.cwd() + '/' + constants.MOCK_MATCHES_DIR);
    });
}


function removeOldFeeds (feedsDir) {
    logger.info('Removing old feeds from dir ' + feedsDir);

    fs.readdir(feedsDir, function (err, files) {
        if (err || !files) {
            logger.error('Failed to remove old feeds: ' + err);
            return;
        }

        var minDate = moment().add(-3, 'M').toDate();

        for (var i = 0; i < files.length; i++) {
            var file = feedsDir + '/' + files[i];

            var rgx = file.match(/(.)+.tmp/);
            if (!rgx) continue;

            // remove tmp files
            if (rgx.length > 0) {
                fs.unlink(file.toString());
                continue;
            }

            fs.stat(file, function (err, res) {
                if (err) {
                    logger.error('Failed to get info on feed: ' + err);
                    return;
                }

                if (minDate > res.mtime) {
                    var file = this;
                    logger.verbose('Deleting old feed: ' + file);

                    fs.unlink(file.toString());
                }
            }.bind(file));
        }
    });
}


exports.handleFeed = handleFeed;
exports.scheduleOldFeedsRemoval = scheduleOldFeedsRemoval;
exports.removeOldFeeds = removeOldFeeds;