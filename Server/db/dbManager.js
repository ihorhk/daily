// For functions that query the database, the document is always returned by default. Not all methods support models as returned objects

var database = require('./Database.js');
var logger = require('../util/logger.js');
var constants = require('../util/constants.js');
var bson = require('bson');
var models = require('../models/index.js');
var helper = require('../util/helper.js');
var emailer = require('../util/emailer.js');
var crypt = require('../util/crypt.js');
var dbHelper = require('./docHelper.js');
var moment = require('moment');
var extend = require('util')._extend;
var ObjectId = require('mongodb').ObjectID;
var cache = require('./cacheManager');
var lock = require('../util/lock');
var dbOrganizer = require('./dbOrganizer');
var PlayMode = models.PlayMode;
var PlayerAction = models.playerAction;
var exec = require('child_process').exec;
var scheduler = require('node-schedule');
var PlayerPosition = require('../models/enums/PlayerPosition');



/*
 ****************   GENERIC    ****************
 */

var lastBackupTime = 0;
var priorityBackupJob;
var BACKUP_MIN_INTERVAL = 60 * 5 * 1000;


// database backup is executed max once every 5 min, and minimum once every two hours
function backupDatabase (hasPriority) {
    var now = new Date().valueOf();
    if (now - lastBackupTime > BACKUP_MIN_INTERVAL) {
        executeBackup();
    }
    else if (hasPriority && !priorityBackupJob) {
        // schedule job 5 minutes after lastBackup
        priorityBackupJob = scheduler.scheduleJob(new Date(lastBackupTime + BACKUP_MIN_INTERVAL), function () {
            executeBackup();
        })
    }
}


function executeBackup () {
    if (constants.SERVER_IP !== constants.PRODUCTION_SERVER_IP) return;

    logger.info('Executing MongoDB backup on S3 Bucket');

    lastBackupTime = new Date().valueOf();

    exec("sudo " + constants.CWD + "/mongodb_backup_script", function (error,stdout,stderr) {
        if (constants.GLOBAL_DEBUG) {
            logger.debug(stdout);
            logger.debug(stderr);
        }

        if (error !== null) {
            logger.error('MongoDB backup failed! ' + error);
        }

        logger.info('MongoDB backup completed.');
    });
}


function initUnorderedBulkOperation (collection) {
    return database.db.collection(collection).initializeUnorderedBulkOp({ w : 1 });
}


function executeBulk (batch, callback) {
    batch.execute({ w : 1 }, function (err, res){
        if (callback) {
            callback(err, res);
        }
    });
}


function clearAllSessions () {
    database.db.collection(database.Collections.Sessions).deleteMany({}, { w : 1 });
}


/*
 ****************   MATCHES    ****************
 */

/**
 * Upserts the given match
 * @param match - the model of the match to be upserted
 * @param completionCallback(match, playerStatsDoc)[optional] - where res is the new inserted match document
 * @param insertionCallback(match)[optional] - called when the upsert of the match results in a new document
 */
function insertOrUpdateMatch (match, completionCallback, insertionCallback, isOldMatch) {
    logger.verbose('Inserting match ' + match.uID);

    if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    var firstTeamData = match.teamsData[0];
    var secondTeamData = match.teamsData[1];
    var playerStatsDoc = {
        matchId : match.uID,
        matchStartDate : match.date,
        seasonId : match.seasonId,
        competitionId : match.competition.uID,
        firstTeamId : firstTeamData.team.uID,
        firstTeamName : firstTeamData.team.name,
        secondTeamId : secondTeamData.team.uID,
        secondTeamName : secondTeamData.team.name, //TODO is it necessary to repeat also team name here?
        players : []
    };

    var upsert = {
            $setOnInsert : {
                matchId : match.uID,
                competitionId : match.competition.uID,
                attendance : match.attendance,
                matchType : match.matchType,
                weather : match.weather,
                matchOfficial : match.matchOfficial,
                seasonName : match.seasonName,
                seasonId : match.seasonId,
                matchDay : match.matchDay,
                roundNumber : match.roundNumber,
                roundName : match.roundName,
                roundPool : match.roundPool,
                previousMatchId : match.previousMatchId,
                'firstTeam.teamId' : firstTeamData.team.uID,
                'firstTeam.teamName' : firstTeamData.team.name,
                'firstTeam.abbreviation' : firstTeamData.team.abbreviation,
                'firstTeam.teamCountry' : firstTeamData.team.country,
                'firstTeam.side' : firstTeamData.side,
                'firstTeam.formationUsed' : firstTeamData.formation_used,
                'secondTeam.teamId' : secondTeamData.team.uID,
                'secondTeam.teamName' : secondTeamData.team.name,
                'secondTeam.abbreviation' : secondTeamData.team.abbreviation,
                'secondTeam.teamCountry' : secondTeamData.team.country,
                'secondTeam.side' : secondTeamData.side,
                'secondTeam.formationUsed' : secondTeamData.formation_used
            },
            $set : {
                startDate : match.date,
                period : match.period,
                lastUpdate : match.timeStamp,
                resultType : match.resultType,
                winnerId : (match.winner ? match.winner.uID : null),
                totalTime : match.match_time,
                firstHalfTime : match.first_half_time,
                secondHalfTime : match.second_half_time,
                'firstTeam.score' : firstTeamData.score,
                'firstTeam.shootOutScore' : firstTeamData.shootOutScore,
                'firstTeam.goalsConceded' : firstTeamData.goals_conceded,
                'firstTeam.players' : dbHelper.createDocumentFromMatchPlayers(firstTeamData.matchPlayers, match, playerStatsDoc),
                'secondTeam.score' : secondTeamData.score,
                'secondTeam.shootOutScore' : secondTeamData.shootOutScore,
                'secondTeam.goalsConceded' : secondTeamData.goals_conceded,
                'secondTeam.players' : dbHelper.createDocumentFromMatchPlayers(secondTeamData.matchPlayers, match, playerStatsDoc)
            },
            $addToSet : {
                'firstTeam.bookings' : (firstTeamData.bookings.length === 0) ? null :                { $each: dbHelper.createDocumentFromPlayerEventsArray(firstTeamData.bookings) },
                'firstTeam.goals' : (firstTeamData.goals.length === 0) ? null :                      { $each: dbHelper.createDocumentFromPlayerEventsArray(firstTeamData.goals) },
                'firstTeam.missedPenalties' :(firstTeamData.missedPenalties.length === 0) ? null :   { $each: dbHelper.createDocumentFromPlayerEventsArray(firstTeamData.missedPenalties) },
                'firstTeam.substitutions' : (firstTeamData.substitutions.length === 0) ? null :      { $each: dbHelper.createDocumentFromPlayerEventsArray(firstTeamData.substitutions) },
                'secondTeam.bookings' : (secondTeamData.bookings.length === 0) ? null :              { $each: dbHelper.createDocumentFromPlayerEventsArray(secondTeamData.bookings) },
                'secondTeam.goals' : (secondTeamData.goals.length === 0) ? null :                    { $each: dbHelper.createDocumentFromPlayerEventsArray(secondTeamData.goals) },
                'secondTeam.missedPenalties' :(secondTeamData.missedPenalties.length === 0) ? null : { $each: dbHelper.createDocumentFromPlayerEventsArray(secondTeamData.missedPenalties) },
                'secondTeam.substitutions' : (secondTeamData.substitutions.length === 0) ? null :    { $each: dbHelper.createDocumentFromPlayerEventsArray(secondTeamData.substitutions) }
            }
        };

    if (match.venue) {
        upsert['$setOnInsert'].venue = {
            venueId : match.venue.uID,
            name : match.venue.name,
            country : match.venue.country
        }
    }

    var done = function (err, res) {
        if (err) {
            logger.error('Error while inserting match in DB: ' + err);
            return;
        }

        // TODO for more performance: when a match is updated, don't re-create all the players but just $set the modified fields of each in a new operation
        //if (res.upsertedCount === 0) {
        //    updatePlayersForMatch(match);
        //}

        var playerStatsDoc = this;

        if (insertionCallback && res.lastErrorObject.updatedExisting === false) {
            insertionCallback(res.value);
        }
        if (completionCallback && res.value) {
            completionCallback(res.value, playerStatsDoc);
        }

        if (constants.GLOBAL_DEBUG) logger.debug('Time to insert match: '+(Date.now() - debugTime));

    }.bind(playerStatsDoc);

    var collection = (isOldMatch ? database.Collections.OldMatches : database.Collections.Matches);

    // with the callback we also want to return the document after it has been upserted
    if (completionCallback || insertionCallback) {
        database.db.collection(collection).findOneAndUpdate(
            { matchId : match.uID },
            upsert,
            { w : 1, upsert : true, returnOriginal : false },
            function (err, res) {
                done(err, res);
            }
        )
    }
    else {
        database.db.collection(collection).updateOne(
            { matchId : match.uID },
            upsert,
            { w : 1, upsert : true},
            function (err, res) {
                done(err, res);
            }
        );
    }
}


function updateMatchWithDoc (matchDoc) {
    database.db.collection(database.Collections.Matches).updateOne(
        { matchId : matchDoc.matchId },
        matchDoc,
        { w : 1 },
        function (err) {
            if (err) {
                logger.error('Failed to update match ' + matchDoc.matchId + ": " + err);
            }
            else {
                console.log('updated')
            }

        }
    )
}


/**
 * Deletes the match(es) with the given id(s)
 * @param matchId can be either an array of ids or a single value
 */
function deleteMatch (matchId, callback, isOldMatch) {
    if (matchId instanceof Array) {
        var query = { matchId : { $in : matchId }};
    }
    else {
        query = { matchId : matchId };
    }

    var collection = (isOldMatch ? database.Collections.OldMatches : database.Collections.Matches);

    database.db.collection(collection).deleteMany(
        query,
        { w : 1 },
        function (err, res) {
            if (err) {
                logger.error('Failed to delete match(es):' + err);
            }
            else if (res.deletedCount > 0) {
                logger.verbose('Deleted matches: ' + matchId);
            }

            if (callback) {
                callback(err);
            }
        }
    )
}


/**
 * @param competitionsIds the ids of the competitions where to get the players from. Can be either an array or a single value. If null, all competitions are queried
 * @param untilDate get matches not older than untilDate
 * @param callback (err, average)
 */
function getPointsStatsForAllThePlayersFromMatches (competitionsIds, untilDate, callback) {
    if (constants.GLOBAL_DEBUG) logger.debug('Getting points stats of all the players from all the matches until ' + untilDate);

    var query = { startDate : { $gte : untilDate }, 'firstTeam.players' : { $ne : null }};

    if (competitionsIds) {
        if (competitionsIds instanceof Array) {
            query.competitionId = { $in : competitionsIds };
        }
        else {
            query.competitionId = competitionsIds;
        }
    }

    database.db.collection(database.Collections.Matches).find(
        query,
        { 'firstTeam.players.points' : 1, 'secondTeam.players.points' : 1, matchId : 1 },
        function (err, res) {
            if (err) {
                logger.error('Failed to get points average for all the matches: ' + err);
                callback(err, null);
                return;
            }

            res.toArray(function (err, matches) {

                var pointsCount = 0;
                var playersCount = 0;
                var pointsOfAllPlayers = [];

                for (var m = 0; m < matches.length; m++) {
                    var match = matches[m];

                    // loop through teams and players
                    for (var i = 0; i < 2; i++) {
                        var team = (i === 0) ? match.firstTeam : match.secondTeam;

                        for (var j = 0; j < team.players.length; j++) {
                            playersCount++;

                            var points = team.players[j].points;
                            pointsCount += points;

                            pointsOfAllPlayers.push(points);
                        }
                    }
                }

                pointsOfAllPlayers = helper.sortIntArray(pointsOfAllPlayers, 1);
                callback(null, pointsOfAllPlayers);
            })
        });
}


/**
 * @param playerId
 * @param limit the max number of matches to return; -1 if it should get all the matches
 * @param callback [err, res] - the resulting matches are sorted by start date
 */
function getLastMatchesPlayedByPlayer (playerId, limit, callback) {
    var limit = limit > 0 ? { $limit : limit } : { $limit : 100000 };

    database.db.collection(database.Collections.Matches).aggregate(
        [
            { $match :
            { $or : [
                { 'firstTeam.players.playerId' : playerId },
                { 'secondTeam.players.playerId' : playerId }
            ]}
            },
            { $project :
            { matchId : 1, 'firstTeam' : 1, 'secondTeam' : 1 }},
            limit,
            { $sort : { startDate : -1 }}
        ], function (err, res) {
            if (err) {
                logger.error('Failed to get last matches played by player ' + playerId + ': ' + err);
                callback(err);
            }
            else {
                callback(null, res);
            }
        });
}


function getAllMatches (callback) {
    if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    database.db.collection(database.Collections.Matches).find({},
        function (err, res) {
            if (err) {
                logger.error('Failed to get all matches: ' + err);
                return;
            }

            if (constants.GLOBAL_DEBUG) logger.debug('It took only ' + (Date.now() - debugTime) + ' to get ALL the matches from DB');

            res.toArray(callback);
        });
}


/**
 * Accepts either an array of ids or a single id. The matches corresponding to the given ids are returned
 * @param ids either an array of ids or a single id
 * @param requiredFields a doc containing the fields to be returned, in the format { <name_of_field : <value> }, where <value> equals 1 if
 * the field is required, or 0 otherwise. If requiredFields is null then all fields are returned
 * @param callback (err, res)
 */
function getMatchesByIds (ids, requiredFields, callback, getOldMatches) {
    if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    if (ids instanceof Array) {
        var query = { matchId : { $in : ids } };
        var resultsLimit = ids.length;
    }
    else {
        query = { matchId : ids };
        resultsLimit = 1;
    }

    var collection = (getOldMatches ? database.Collections.OldMatches : database.Collections.Matches);

    database.db.collection(collection).find(
        query,
        requiredFields ? requiredFields : {},
        { limit : resultsLimit },
        function (err, res) {
            if (err) {
                logger.error('Failed to get matches by id: ' + err);
                callback(err, res);
                return;
            }

            if (constants.GLOBAL_DEBUG) logger.silly('It took only ' + (Date.now() - debugTime) + ' to get the matches from DB');

            res.toArray(callback);
        });
}


function getMatchById (id, requiredFields, callback) {
    getMatchesByIds(id, requiredFields, callback);
}


/*
 ****************   PLAYERS ACTIONS    ****************
 */


/**
 * Stores the new actions for all the players in the match, calculating the difference with the latest actions stored
 * for each player.
 * If its the first time the actions are inserted for the match, then the salaries are also set to players from slate.
 *
 * The callback, if provided, is notified with the players that have been updated.
 *
 * @param match - the model of the match
 * @param playerActionsDoc
 * @param slate - a slate containing the match, used only to set salaries if necessary
 * @param callback [err, updatedPlayersActions]
 */
function insertOrUpdatePlayersActionsForMatch (match, playerActionsDoc, slate, callback) {
    var matchId = match.uID;

    logger.verbose('Inserting players actions for match ' + matchId);

    var collection = database.db.collection(database.Collections.PlayersActions);
    collection.find(
        { matchId : matchId }
    )
        .limit(1)
        .next(function (err, res) {
            if (res) {
                const updatedPlayersActions = extend({}, res);
                updatedPlayersActions.players = [];

                for (var i = 0; i < playerActionsDoc.players.length; i++) {
                    var matchPlayer = playerActionsDoc.players[i];

                    if (!matchPlayer.actions) continue;

                    // look for player
                    for (var j = 0; j < res.players.length; j++) {
                        if (res.players[j].playerId !== matchPlayer.playerId) continue;

                        var playerDb = res.players[j];

                        var lastActions = playerDb.lastActions;
                        var actions = matchPlayer.actions[0];

                        // no actions added yet
                        if (!lastActions) {
                            playerDb.lastActions = actions;
                            playerDb.actions = [ actions ];

                            updatedPlayersActions.players.push(playerDb);
                            continue;
                        }

                        // store the difference between the actions of the match and the last stored actions
                        var diff = PlayerAction.differenceBetweenActions(PlayerAction.parseActions(actions.actions), PlayerAction.parseActions(lastActions.actions));
                        diff = PlayerAction.convertActionsToString(diff);

                        if (!diff || diff.length === 0) { // no difference
                            continue;
                        }

                        playerDb.lastActions = JSON.parse(JSON.stringify(actions)); // copy actions obj
                        actions.actions = diff;
                        playerDb.actions.push(actions);

                        updatedPlayersActions.players.push(playerDb);

                        break;
                    }
                }

                collection.updateOne(
                    { matchId : matchId },
                    res,
                    { w : 1 },
                    function (err) {
                        if (err) {
                            logger.error('Error while updating PLAYER STATS: ' + err);
                        }

                        if (callback) {
                            callback(err, updatedPlayersActions);
                        }
                    });
            }
            else {
                // set salaries to players from slate
                for (i = 0; i < playerActionsDoc.players.length; i++) {
                    var player = playerActionsDoc.players[i];
                    var playerFound = false;

                    // look for player in slate
                    for (var j = 0; j < slate.teams.length && !playerFound; j++) {
                        var slateTeamId = slate.teams[j].teamId;
                        if (slateTeamId !== playerActionsDoc.firstTeamId && slateTeamId !== playerActionsDoc.secondTeamId) continue;

                        var team = slate.teams[j];

                        for (var k = 0; k < team.players.length; k++) {
                            if (team.players[k].playerId === player.playerId) {
                                player.salary = team.players[k].salary;
                                playerFound = true;
                                break;
                            }
                        }
                    }

                    if (!playerFound) {
                        logger.verbose('No salary found for player ' + player.playerId + ' in slate ' + slate._id);
                    }
                }

                collection.insertOne(
                    playerActionsDoc,
                    { w : 1 },
                    function (err) {
                        if (err) {
                            logger.error('Error while inserting PLAYER STATS: ' + err);
                        }

                        if (callback) {
                            callback(err, playerActionsDoc);
                        }
                    }
                );
            }
        });
}


function updatePlayerAction (playersActions) {
    database.db.collection(database.Collections.PlayersActions).updateOne(
        { matchId : playersActions.matchId },
        playersActions,
        { w : 1 },
        function (err) {
        if (err) {
            logger.error(err);
        }
    });
}


/**
 * Queries and returns player actions for the given match id(s)
 * @param matchesIds can be either one value or an array of values
 * @param callback - returns an object containing an 'actions' field, and also 'userActions' if filterOptions.userPlayers is provided
 * @param requiredFields [optional]
 * @param filterOptions { maximumTimestamp, limitResults, userPlayers, includedPlayers }[optional] - filters returned actions
 */
function getPlayersActions (matchesIds, callback, requiredFields, filterOptions) {

    if (matchesIds instanceof Array) {
        var query = { matchId : { $in : matchesIds }};
    }
    else if (matchesIds) {
        query = { matchId : matchesIds };
    }
    else {
        query = {};
    }

    database.db.collection(database.Collections.PlayersActions).find(
        query,
        requiredFields ? requiredFields : {},
        function (err, res) {
            if (err) {
                logger.error('Failed to get players actions for ' + matchesIds + ': ' + err);
                callback(err);
                return;
            }

            res.toArray(function (err, playersActions) {
                if (err) {
                    callback(err);
                }

                if (filterOptions) {
                    callback(null, dbHelper.filterPlayersActions(playersActions,
                                                                filterOptions.maximumTimestamp,
                                                                filterOptions.limitResults,
                                                                filterOptions.userPlayers,
                                                                filterOptions.includedPlayers));
                }
                else {
                    callback(null, playersActions);
                }
            });
        }
    )
}


/**
 * Deletes the player actions for the given match id(s)
 * @param matchesIds can be either one value or an array of values
 */
function deletePlayersActions (matchesIds) {
    if (matchesIds instanceof Array) {
        var query = { matchId : { $in : matchesIds }};
    }
    else {
        query = { matchId : matchesIds };
    }

    database.db.collection(database.Collections.PlayersActions).deleteMany(
        query,
        { w : 1 },
        function (err, res) {
            if (err) {
                logger.error('Failed to delete players actions: ' + err);
            }
            else if (res.deletedCount > 0) {
                logger.verbose('Deleted players actions for ' + matchesIds);
            }
        }
    );
}


/**
 * Returns a list of matches containing the player stats for the current season
 * @param playerId
 * @param teamId
 * @param competitionId
 * @param callback
 */
function getMatchesStatsHistoryForPlayer (playerId, teamId, competitionId, callback) {
    if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    database.db.collection(database.Collections.PlayersActions).find(
        {
            competitionId : competitionId,
            seasonId : helper.getCurrentSeasonId(),
            $or : [ { firstTeamId : teamId }, { secondTeamId : teamId } ],
            'players.playerId' : playerId
        },
        { 'players.$' : 1, matchStartDate : 1, matchId : 1, firstTeamName : 1, secondTeamName : 1 },
        { 'sort' : 'matchStartDate', 'limit' : 100 },
        function (err, res) {
            if (err) {
                logger.error('Failed to get players actions for player: ' + err);
                callback(err);
                return;
            }

            res.toArray(function (err, matches) {
                if (err) {
                    logger.error('Failed to get players actions for player: ' + err);
                    callback(err);
                    return;
                }

                for (var i = 0; i < matches.length; i++) {
                    var match = matches[i];
                    var player = match.players[0];
                    match.lastActions = player.lastActions;
                    match.actions = player.actions;
                    match.salary = player.salary;
                    delete match.players;
                }

                if (constants.GLOBAL_DEBUG) logger.silly('It took ' + (Date.now() - debugTime) + ' to get the player actions for player from DB');

                callback(null, matches);
            });
        }
    );
}


function getCurrentSeasonId (callback) {
    database.db.collection(database.Collections.Competitions).aggregate([
        { $group :
            {
                _id : null,
                seasonId : { $max : '$seasonId' }
            }
        }
    ], function (err, res) {
        if (err) {
            logger.error('Failed to get current season id: ' + err);
            callback(err);
            return;
        }

        callback(null, res[0].seasonId);
    });
}


/*
 ****************   COMPETITIONS    ****************
 */

function getCompetitionsByIds (competitionId, shouldGetTeams, shouldGetMatches, callback) {
    if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    if (!competitionId) {
        var query = {};
    }
    else if (competitionId instanceof Array) {
        query = { competitionId : { $in : competitionId } };
    }
    else {
        query = { competitionId : competitionId };
    }

    var requiredFields = extend({}, COMPETITION_BASIC_QUERY_FIELDS); // copy basic required fields
    if (shouldGetTeams) {
        requiredFields.teams = 1;
    }
    if (shouldGetMatches) {
        requiredFields.matches = 1;
    }

    database.db.collection(database.Collections.Competitions).find(
        query,
        requiredFields,
        function (err, doc) {
            if (err || doc === null) {
                logger.error('Failed to get competition ' + competitionId);
                callback(err || ('No competitionId found for the given id: ' +competitionId));
            }
            else {
                if (constants.GLOBAL_DEBUG) logger.silly('Got competition(s) in ' + (Date.now() - debugTime));

                doc.toArray(callback)
            }
        });
}


/**
 * Inserts or updates the matches of a competition. The update is done only if there is at least one match that has been changed
 * (which means that the date of his last update is different).
 * Also checks if the season id is different from the current season id; if so, the matches of the old season are re-organized in the db.
 *
 * @param competition - the competition MODEL containing the matches to be inserted
 */
function insertOrUpdateCompetitionMatches (competition) {
    logger.verbose('Inserting matches for competition ' + competition.uID);

    if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    var collection = database.db.collection(database.Collections.Competitions);

    // retrieve the competition and compare the matches, or insert a new one
    database.db.collection(database.Collections.Competitions).find(
        { competitionId : competition.uID },
        { matches : 1, seasonId : 1, competitionId : 1 }
    )
        .limit(1)
        .next(function (err, res) {
            if (res) {
                var somethingChanged = false;

                // competition matches are still not initialized in DB
                if (res.matches.length === 0) {
                    res.matches = dbHelper.createDocumentFromCompetitionMatches(competition.matches);

                    res.seasonId = res.matches[0].seasonId;
                    somethingChanged = true;
                }
                else {
                    // update every match if the date of the last update is different, then insert the changed document
                    for (var matchId in competition.matches) {
                        var competitionMatch = competition.matches[matchId];

                        // a new beautiful season is starting! re-organize old matches in the db and insert new ones
                        if (competitionMatch.seasonId !== res.seasonId) {
                            var matchesArr = helper.convertAssociativeArrayToNormalArray(competition.matches);

                            helper.setCurrentSeasonId(competitionMatch.seasonId);
                            dbOrganizer.reorganizeCompetitionMatches(res, matchesArr, competitionMatch.seasonId);
                            return;
                        }

                        var docPos = dbHelper.findMatchInDocument(matchId, res.matches);

                        if (docPos < 0) {
                            // not found - insert
                            res.matches.push(dbHelper.createDocumentFromCompetitionMatch(competitionMatch));
                            somethingChanged = true;
                        }
                        else {
                            // update existing match
                            var oldMatch = res.matches[docPos];

                            if (competitionMatch.timeStamp.getTime() !== oldMatch.lastUpdate.getTime()) {
                                res.matches[docPos] = dbHelper.createDocumentFromCompetitionMatch(competitionMatch);
                                somethingChanged = true;
                            }
                        }
                    }
                }

                if (!somethingChanged) return;

                collection.updateOne( { competitionId : competition.uID },
                    { $set : { matches : res.matches }},
                    function (err) {
                        if (err) {
                            logger.error('Failed to update competition matches: ' + err);
                            return;
                        }

                        if (constants.GLOBAL_DEBUG) logger.silly('Time to update competition matches: '+(Date.now() - debugTime));
                    }
                )
            }
            else {
                collection.insertOne(
                    {
                        competitionId : competition.uID,
                        seasonId : competition.matches[Object.keys(competition.matches)[0]].seasonId,
                        name : competition.name,
                        matches : dbHelper.createDocumentFromCompetitionMatches(competition.matches),
                        teams : []
                    },
                    { w : 1 },
                    function (err) {
                        if (err) {
                            logger.error('Failed to insert competition matches: ' + err);
                        }
                    }
                );

                if (constants.GLOBAL_DEBUG) logger.silly('Time to insert competition matches: '+(Date.now() - debugTime));
            }
        });
}


/**
 * @param competition - the MODEL of the competition
 */
function insertOrUpdateCompetitionTeams (competition) {
    const LOCK_KEY = 'insertOrUpdateCompetitionTeams';
    lock.acquire(LOCK_KEY, function () {

        logger.verbose('Inserting teams for competition ' + competition.uID);

        if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

        const gotCompetitionCallback = function (err, competitionDoc) {

            /*
            The primary task here is to update the teams of the competitions, adding and removing players or teams,
            or simply updating them.
            When a player is newly added to a team, or when the whole team is new, we check if there were some slates containing
            that player from which we can set his salary, as a starting point. When checking from old slate, priority is given
            to slates that have the player in the same competition and team as the current one. If that's the case, then also
            the last history points are kept, otherwise only the salary.
             */
            var playersChanged = {}; // players that have changed team
            var teamsForPlayersChanged = {}; // maps the player id to a team id

            if (competitionDoc && competitionDoc.teams && competitionDoc.teams.length !== 0) {
                var somethingHasChanged = false;
                var teamsDocs = [];
                var parsedTeams = competition.teams;

                // delete teams which no longer exist and map the other ones by their ids
                for (var i = 0; i < competitionDoc.teams.length; i++) {
                    var team = competitionDoc.teams[i];
                    var teamId = team.teamId;
                    var newTeam = parsedTeams[teamId];

                    // team is still there, update it
                    if (newTeam) {
                        teamsDocs[teamId] = team;

                        if (newTeam.teamManagerFirstName !== team.teamManagerFirstName || newTeam.teamManagerLastName !== team.teamManagerLastName) {
                            team.teamManagerFirstName = newTeam.teamManagerFirstName;
                            team.teamManagerLastName = newTeam.teamManagerLastName;
                            somethingHasChanged = true;
                        }
                    }
                    else {
                        somethingHasChanged = true;
                    }
                }

                // update the players for every team parsed
                for (teamId in parsedTeams) {
                    team = parsedTeams[teamId];
                    var dbTeam = teamsDocs[team.uID];

                    if (dbTeam) {
                        var newPlayers = team.players;
                        var playersDocs = dbTeam.players;
                        var oldPlayers = []; // old players mapped by their ids

                        // delete players which no longer exist and update the other ones
                        for (var j = 0; j < playersDocs.length; j++) {
                            var playerFound = false;
                            var player = playersDocs[j];

                            for (var k = 0; k < newPlayers.length; k++) {
                                if (player.playerId === newPlayers[k].uID) {
                                    playerFound = true;
                                    oldPlayers[player.playerId] = player;
                                    var newPlayer = newPlayers[k];

                                    // update player
                                    var newStats = newPlayer.stats.toString();
                                    if (player.position !== newPlayer.position || player.personalStats !== newStats) {
                                        player.position = newPlayer.position;
                                        player.personalStats = newStats;
                                    }

                                    break;
                                }
                            }

                            // remove player
                            if (!playerFound) {
                                playersDocs.splice(j, 1);
                                j--;

                                somethingHasChanged = true;
                            }
                        }

                        // finally insert new players
                        for (j = 0; j < newPlayers.length; j++) {
                            var oldPlayer = oldPlayers[newPlayers[j].uID];

                            if (!oldPlayer) {
                                newPlayer = dbHelper.createDocumentFromCompetitionPlayer(newPlayers[j]);
                                playersDocs.push(newPlayer);
                                playersChanged[newPlayer.playerId] = newPlayer;
                                teamsForPlayersChanged[newPlayer.playerId] = team.uID;

                                somethingHasChanged = true;
                            }
                        }
                    }
                    else {
                        // team doesnt exist, add it
                        var newTeamDoc = dbHelper.createDocumentFromCompetitionTeam(team);
                        teamsDocs[team.uID] = newTeamDoc;

                        for (var p = 0; p < newTeamDoc.players.length; p++) {
                            player = newTeamDoc.players[p];
                            playersChanged[player.playerId] = player;
                            teamsForPlayersChanged[player.playerId] = team.uID;
                        }

                        somethingHasChanged = true;
                    }
                }

                if (somethingHasChanged) {
                    // insert array in db
                    var finalTeams = [];

                    for (teamId in teamsDocs) {
                        finalTeams.push(teamsDocs[teamId]);
                    }

                    const salariesUpdated = function (err) {
                        if (err) {
                            logger.error('Failed to update competition teams: ' + err);
                            lock.release(LOCK_KEY);
                        }
                        else {
                            lock.run('insertOrUpdateCompetitionTeams', insertCompetitionFunction, finalTeams);
                        }
                    };

                    lock.run(LOCK_KEY, findSlatesContainingPlayersAndAssignSalaryAndStats, playersChanged, teamsForPlayersChanged, competition.uID, salariesUpdated);
                }
                else {
                    lock.release(LOCK_KEY);
                    logger.verbose('Not updating competition teams because nothing has changed.');
                }
            }
            else {
                var teamsDoc = dbHelper.createDocumentFromCompetitionTeams(competition.teams);
                for (var t = 0; t < teamsDoc.length; t++) {
                    team = teamsDoc[t];

                    for (p = 0; p < team.players.length; p++) {
                        player = team.players[p];
                        playersChanged[player.playerId] = player;
                        teamsForPlayersChanged[player.playerId] = team.teamId;
                    }
                }

                const salariesUpdated = function (err) {
                    if (err) {
                        logger.error('Failed to update competition teams: ' + err);
                        lock.release(LOCK_KEY);
                    }
                    else {
                        lock.run('insertOrUpdateCompetitionTeams', insertCompetitionFunction, teamsDoc);
                    }
                };

                lock.run(LOCK_KEY, findSlatesContainingPlayersAndAssignSalaryAndStats, playersChanged, teamsForPlayersChanged, competition.uID, salariesUpdated);
            }
        };

        const insertCompetitionFunction = function (teams) {
            database.db.collection(database.Collections.Competitions).updateOne(
                { competitionId : competition.uID },
                {
                    $setOnInsert : {
                        competitionId : competition.uID,
                        name : competition.name,
                        matches : []
                    },
                    $set : {
                        teams : teams
                    }
                },
                { w : 1, upsert : true },
                function (err) {
                    lock.release(LOCK_KEY);

                    if (err) {
                        logger.error('Failed to insert/update competition teams! Err: ' + err);
                    }
                    else if (constants.GLOBAL_DEBUG) logger.silly('Time to insert/update competition teams: ' + (Date.now() - debugTime));
                }
            );
        };

        // get the competition from db and compare the teams
        database.db.collection(database.Collections.Competitions).find(
            { competitionId : competition.uID },
            { teams : 1 }
        )
            .limit(1)
            .next(function (err, competitionDoc) {
                lock.run(LOCK_KEY, gotCompetitionCallback, err, competitionDoc)
            });
    });
}


function updateTeamPlayersWithTeamDoc (competitionId, teamDoc) {
    var teamId = teamDoc.teamId;

    logger.verbose('Updating team players for team ' + teamId);

    database.db.collection(database.Collections.Competitions).updateOne(
        { competitionId : competitionId, 'teams.teamId' : teamId },
        { $set :
        {
            'teams.$.players' : teamDoc.players
        }
        },
        { w : 1 },
        function (err) {
            if (err) {
                logger.error('Failed to update team players for team ' + teamId);
            }
        }
    )
}


function updateCompetitionTeamsWithDoc (competitionId, teamsDoc) {
    logger.verbose('Updating competition teams for competition ' + competitionId);

    database.db.collection(database.Collections.Competitions).updateOne(
        { competitionId : competitionId },
            { $set :
            {
                teams : teamsDoc
            }
        },
        { w : 1 },
        function (err) {
            if (err) {
                logger.error('Failed to update competition teams for competition ' +competitionId + ': '+err);
            }
        }
    )
}


function updateMatchInCompetition (competitionId, match) {
    logger.verbose('Updating match ' + match.uID + ' for competition ' + competitionId);

    var period = match.period;

    if (match.resultType) {
        switch (match.resultType) {
            case models.match.ResultType.VOID:
                period = models.MatchPeriod.VOID;
                break;

            case models.match.ResultType.POSTPONED:
                period = models.MatchPeriod.POSTPONED;
                break;

            case models.match.ResultType.ABANDONED:
                period = models.MatchPeriod.ABANDONED;
                break;
        }
    }

    database.db.collection(database.Collections.Competitions).updateOne(
        { competitionId : competitionId, 'matches.matchId' : match.uID },
        {
            $set : {
                'matches.$.lastUpdate' : match.timeStamp,
                'matches.$.period' : period,
                'matches.$.winnerId' : (match.winner) ? match.winner.uID : null,
                'matches.$.firstTeamScore' : match.teamsData[0].score,
                'matches.$.secondTeamScore' : match.teamsData[1].score
            }
        },
        { w : 1 },
        function (err) {
            if (err) {
                logger.error('Failed to update match ' + match.uID + ' for competition ' + competitionId + ': ' + err);
            }
        }
    )
}


function getAllPlayersFromTeamsInCompetition (competitionId, shouldCreateModels, callback) {
    getAllTeamsInCompetition(competitionId, true, shouldCreateModels, callback);
}


/**
 * @param competitionId if null, all competition are queried
 * @param shouldGetOnlyPlayers if true the result will be an array containing all the players from all the teams in the queried competition(s),
 * otherwise the teams are returned (containing also the players)
 * @param shouldCreateModels
 * @param callback (err, res) - res is an array containing the players from all the teams in the queried competition(s)
 */
function getAllTeamsInCompetition (competitionId, shouldGetOnlyPlayers, shouldCreateModels, callback) {
    logger.verbose('Getting teams in competition ' + competitionId);

    if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    var query = competitionId ? { competitionId : competitionId } : {};
    var requiredFields = shouldGetOnlyPlayers ? {'teams.players' : 1 } : { 'teams' : 1 };
    var limit = competitionId ? 1 : 100000;

    var res = [];

    database.db.collection(database.Collections.Competitions).find(
        query,
        requiredFields
        )
        .limit(limit)
        .forEach(
            function (doc) {
                if (shouldGetOnlyPlayers) {
                    if (shouldCreateModels) {
                        res = res.concat(dbHelper.createPlayersFromTeamsDoc(doc.teams));
                    }
                    else {
                        for (var i = 0; i < doc.teams.length; i++) {
                            res = res.concat(doc.teams[i].players);
                        }
                    }
                }
                else {
                    res = res.concat(shouldCreateModels ? dbHelper.createTeamsFromDoc(doc.teams) : doc.teams);
                }
            },
            function (err) {
                if (err) {
                    logger.error('Failed to get teams from competition ' + competitionId);
                    callback(err);
                    return;
                }

                if (constants.GLOBAL_DEBUG) logger.silly('Got teams from competition in ' + (Date.now() - debugTime));

                callback(null, res);
            });
}


/**
 * @param competitionId if null, all competition are queried
 * @param callback (err, res) - res is an array containing the players from all the teams in the queried competition(s)
 */
function getAllMatchesInCompetition (competitionId, callback) {
    logger.verbose('Getting matches from competition ' + competitionId);

    if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    var query = competitionId ? { competitionId : competitionId } : {};
    var limit = competitionId ? 1 : 100000;

    var matches = [];

    database.db.collection(database.Collections.Competitions).find(
        query,
        { matches : 1 }
        )
        .limit(limit)
        .forEach(
            function (doc) {
                matches = matches.concat(doc.matches);
            },
            function (err) {
                if (err) {
                    logger.error('Failed to get matches from competition ' + competitionId);
                    callback(err);
                    return;
                }

                if (constants.GLOBAL_DEBUG) logger.silly('Got matches from competition in ' + (Date.now() - debugTime));

                callback(null, matches);
            });
}


/**
 * @param competitionId the id of the competitions where to get the teams from. It's not optional!
 * @param ids either an array of ids or a single id
 * @param callback (err, res)
 * @param requiredFields the field is required, or 0 otherwise. If requiredFields is null then all fields are returned
 */
function getTeamsByIdsFromCompetition (competitionId, ids, callback, requiredFields) {
    // to get only the teams we are interested in, we perform an aggregation and filter the result based on the team id
    // if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    if (!competitionId) {
        throw new Error('No competition id provided!');
    }

    if (ids instanceof Array) {
        // create a condition to query the teams based on the ids
        var conditionsArr = [];
        for (var i = 0; i < ids.length; i++) {
            conditionsArr.push({ $eq : [ '$$team.teamId', ids[i] ] });
        }

        var query = { $or : conditionsArr };
    }
    else {
        query = { $eq : [ '$$team.teamId', ids ] };
    }

    var aggregationOperators = [
        {
            $match : {
                competitionId : competitionId
            }
        },
        {
            $project : {
                competitionId : 1,
                name : 1,
                teams : {
                    $filter : {
                        input : '$teams',
                        as : 'team',
                        cond : query
                    }
                }
            }
        },
        { $match : { 'teams.0' : { $exists : true } }}
    ];

    if (requiredFields) {
        aggregationOperators.push({ $project : requiredFields });
    }

    database.db.collection(database.Collections.Competitions).aggregate(
        aggregationOperators,
        function (err, res) {
            if (err) {
                logger.error('Failed to get teams by id: ' + err);
                callback(err, null);
                return;
            }

            // if (constants.GLOBAL_DEBUG) logger.silly('It took only ' + (Date.now() - debugTime) + ' to get the teams from DB');

            callback(null, res[0]);
        }
    );
}

/**
 * @param competitionsForTeams an array that contains, for every team, an object specifying the competition that it belongs to. In the form {competitionId, teamId}
 * @param callback (err, res)
 */
function getTeamsByIdsFromMultipleCompetitions (competitionsForTeams, callback, requiredFields) {
    // create a condition to query the teams based on the ids
    var conditionsArr = [];
    var competitionsIds = [];

    for (var i = 0; i < competitionsForTeams.length; i++) {
        var obj = competitionsForTeams[i];
        competitionsIds.push(obj.competitionId);

        conditionsArr.push({
            $and : [
                { $eq : [ '$competitionId', obj.competitionId ]},
                { $eq : [ '$$team.teamId', obj.teamId ] }
        ]})
    }

    var query = { $or : conditionsArr };

    var aggregationOperators = [
        {
            $match : {
                competitionId: { $in: competitionsIds }
            }
        },
        {
            $project : {
                competitionId : 1,
                name : 1,
                teams : {
                    $filter : {
                        input : '$teams',
                        as : 'team',
                        cond : query
                    }
                }
            }
        },
        { $match : { 'teams.0' : { $exists : true } }}
    ];

    if (requiredFields) {
        aggregationOperators.push({ $project : requiredFields });
    }

    database.db.collection(database.Collections.Competitions).aggregate(
        aggregationOperators,
        function (err, res) {
            if (err) {
                logger.error('Failed to get multiple teams by id: ' + err);
                callback(err, null);
                return;
            }

            // if (constants.GLOBAL_DEBUG) logger.silly('It took only ' + (Date.now() - debugTime) + ' to get the teams from DB');

            callback(null, res);
        }
    );
}


/**
 * Accepts either an array of ids or a single id. The matches corresponding to the given ids are returned
 * @param competitionsIds - the ids of the competitions where to get the matches from. Can be either an array or a single value. If null, all competitions are queried
 * @param matchesIds - either an array of ids or a single id
 * @param callback (err, res)
 * @param getOldMatches - if true, the matches are retrieved from old_competition
 * @param returnEmptyCompetition - if true, returns also competitions for which no matches have been found
 */
function getMatchesByIdsFromCompetitions (competitionsIds, matchesIds, callback, getOldMatches, returnEmptyCompetition) {
    // to get only the matches we are interested in, we perform an aggregation and filter the result based on the match id
    if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    if (matchesIds instanceof Array) {
        // create a condition to query the matches based on the ids
        var conditionsArr = [];
        for (var i = 0; i < matchesIds.length; i++) {
            conditionsArr.push({ $eq : [ '$$match.matchId', matchesIds[i] ] });
        }

        var query = { $or : conditionsArr };
    }
    else {
        query = { $eq : [ '$$match.matchId', matchesIds ] };
    }

    var aggregationOperators = [
        {
            $project : {
                competitionId : 1,
                name : 1,
                matches : {
                    $filter : {
                        input : '$matches',
                        as : 'match',
                        cond : query
                    }
                }
            }
        }
    ];

    if (!returnEmptyCompetition) {
        aggregationOperators.push({ $match : { 'matches.0' : { $exists : true } }});
    }

    if (competitionsIds) {
        if (competitionsIds instanceof Array) {
            var matchOperator =
            {
                $match : {
                    competitionId: { $in: competitionsIds}
                }
            };
        }
        else {
            matchOperator =
            {
                $match : {
                    competitionId : competitionsIds
                }
            };
        }

        aggregationOperators.unshift(matchOperator);
    }

    var collection = (getOldMatches ? database.Collections.OldCompetitionMatches : database.Collections.Competitions);

    database.db.collection(collection).aggregate(
        aggregationOperators,
        function (err, res) {
            if (err) {
                logger.error('Failed to get matches by ids: ' + err);
                callback(err, null);
                return;
            }

            if (constants.GLOBAL_DEBUG) logger.silly('It took only ' + (Date.now() - debugTime) + ' to get the matches from DB');

            callback(null, (!competitionsIds || competitionsIds instanceof Array) ? res : res[0]);
        }
    );
}


/**
 * Queries the matches from one or all competitions which startDate is greater than the current one.
 * @param competitionsIds if null, all the competitions are queried
 * @param callback (err, res)
 * @param exactDate [optional, Date] if provided, only the matches on that day are returned
 */
function getUpcomingCompetitionMatches (competitionsIds, callback, exactDate) {
    if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    var aggregationOperators = [];

    if (competitionsIds) {
        if (competitionsIds instanceof Array) {
            aggregationOperators.push({
                $match : { competitionId : { $in : competitionsIds }}
            });
        }
        else {
            aggregationOperators.push({
                $match : { competitionId : competitionsIds }
            });
        }
    }

    // if exact date is present, query only the matches with a start date between 00:00 and 23:59 for that day
    var cond = { $and : [ { $eq : ['$$match.period', models.MatchPeriod.PRE_MATCH] } ]};
    if (exactDate) {
        var startDate = moment(exactDate);
        var endDate = moment(exactDate);

        startDate.minutes(0);
        startDate.hours(0);
        endDate.minutes(59);
        endDate.hours(23);

        cond['$and'].push({ $gte : ['$$match.startDate', startDate.toDate() ] });
        cond['$and'].push({ $lte : ['$$match.startDate', endDate.toDate() ] });
    }
    else {
        cond['$and'].push({ $gt : [ '$$match.startDate', moment().toDate() ] });
    }

    aggregationOperators.push({
        $project : {
            competitionId : 1,
            name : 1,
            matches : {
                $filter : {
                    input : '$matches',
                    as : 'match',
                    cond : cond
                }
            }
        }
    });

    database.db.collection(database.Collections.Competitions).aggregate(
        aggregationOperators,
        function (err, res) {
            if (err) {
                logger.error('Failed to get upcoming matches: ' + err);
                callback(err);
                return;
            }

            if (constants.GLOBAL_DEBUG) logger.silly('It took only ' + (Date.now() - debugTime) + ' to get the upcoming matches from DB');

            callback(null, res);
        }
    );
}


function getAllCompetitions (callback, shouldGetTeams, shouldGetMatches) {
    logger.debug('Getting competitions');
    var exclusion = {};
    if (!shouldGetTeams) {
        exclusion.teams = 0;
    }
    if (!shouldGetMatches) {
        exclusion.matches = 0;
    }

    var resCallback = function (err, res) {
        if (err) {
            logger.error('Failed to get all competitions: ' + err);
            return;
        }

        res.toArray(callback);
    };

    if (!shouldGetMatches || !shouldGetTeams) {
        database.db.collection(database.Collections.Competitions).find({}, exclusion, resCallback);
    }
    else {
        database.db.collection(database.Collections.Competitions).find({}, resCallback);
    }
}


function getPlayersFromTeamInCompetition (competitionId, teamId, shouldCreateModels, callback) {
    if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    database.db.collection(database.Collections.Competitions).find(
        { competitionId : competitionId, 'teams.teamId' : teamId },
        { 'teams.$' : 1 } // get only the team we are searching for //TODO Find a way to return only the players of the team we are searching for
        )
        .limit(1)
        .next(function (err, doc) {
            if (err || doc === null) {
                logger.error('Failed to get team ' + teamId + ' from competition ' + competitionId);
                callback(err || ('No team found for the given id: ' +teamId + ' in competition ' +competitionId));
            }
            else {
                if (constants.GLOBAL_DEBUG) logger.silly('Got team from competition in ' + (Date.now() - debugTime));

                var team = doc.teams[0];

                callback(null, shouldCreateModels ? null : team); //TODO implement function to create models from doc
            }
        });
}


/*
 ****************   USERS    ****************
 */
function insertOrUpdateUser (user, callback) {
    logger.verbose('Inserting user ' + user.username);

    database.db.collection(database.Collections.Users).updateOne(
        { username : user.username },
        {
            $setOnInsert : {
                username : user.username.toString(),
                firstName : user.firstName,
                lastName : user.lastName,
                birthDate : user.birthDate,
                currency : user.currency,
                country : user.country,
                city : user.city,
                zipCode : user.zipCode,
                street : user.street,
                streetNum : user.streetNum,
                registrationDate : user.registrationDate
            },
            $set : {
                password : user.password,
                email : user.email,
                registrationToken : user.registrationToken,
                registrationTokenExpiration : user.registrationTokenExpiration,
                isEmailValidated : user.isEmailValidated,
                balance : user.balance,
                freeMoneyBalance : user.freeMoneyBalance,
                playMode : user.playMode,
                tcVersion : user.tcVersion,
                gameRulesVersion : user.gameRulesVersion
            }
        },
        { upsert : true, w : 1 },
        function (err, res) {
            if (err) {
                logger.error('Failed to insert user in database: '+err);
            }

            if (callback) {
                callback(err, res);
            }
        }
    )
}


/**
 * @param username
 * @param amount - the amount of which the balance should be increased (or decreased if the amount is negative)
 * @param batch the database batch where this operation has to be executed
 * @param playMode - the play mode according to which real or free balance are updated. See /enums/PlayMode
 */
function batchUpdateUserBalance (username, amount, batch, playMode) {
    var incObj = {};
    incObj['$inc'] = playMode === PlayMode.FREE ? { freeMoneyBalance : amount } : { balance : amount };

    batch.find({ username : new RegExp('^' + username + '$', 'i')}, { $limit : 1 })
        .updateOne(incObj);
}


/**
 * @param username - username of user
 * @param amount - the amount to increment the balance with
 * @param reason - BalanceUpdate enum
 * @param callback(err, res)[optional] - returns the updated balance
 * @param playMode[optional] - the play mode according to which real or free balance are updated. See /enums/PlayMode. Defaults to Real
 */
function updateUserBalance (username, amount, reason, callback, playMode) {
    var freePlay = playMode === PlayMode.FREE;
    var updateObj = {};
    updateObj['$inc'] = freePlay ? { freeMoneyBalance : amount } : { balance : amount };

    if (!freePlay && (reason === models.BalanceUpdate.TOURNAMENT_REGISTRATION || reason === models.BalanceUpdate.TOURNAMENT_REGISTRATION_CANCELLED)) {
        updateObj['$inc'].monthlySpending = -amount;
    }

    database.db.collection(database.Collections.Users).findOneAndUpdate(
        { username : new RegExp('^' + username + '$', 'i')},
        updateObj,
        { w : 1, returnOriginal : false },
        function (err, res) {
            if (err) {
                emailer.sendErrorEmail('Failed to update balance for user ' + username, err);
                logger.emerg('Failed to update balance for user ' + username + ': ' + err);
            }
            else {
                logger.verbose('Balance for user updated succesfully: ' + username);
            }

            if (callback) {
                callback(err, res.value);
            }
        }
    )
}


function hasUser (username, callback) {
    database.db.collection(database.Collections.Users).count(
        { username : new RegExp('^' + username + '$', 'i') },
        { limit : 1 },
        function (err, res) {
            if (err) {
                logger.error('Failed to search for user: ' + err);
                callback(err);
            }
            else {
                callback(null, res !== 0);
            }
        }
    )
}


// find and retrieve a user by its username or email
function getUser (usernameOrEmail, callback) {
    var rgx = new RegExp('^' + usernameOrEmail + '$', 'i');
    var query = (usernameOrEmail.indexOf('@') > 0) ? { email : rgx } : { username : rgx };
    database.db.collection(database.Collections.Users).find(
        query
        )
        .limit(1)
        .next (function(err, doc) {
            if (err) {
                logger.error('Failed to get user: '+usernameOrEmail);
                callback(err);
            }
            else {
                callback(null, doc ? dbHelper.createUserFromDoc(doc) : null);
            }
        });
}


/**
 * Accepts either an array of usernames or a single username. The users corresponding to the given usernames are returned
 * @param usernames - either an array of usernames or a single username
 * @param requiredFields a doc containing the fields to be returned, in the format { <name_of_field : <value> }, where <value> equals 1 if
 * the field is required, or 0 otherwise. If requiredFields is null then all fields are returned
 * @param callback (err, res)
 */
function getUsers (usernames, requiredFields, callback) {
    if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    if (usernames instanceof Array) {
        for (var i = 0; i < usernames.length; i++) {
            usernames[i] = new RegExp('^' + usernames[i] + '$', 'i');
        }
        var query = { username : { $in : usernames } };
        var resultsLimit = usernames.length;
    }
    else if (usernames) {
        query = { username : new RegExp('^' + usernames + '$', 'i')};
        resultsLimit = 1;
    }
    else {
        query = {};
    }

    database.db.collection(database.Collections.Users).find(
        query,
        requiredFields ? requiredFields : {},
        { limit : resultsLimit },
        function (err, res) {
            if (err) {
                logger.error('Failed to get users by usernames: ' + err);
                callback(err, res);
                return;
            }

            if (constants.GLOBAL_DEBUG) logger.silly('It took only ' + (Date.now() - debugTime) + ' to get the users from DB');

            res.toArray(callback);
        });
}


/**
 * Checks if the user is valid for a new registration.
 * @param user
 * @param callback (err, res) - res is null if the user is valid, otherwise the first colliding user is returned
 */
function isValidNewUser (user, callback) {
    database.db.collection(database.Collections.Users).find(
        {
            $or : [
                { username : new RegExp('^' + user.username + '$', 'i') },
                { email : user.email }
            ]
        }
        )
        .limit(1)
        .next (function(err, doc) {
            if (err) {
                logger.error('Failed to check user validity: '+ err);
                callback(err);
            }
            else {
                callback(null, doc ? dbHelper.createUserFromDoc(doc) : null);
            }
        });
}


function findUserWithRegistrationToken (token, callback) {
    findUserWithToken('registrationToken', token, callback);
}


function findUserWithPasswordResetToken (token, callback) {
    findUserWithToken('passwordResetToken', token, callback);
}


function findUserWithToken (field, token, callback) {
    var query = {};
    query[field] = token.toLowerCase();

    database.db.collection(database.Collections.Users)
        .find(query)
        .limit(1)
        .next(function (err, doc) {
            if (err) {
                logger.error('Failed to get user with token: ' + token);
                callback(err);
            }
            else {
                if (doc === null) {
                    callback(null, null);
                }
                else {
                    callback(null, dbHelper.createUserFromDoc(doc));
                }
            }
        });
}


/**
 * Update one or more user fields.
 * @param username
 * @param fields can be either an Array or a single value (use USER_UPDATE_FIELDS constants to refer to fields)
 * @param values can be either an Array or a single value
 * @param callback - optional
 */
function updateUserFields (username, fields, values, callback) {
    var fieldsObj = {};
    var setObj = { $set : fieldsObj };
    if (fields instanceof Array) {
        for (var i = 0; i < fields.length; i++) {
            fieldsObj[fields[i]] = values[i];
        }
    }
    else {
        fieldsObj[fields] = values;
    }

    database.db.collection(database.Collections.Users).updateOne(
        { username : username },
        setObj,
        { w : 1 },
        function (err) {
            if (err) {
                logger.error('Failed to update user fields ' + fields + ': ' + err);
            }

            if (callback) {
                callback(err);
            }
        }
    )
}


function setUserPasswordResetData (username, token, expirationDate) {
    database.db.collection(database.Collections.Users).updateOne(
        { username : username },
        {
            $set : {
                passwordResetToken : token,
                passwordResetExpirationDate : expirationDate
            }
        },
        function (err) {
            if (err) {
                logger.error('Failed to set user password reset data: ' + err);
            }
        }
    )
}


function resetUsersMonthlySpending () {
    database.db.collection(database.Collections.Users).updateMany(
        {},
        {
            $set : {
                monthlySpending : 0
            }
        },
        function (err) {
            if (err) {
                logger.emerg('Failed to reset users monthly spending: ' + err);
            }
        }
    )
}


/*
 ****************   TOURNAMENTS    ****************
 *
 * Tournaments collection also contains tournament entries. Each tournament entry stores basic user info (id, name) and
 * a list with the ids of the players picked by the user to entry the tournament.
 *
 */

/**
 * @param tournament the tournament model to be inserted
 * @param slate the slate model to be inserted
 * @param callback (err, res) - res is the ObjectId of the inserted document
 */
function insertTournament (tournament, slate, callback) {
    logger.verbose('Inserting tournament: ' + tournament.name);

    // create match obj for every match containing matchId, playersIds and minutes played for match
    // create players string containing all the players in the slate
    var matches = [];
    var allPlayers = '';
    for (var i = 0; i < slate.matches.length; i++) {
        var match = slate.matches[i];
        var playersIds = '';
        var matchData = {
            matchId : match.uID,
            minutesPlayed : 0,
            competitionId : match.competition.uID,
            startDate : match.date
        };

        // loop through players
        for (var j = 0; j < 2; j++) {
            var team = match.teamsData[j].team;
            var players = team.players;

            if (j === 0) {
                matchData['firstTeamName'] = team.name;
                matchData['firstTeamId'] = team.uID;
                matchData['firstTeamOptasportsId'] = team.optasportsId;
            }
            else {
                matchData['secondTeamName'] = team.name;
                matchData['secondTeamId'] = team.uID;
                matchData['secondTeamOptasportsId'] = team.optasportsId;
            }

            for (var k = 0; k < players.length; k++) {
                var player = players[k];
                playersIds += player.uID + ',';
                allPlayers += player.uID + '%' + player.getName() + '%' + PlayerPosition.getShortPosition(player.position);

                if (player.optasportsId) {
                    allPlayers += '%' + player.optasportsId;
                }

                allPlayers += ',';
            }
        }

        matchData['playersIds'] = playersIds;

        matches.push(matchData);
    }

    database.db.collection(database.Collections.Tournaments).insertOne(
        {
            name : tournament.name,
            summary : tournament.summary,
            type : tournament.type,
            subtype : tournament.subtype,
            flags : tournament.flags,
            entryFee : tournament.entryFee,
            maxEntries : tournament.maxEntries,
            guaranteedPrize : tournament.guaranteedPrize,
            startDate : tournament.startDate,
            slateId : tournament.slateId,
            matches : matches,
            lineupSize : tournament.lineupSize,
            multiEntries : tournament.multiEntries,
            isActive : false,
            isOpen : tournament.isOpen,
            payouts : models.tournament.payoutsToString(tournament.payouts),
            payoutsEntriesNumber : tournament.payoutsEntriesNumber,
            totalPrize : tournament.totalPrize,
            rake : tournament.rake || 0,
            isMock : tournament.isMock || false,
            playMode : tournament.playMode || PlayMode.REAL,
            players : allPlayers,
            groupId : tournament.groupId,
            programmedId : tournament.programmedId,
            progress : tournament.progress,
            salaryCap : tournament.salaryCap
        },
        { w : 1 },
        function (err, res) {
            if (err) {
                logger.error('Failed to insert tournament: ' +err);
            }

            if (callback) {
                callback(err, res);
            }
        }
    )
}


// function updateTournament (tournament) {
//     var tournamentId;
//     if (tournament.tournamentId) {
//         tournamentId = tournament.tournamentId;
//     }
//     else if (tournament._id) {
//         tournamentId = tournament._id.toString();
//     }
//
//     logger.verbose('Inserting/updating tournament: ' + (tournamentId || tournament.name));
//
//     database.db.collection(database.Collections.Tournaments).updateOne(
//         { _id : ObjectId(tournamentId) },
//         {
//             $set : {
//                 isActive : tournament.isActive,
//                 isOpen : tournament.isOpen,
//                 payouts : models.tournament.payoutsToString(tournament.payouts),
//                 payoutsEntriesNumber : tournament.payoutsEntriesNumber,
//                 totalPrize : tournament.totalPrize,
//                 rake : tournament.rake || 0
//             }
//         },
//         { w : 1 },
//         function (err, res) {
//             if (err) {
//                 logger.error('Failed to update tournament: ' +err);
//             }
//         }
//     )
// }


/**
 * @param tournamentId
 * @param shouldGetEntries if true, also the array containing the entries is returned with the tournament object (with fields username and playersIds)
 * @param shouldCountEntries if true, a field entriesCount containing the count of the entries registered to the tournament obj is returned
 * @param shouldGetSlate if true, also the slate related to the tournament is retrieved and returned
 * @param shouldGetPlayers if true, the players field of the tournament is returned, containing a list of all the players in the slate with their ids and names
 * @param shouldGetMatches if true, the matches field of the tournament is returned
 * @param shouldCreateModels if true, the tournament and slate models are created. Otherwise, a document is returned
 * @param callback (err, {tournamentModel|tournamentDoc}, [optional] tournamentDoc)
 */
function getTournamentById (tournamentId, callback, shouldGetEntries, shouldCountEntries, shouldGetSlate, shouldGetPlayers, shouldGetMatches, shouldCreateModels) {
    if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    var onResult = function (err, tournamentDoc) {
        if (tournamentDoc instanceof Array) {
            tournamentDoc = tournamentDoc[0]
        }

        if (err) {
            logger.error('Failed to get tournament with id ' + tournamentId + '. ' + err);
            callback(err);
            return;
        }
        else if (!tournamentDoc) {
            callback();
            return;
        }

        if (shouldGetSlate) {

            getSlateById(tournamentDoc.slateId, function (err, slateDoc) {
                if (!err) {
                    if (constants.GLOBAL_DEBUG) logger.silly('Got tournament (and slate) with id ' + tournamentId + ' in ' + (Date.now() - debugTime));

                    if (shouldCreateModels) {
                        var tournamentModel = dbHelper.createTournamentFromDoc(tournamentDoc, slateDoc);
                        callback(null, tournamentModel, tournamentDoc);
                    }
                    else {
                        tournamentDoc.slate = slateDoc;
                        callback(null, tournamentDoc);
                    }
                }
                else {
                    callback(err);
                }
            })
        }
        else {
            if (constants.GLOBAL_DEBUG) logger.silly('Got tournament with id ' + tournamentId + ' in ' + (Date.now() - debugTime));

            if (shouldCreateModels) {
                callback(null, dbHelper.createTournamentFromDoc(tournamentDoc), tournamentDoc);
            }
            else {
                callback(null, tournamentDoc);
            }
        }
    };

    var requiredFields = extend({}, TOURNAMENTS_BASIC_QUERY_FIELDS); // copy basic required fields
    requiredFields['payouts'] = 1;
    requiredFields['payoutsEntriesNumber'] = 1;
    requiredFields['isCancelled'] = 1;
    requiredFields['lineupSize'] = 1;
    requiredFields['salaryCap'] = 1;
    requiredFields['finishedAt'] = 1;
    if (shouldGetPlayers) {
        requiredFields['players'] = 1;
    }
    if (shouldGetMatches) {
        requiredFields['matches'] = 1;
    }

    // use aggregation if we also need the entries, or a normal query otherwise
    if (shouldGetEntries || shouldCountEntries) {

        if (shouldGetEntries) {
            requiredFields['entries'] = ENTRIES_BASIC_QUERY_FIELDS;
        }
        if (shouldCountEntries) {
            requiredFields['entriesCount'] = { $size : { $ifNull :  [ '$entries', [] ] } };
        }

        database.db.collection(database.Collections.Tournaments).aggregate(
            [
                {
                    $match :
                    {
                        _id : ObjectId(tournamentId)
                    }
                },
                {
                    $project : requiredFields
                }
            ],
            function (err, res) {
                onResult(err, res);
            }
        );
    }
    else {
        database.db.collection(database.Collections.Tournaments).find(
            { _id : ObjectId(tournamentId) },
            requiredFields)
            .limit(1)
            .next(function (err, res) {
                onResult(err, res);
            });
    }
}


// painless way to get tournament
function getTournamentByIdSimple (tournamentId, callback, requiredFields) {
    // concat the players ids from the matches - fast, easy, painless
    database.db.collection(database.Collections.Tournaments).find(
        { _id : ObjectId(tournamentId) },
        requiredFields || {})
        .limit(1)
        .next(function (err, tournament) {
            if (err) {
                callback(err);
                return;
            }

            if (!tournament) {
                callback();
                return;
            }

            callback(null, tournament);
        });
}


function getAllTournamentsHistory (callback, requiredFields) {
    database.db.collection(database.Collections.Tournaments).find(
        { finishedAt : { $exists : true }},
        requiredFields ? requiredFields : {},
        function (err, res) {
            if (err) {
                logger.error('Failed to get all tournaments history: ' + err);
            }
            res.toArray(callback);
        }
    )
}


//TODO write some doc cause its a fricking 300 lines method
function getTournamentOverview (tournamentId, callback, username) {
    const tourRequiredFields = extend({}, TOURNAMENTS_BASIC_QUERY_FIELDS); // copy basic required fields
    tourRequiredFields['payouts'] = 1;
    tourRequiredFields['payoutsEntriesNumber'] = 1;
    tourRequiredFields['isCancelled'] = 1;
    tourRequiredFields['lineupSize'] = 1;
    tourRequiredFields['matches.matchId'] = 1;
    tourRequiredFields['finishedAt'] = 1;
    tourRequiredFields['progress'] = 1;
    tourRequiredFields['entries'] = ENTRIES_BASIC_QUERY_FIELDS;

    const slateRequiredFields = {
        competitions : 1,
        'teams.teamId' : 1,
        'teams.name' : 1,
        'teams.optasportsId' : 1,
        'teams.abbreviation' : 1,
        'teams.players.playerId' : 1,
        'teams.players.firstName' : 1,
        'teams.players.lastName' : 1,
        'teams.players.knownName' : 1,
        'teams.players.position' : 1,
        'teams.players.optasportsId' : 1,
        'teams.players.salary' : 1,
        'teams.players.imageSizes' : 1,
        'teams.players.jerseyNum' : 1
    };

    const matchRequiredFields = {
        competitionId : 1, firstHalfTime : 1, secondHalfTime : 1, period : 1,
        'firstTeam.score' : 1, 'firstTeam.teamId' : 1, 'firstTeam.teamName' : 1, 'firstTeam.side' : 1,
        'secondTeam.score' : 1, 'secondTeam.teamId' : 1, 'secondTeam.teamName' : 1, 'secondTeam.side' : 1,
        'firstTeam.players.playerId' : 1, 'firstTeam.players.position' : 1, 'firstTeam.players.points' : 1, 'firstTeam.players.actions' : 1, 'firstTeam.players.isPlaying' : 1,
        'secondTeam.players.playerId' : 1, 'secondTeam.players.position' : 1, 'secondTeam.players.points' : 1, 'secondTeam.players.actions' : 1, 'secondTeam.players.isPlaying' : 1,
        lastUpdate : 1, matchId : 1, matchType : 1, resultType : 1, startDate : 1, totalTime : 1, winnerId : 1
    };


    var tournamentCallback = function (tournament) {

        // proceed to get the slate
        getSlateById(tournament.slateId, function (err, slateDoc) {
            if (err) {
                callback(err);
                return;
            }

            tournament.slate = slateDoc;

            // finally, retrieve the matches.
            var matchesIds = [];
            for (var i = 0; i < tournament.matches.length; i++) {
                matchesIds.push(tournament.matches[i].matchId);
            }

            const allTeams = [];
            const allPlayersIds = [];
            const slatePlayersById = {};

            for (i = 0; i < tournament.slate.teams.length; i++){
                var team = tournament.slate.teams[i];
                allTeams[team.teamId] = team;

                for (var p = 0; p < team.players.length; p++) {
                    var player = team.players[p];
                    allPlayersIds.push(player.playerId);
                    slatePlayersById[player.playerId] = player;
                    player.isPlaying = false;
                }
            }

            /*
             The way we retrieve the matches depends on the the state of the matches:
             - if the match is in pre-match state or is live or finished, then we get it from the matches collection
             - if the lineup of the match is not known yet, then we get it from the competitions matches
             */
            var matchesRetrievedCallback = function (err, matches, competitionsIds) {
                if (err) {
                    callback(err);
                    return;
                }

                var matchesToGetPlayersActions = [];
                for (var i = 0; i < matches.length; i++) {
                    if (matches[i].period !== models.MatchPeriod.PRE_MATCH) {
                        matchesToGetPlayersActions.push(matches[i]);
                    }
                }

                const matchesResultCallback = function (err, matches, playersActions, userActions) {

                    // since we may have retrieved the matches from different collections, make the fields look the same
                    for (var i = 0; i < matches.length; i++) {
                        var match = matches[i];
                        var isMatchFromCompetitionsCollection = match.firstTeamName !== undefined;

                        if (isMatchFromCompetitionsCollection) {
                            //match.venue = { name : match.venueName, venueId : match.venueId };
                            delete match.venueName;
                            delete match.venueId;

                            delete match.matchDay;
                            delete match.seasonId;
                            delete match.seasonName;

                            var firstTeam = allTeams[match.firstTeamId];
                            match.firstTeam = {
                                teamName : firstTeam.name,
                                teamId : firstTeam.teamId,
                                abbreviation : firstTeam.abbreviation,
                                side : match.firstTeamSide,
                                score : 0,
                                players : firstTeam.players,
                                optasportsId : firstTeam.optasportsId
                            };
                            delete match.firstTeamName;
                            delete match.firstTeamId;
                            delete match.firstTeamSide;
                            delete match.firstTeamScore;

                            var secondTeam = allTeams[match.secondTeamId];
                            match.secondTeam = {
                                teamName : secondTeam.name,
                                teamId : secondTeam.teamId,
                                abbreviation : secondTeam.abbreviation,
                                side : match.secondTeamSide,
                                score : 0,
                                players : secondTeam.players,
                                optasportsId : secondTeam.optasportsId
                            };
                            delete match.secondTeamName;
                            delete match.secondTeamId;
                            delete match.secondTeamSide;
                            delete match.secondTeamScore;
                        }
                        else {
                            // matches retrieved from "matches" collection dont contain all the players in the slate, but only
                            // the final ones. So, add the missing ones and fix the other fields
                            for (var t = 0; t < 2; t++) {
                                var matchTeam = (t === 0 ? match.firstTeam : match.secondTeam);
                                team = allTeams[matchTeam.teamId];
                                matchTeam.optasportsId = team.optasportsId;
                                matchTeam.teamName = team.name;
                                matchTeam.abbreviation = team.abbreviation;

                                // create array with players from match
                                var matchPlayersById = {};

                                if (matchTeam.players) {
                                    for (var p = 0; p < matchTeam.players.length; p++) {
                                        var player = matchTeam.players[p];

                                        if (!slatePlayersById[player.playerId]) {
                                            // this may happen when a player has been transferred to the playing team AFTER the slate has been created
                                            matchTeam.players.splice(p, 1);
                                            p--;
                                            continue;
                                        }

                                        matchPlayersById[player.playerId] = player;
                                    }

                                    for (p = 0; p < team.players.length; p++) {
                                        var slatePlayer = team.players[p];
                                        var matchPlayer = matchPlayersById[slatePlayer.playerId];

                                        if (matchPlayer) {
                                            // add missing fields
                                            if (matchPlayer.position === PlayerPosition.PlayerPosition.SUBSTITUTE) {
                                                matchPlayer.isSubstitute = true;
                                            }
                                            matchPlayer.position = slatePlayer.position;
                                            matchPlayer.optasportsId = slatePlayer.optasportsId;
                                            matchPlayer.firstName = slatePlayer.firstName;
                                            matchPlayer.lastName = slatePlayer.lastName;
                                            matchPlayer.salary = slatePlayer.salary;
                                            matchPlayer.jerseyNum = slatePlayer.jerseyNum;

                                            if (slatePlayer.imageSizes) {
                                                matchPlayer.imageSizes = slatePlayer.imageSizes;
                                            }
                                            if (slatePlayer.knownName) {
                                                matchPlayer.knownName = slatePlayer.knownName;
                                            }
                                        }
                                        else {
                                            // use slate player
                                            slatePlayer.isOutsideFormation = true;
                                            matchTeam.players.push(slatePlayer);
                                        }
                                    }
                                }
                                else {
                                    // a match team can also not contain any players, in case the lineup is not defined yet
                                    matchTeam.players = team.players;
                                }
                            }
                        }
                    }

                    delete tournament.slate;
                    tournament.matches = matches;
                    tournament.competitionsIds = competitionsIds;

                    if (playersActions) {
                        tournament.playersActions = playersActions;

                        if (userActions) {
                            tournament.userActions = userActions;
                        }
                    }

                    callback(null, tournament);
                };



                if (matchesToGetPlayersActions.length > 0) {

                    const requiredFields = {
                        matchId : 1,
                        players : 1
                    };

                    const filterOptions = {
                        limitResults : true,
                        includedPlayers : allPlayersIds
                    };

                    if (username) {
                        var userPlayers = '';

                        for (var e = 0; e < tournament.entries.length; e++) {
                            if (tournament.entries[e].username === username) {
                                userPlayers += tournament.entries[e].playersIds + ',';
                            }
                        }

                        filterOptions.userPlayers = userPlayers.split(',');
                    }

                    getPlayersActions(matchesIds, function (err, actionsResult) {
                        var resultCallback = this.resultCallback;
                        var matches = this.matches;

                        if (err) {
                            resultCallback(err);
                            return;
                        }

                        resultCallback(null, matches, actionsResult.actions, actionsResult.userActions);

                    }.bind({ resultCallback : matchesResultCallback, matches : matches }),
                        requiredFields, filterOptions);
                }
                else {
                    matchesResultCallback(null, matches);
                }
            };

            getMatchesByIds(matchesIds,
                matchRequiredFields,
                function (err, matches) {
                    var matchesRetrievedCallback = this;

                    if (err) {
                        matchesRetrievedCallback(err);
                        return;
                    }

                    if (matches.length === matchesIds.length) {
                        matchesRetrievedCallback(null, matches);
                    }
                    // not all matches have been found, get the remaining ones for competitions
                    else {
                        var remainingMatchesIds = [];

                        if (matches.length > 0) {
                            for (var i = 0; i < matchesIds.length; i++) {
                                var matchId = matchesIds[i];
                                var found = false;

                                for (var j = 0; j < matches.length; j++) {
                                    if (matches[j].matchId === matchId) {
                                        found = true;
                                        break;
                                    }
                                }

                                if (!found) {
                                    remainingMatchesIds.push(matchId);
                                }
                            }
                        }
                        else {
                            remainingMatchesIds = matchesIds;
                        }

                        var competitionsIds = [];
                        for (i = 0; i < tournament.slate.competitions.length; i++) {
                            competitionsIds.push(tournament.slate.competitions[i].competitionId);
                        }


                        getMatchesByIdsFromCompetitions(competitionsIds, remainingMatchesIds, function (err, competitions) {
                            var matchesRetrievedCallback = this.callback;
                            var matches = this.matches;

                            if (err) {
                                matchesRetrievedCallback(err);
                                return;
                            }

                            for (var i = 0; i < competitions.length; i++) {
                                var competition = competitions[i];

                                for (var m = 0; m < competition.matches.length; m++) {
                                    var competitionMatch = competition.matches[m];
                                    competitionMatch.competitionId = competition.competitionId;
                                    matches.push(competitionMatch);
                                }
                            }

                            matchesRetrievedCallback(null, matches, this.competitionsIds);

                        }.bind({ callback : matchesRetrievedCallback, matches : matches, competitionsIds : competitionsIds }))
                    }

                }.bind(matchesRetrievedCallback));

        }, false, slateRequiredFields);
    };

    database.db.collection(database.Collections.Tournaments).aggregate(
        [
            {
                $match :
                {
                    _id : ObjectId(tournamentId)
                }
            },
            {
                $project : tourRequiredFields
            }
        ],
        function (err, tournament) {
            if (err) {
                logger.error('Failed to get tournament with id ' + tournamentId + '. ' + err);
                callback(err);
                return;
            }

            if (!tournament) {
                callback();
                return;
            }

            tournament = tournament[0];

            // if tournament has yet to start, remove lineups from entries
            if (tournament.isOpen && tournament.entries) {
                for (var i = 0; i < tournament.entries.length; i++) {
                    if (tournament.entries[i].username !== username) {
                        delete tournament.entries[i].playersIds;
                    }
                }
            }

            tournamentCallback(tournament);
        }
    );
}


/**
 * Returns the tournaments that are not cancelled, filtered with the optional query.
 * @param callback (err, res) res is an array of tournament docs
 * @param query - the query to be applied
 * @param shouldCountEntries[optional] if true, adds to every tournament a field 'entriesCount' which represents the number of entries registered to that tournament
 * @param shouldCountUserEntries[optional] - if true, adds a field 'userEntriesCount' which represents the number of entries related to the user with the given username
 * @param shouldGetEntries[optional] - the entries of the tournament are also returned
 * @param username[optional] required for above
 * @param playMode[optional] returns only the tournaments with the given playMode
 * @param shouldSort[optional] if true, tournaments are sorted by start date
 * @param includeMock[optional] if true, mock tournaments are also retrieved
 */
function getTournaments (callback, query, shouldCountEntries, shouldCountUserEntries, shouldGetEntries, username, playMode, shouldSort, includeMock) {
    var requiredFields = extend({}, TOURNAMENTS_BASIC_QUERY_FIELDS); // copy basic required fields
    requiredFields.matches = 1;
    requiredFields.payouts = 1;

    if (shouldCountEntries) {
        requiredFields.entriesCount = { $size : { $ifNull :  [ '$entries', [] ] } };
    }
    if (shouldCountUserEntries && username) {
        requiredFields.userEntriesCount = {
            $size : {
                $ifNull: [
                    {
                        $filter : {
                            input : '$entries',
                            as : 'entry',
                            cond : { $eq : [ '$$entry.username', username ] }
                        }
                    },
                    []
                ]
            }
        }
    }
    if (shouldGetEntries) {
        requiredFields.entries = 1;
    }

    var findQuery = {
        $and : [
            { isCancelled : { $ne : true }}
        ]
    };

    if (query) {
        findQuery['$and'].push(query);
    }
    if (playMode) {
        findQuery['$and'].push({ playMode : playMode });
    }
    if (!includeMock) {
        findQuery['$and'].push({ isMock : false });
    }

    var aggregateOperators = [
        {
            $match : findQuery
        },
        {
            $project : requiredFields
        }
    ];

    if (shouldSort) {
        aggregateOperators.push({ $sort : { startDate : 1 } })
    }

    database.db.collection(database.Collections.Tournaments).aggregate(
        aggregateOperators,
        function (err, res) {
            if (err) {
                logger.error('Failed to get upcoming tournaments: ' + err);
                callback(err);
            }
            else {
                callback(null, res);
            }
        }
    );
}


function getUpcomingTournaments (callback, shouldCountEntries, shouldCountUserEntries, shouldGetEntries, username, playMode, shouldSort, includeMock) {
    getTournaments(callback, { isOpen : true }, shouldCountEntries, shouldCountUserEntries, shouldGetEntries, username, playMode, shouldSort, includeMock);
}


function getActiveTournaments (callback, shouldCountEntries, shouldCountUserEntries, shouldGetEntries, username, playMode, shouldSort, includeMock) {
    getTournaments(callback, { isActive : true }, shouldCountEntries, shouldCountUserEntries, shouldGetEntries, username, playMode, shouldSort, includeMock);
}


/*
Tournaments that are either live or upcoming, or that are already finished and are featured.
 */
function getUpcomingAndActiveTournaments (callback, shouldCountEntries, shouldCountUserEntries, shouldGetEntries, username, playMode, shouldSort, includeMock) {
    getTournaments(callback,
        { $or : [
            { isActive : true },
            { isOpen : true },
            { $and : [ {flags : models.TournamentFlags.FEATURED }, { startDate : { $gt : moment().add(-1, 'M').toDate() }} ] }
            ] },
        shouldCountEntries, shouldCountUserEntries, shouldGetEntries, username, playMode, shouldSort, includeMock);
}


function deleteTournament (tournamentId) {
    logger.verbose('Deleting tournament ' + tournamentId);

    database.db.collection(database.Collections.Tournaments).deleteOne(
        { _id : ObjectId(tournamentId) },
        { w : 1 },
        function (err, res) {
            if (err) {
                logger.error('Failed to delete tournament ' + tournamentId + ': ' + err);
            }
            else if (res.deletedCount === 0) {
                logger.error('Failed to delete tournament ' + tournamentId + ': no tournament found.');
            }
        }
    )
}


function isTournamentFull (tournamentId, callback) {
    database.db.collection(database.Collections.Tournaments).aggregate([
        { $match : { _id : ObjectId(tournamentId) } },
        { $project : { maxEntries : 1, entriesCount : { $size : { $ifNull :  [ '$entries', [] ]}}}}
        ],
        function (err, res) {
            if (err || !res) {
                err = err || 'No tournament found.';
                logger.error('Failed to check if tournament is full: ' + err);
                callback(err);
                return;
            }

            var isFull = (res.maxEntries > 0 && res.maxEntries === res.entriesCount);
            callback(null, isFull);
        });
}


function getCountOfNonFullTournamentsWithGroupId (groupId, callback) {
    database.db.collection(database.Collections.Tournaments).aggregate([
        { $match : { groupId : groupId } },
        { $project : { maxEntries : 1, entriesCount : { $size : { $ifNull :  [ '$entries', [] ]}}}},
        { $group : { _id : null, count : { $sum : { $cond : [ { $or : [ { $lt : [ '$entriesCount', '$maxEntries' ] }, { $lte : [ '$maxEntries', 0 ] } ] }, 1, 0 ] } } } }
    ],
        function (err, res) {
            if (err || res.length === 0) {
                err = err || 'No tournament found with groupId: ' + groupId;
                logger.error('Failed to count tournaments with group id: ' + err);
            }
            else {
                callback(null, res[0].count);
            }
    });
}


function updateTournamentEntriesAndPayouts (tournament, entries, callback) {
    database.db.collection(database.Collections.Tournaments).updateOne(
        { _id : ObjectId(tournament.tournamentId) },
        {
            $set : {
                payouts : models.tournament.payoutsToString(tournament.payouts),
                entries : entries,
                totalPrize : tournament.totalPrize,
                payoutsEntriesNumber : tournament.payoutsEntriesNumber
            }
        },
        { w : 1 },
        function (err, res) {
            if (err || res.matchedCount === 0) {
                err = err || 'No tournament found.';
                logger.error('Failed to update tournament entries! ' + err);

                if (callback) {
                    callback(err);
                }
                return;
            }

            if (callback) {
                callback(null, res);
            }
        }
    );
}


/**
 * Queries the tournaments to which the user has enrolled to.
 *
 * @param user
 * @param getLiveAndUpcoming - returns live and upcoming tournaments
 * @param getHistory - returns history tournaments (these two params are not exclusive)
 * @param callback
 * @param playMode
 */
function getTournamentsForUser (user, getLiveAndUpcoming, getHistory, callback, playMode) {
    var matchQuery = {
        $and : [
            {
                'entries.username' : user.username
            }
        ]
    };

    if (getLiveAndUpcoming) {
        if (!getHistory) {
            matchQuery['$and'].push({
                $or : [
                    {
                        'isOpen' : true
                    },
                    {
                        'isActive' : true
                    }
                ]
            });
        }
    }
    else if (getHistory) {
        matchQuery['$and'].push({ finishedAt : { $exists : true } });
    }

    if (playMode) {
        matchQuery['$and'].push({ playMode : playMode });
    }

    const projectFields = {
        name : 1,
        startDate : 1,
        entryFee : 1,
        rake : 1,
        payouts : 1,
        totalPrize : 1,
        isOpen : 1,
        isActive : 1,
        isCancelled : 1,
        finishedAt : 1,
        players : 1,
        playMode : 1,
        competitionsIds : '$matches.competitionId',
        maxEntries : 1,
        multiEntries : 1,
        entriesCount : { $size : { $ifNull :  [ '$entries', [] ] } },
        entries : { $filter : { input : '$entries', as : 'entry', cond : { $eq : [ '$$entry.username', user.username ] } } } // return only user entries
    };

    database.db.collection(database.Collections.Tournaments).aggregate(
        [
            { $match : matchQuery },
            { $project : projectFields }
        ],
        function (err, tournaments) {
            if (err) {
                logger.error('Failed to get upcoming&active tournaments for user: ' + err);
                return;
            }

            // reduce entries fields size
            for (var i = 0; i < tournaments.length; i++) {
                var entries = tournaments[i].entries;

                for (var e = 0; e < entries.length; e++) {
                    var entry = entries[e];
                    delete entry.matchesPoints;
                    delete entry.title;
                    delete entry.username;
                    delete entry.entryNumber;
                }
            }

            callback(null, tournaments);
        }
    )
}


function hasTournamentEntryForUser (user, callback) {
    database.db.collection(database.Collections.Tournaments).count(
        { 'entries.username' : user.username },
        { limit : 1 },
        function (err, res) {
            if (err) {
                logger.error('Failed to query tournament entry for user: ' +err);
                return;
            }

            callback(null, res !== 0);
        }
    )
}


/**
 * Queries the tournaments which slate contains a match with the given matchId and returns the playerIds of each tournament entry
 * @param matchId
 * @param callback
 */
function getActiveTournamentsContainingMatch (matchId, callback) {
    logger.verbose('Getting tournaments containing match ' + matchId);

    if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    database.db.collection(database.Collections.Tournaments).find(
        { 'matches.matchId' : matchId, isActive : true },
        function (err, res) {
            if (err) {
                logger.error('Failed to get tournaments containing match ' + matchId + ': ' + err);
                return;
            }

            if (constants.GLOBAL_DEBUG) logger.silly('Got active tournaments containing matchId in ' + (Date.now() - debugTime));

            res.toArray(callback);
        }
    )
}


/**
 * Update one or more tournament fields.
 * @param tournamentId
 * @param fields can be either an Array or a single value (use TOURNAMENT_UPDATE_FIELDS constants to refer to fields)
 * @param values can be either an Array or a single value
 * @param callback - optional
 */
function updateTournamentFields (tournamentId, fields, values, callback) {
    var fieldsObj = {};
    var setObj = { $set : fieldsObj };
    if (fields instanceof Array) {
        for (var i = 0; i < fields.length; i++) {
            fieldsObj[fields[i]] = values[i];
        }
    }
    else {
        fieldsObj[fields] = values;
    }

    database.db.collection(database.Collections.Tournaments).updateOne(
        { _id : ObjectId(tournamentId) },
        setObj,
        { w : 1 },
        function (err) {
            if (err) {
                logger.error('Failed to update tournament fields ' + fields + ': ' + err);
            }

            if (callback) {
                callback(err);
            }
        }
    )
}


function countEntriesForUser (tournamentId, user, callback) {
    database.db.collection(database.Collections.Tournaments).aggregate(
        [
            {
                $match : {
                    _id : ObjectId(tournamentId)
                }
            },
            {
                $project : {
                    count : {
                        $size : {
                            $ifNull: [
                                {
                                    $filter : {
                                        input : '$entries',
                                        as : 'entry',
                                        cond : { $eq : [ '$$entry.username', user.username ] }
                                    }
                                },
                                []
                            ]
                        }
                    }
                }
            }
        ],
        function (err, res) {
            if (err || res.length < 1) {
                logger.error('Failed to count entries for user in tournament: ' + (err || 'no tournament found for ' + tournamentId));
                callback(err);
            }
            else {
                callback(null, res[0].count);
            }
        }
    )
}


/**
 * Deletes the entry with the given entryId and returns the modified tournament, if the callback is specified. An entry can be deleted only
 * if the tournament is open.
 * @param tournamentId
 * @param entryId
 * @param username
 * @param shouldCreateModels - if true and if the callback is provided, the tournament model is created and returned (otherwise returns the doc)
 * @param callback [err, updatedTournament] - if the entry has been deleted, the updated tournament is returned. If the tournament is not open,
 *                                          the callback will return (null, false)
 */
function deleteEntryForUser (tournamentId, entryId, username, shouldCreateModels, callback) {
    logger.verbose('Deleting entry ' + entryId + ' for user ' + username);

    isTournamentOpen(tournamentId, function (err, isTournamentOpen) {
        if (err) {
            logger.error('Failed to delete entry for user: ' + err);
            callback(err);
            return;
        }

        if (!isTournamentOpen) {
            callback(null, false);
            return;
        }

        database.db.collection(database.Collections.Tournaments).findOneAndUpdate(
            { _id : ObjectId(tournamentId) },
            {
                $pull : {
                    entries : {
                        $and : [
                            { entryId : entryId },
                            { username : username}
                        ]
                    }
                }
            },
            { w : 1, returnOriginal : false },
            function (err, res) {
                if (err) {
                    logger.error('Failed to delete entry for user: ' + err);

                    if (callback) {
                        callback(err);
                    }
                    return;
                }

                if (callback) {
                    if (shouldCreateModels) {
                        callback(err, dbHelper.createTournamentFromDoc(res.value));
                    }
                    else {
                        callback(err, res.value);
                    }
                }
            }
        )
    });
}


/**
 * Returns a list with the usernames registered to a tournament
 * @param tournamentId
 * @param callback
 */
function getEntriesUsernamesForTournament (tournamentId, callback) {
    database.db.collection(database.Collections.Tournaments).aggregate(
        [
            {
                $match :
                {
                    _id : ObjectId(tournamentId)
                }
            },
            {
                $group : {
                    _id : {
                        usernames : { $ifNull : ['$entries.username', []] }
                    }
                }
            }
        ],
        function (err, res) {
            if (err) {
                logger.error('Failed to entries usernames for tournament: ' + err);
                callback(err);
                return;
            }

            if (!res || res.length === 0) {
                err = 'Failed to find tournament with id ' + tournamentId;
                logger.error(err);
                callback(err);
                return;
            }

            callback(err, res[0]._id.usernames);
        }
    );
}


// the returned tournaments also contain the entries
function getOpenTournamentsContainingMatch (matchId, callback, getPlayers, getEntries) {
    var requiredFields = extend({}, TOURNAMENTS_BASIC_QUERY_FIELDS); // copy basic required fields

    if (getPlayers) {
        requiredFields.players = 1;
    }
    if (getEntries) {
        requiredFields.entries = 1;
    }

    database.db.collection(database.Collections.Tournaments).find(
        {
            $and : [ { isOpen : true }, { 'matches.matchId' : matchId }, { startDate : { $gt : new Date() } } ]
        },
        requiredFields,
        function (err, res) {
            if (err) {
                logger.error('Failed to get open tournaments containing match ' + matchId + ': ' + err);
                callback(err);
                return;
            }

            res.toArray(callback);
        }
    )
}


// returns true or false
function isTournamentOpen (tournamentId, callback) {
    database.db.collection(database.Collections.Tournaments).count(
        {
            $and: [
                { _id : ObjectId(tournamentId) },
                { isOpen : true }
            ]
        },
        { $limit : 1 },
        function (err, res) {
            if (err) {
                logger.error('Failed to check if tournament is open: ' + err);
            }

            callback(err, res === 1);
        }
    )
}


/**
 * @param tournamentId the ObjectId of the tournament to be updated
 * @param entriesDoc the entries document to be set
 * @param batch the database batch where this operation has to be executed
 */
function batchUpdateTournamentEntries (tournamentObjectId, entriesDoc, batch) {
    batch.find({ _id : tournamentObjectId }, { $limit : 1 })
        .updateOne(
            { $set :
                {
                    entries : entriesDoc
                }
            }
        );
}


function getEntryById (tournamentId, entryId, callback) {
    database.db.collection(database.Collections.Tournaments).find(
        { _id : ObjectId(tournamentId) },
        { _id : 0, entries : { $elemMatch : { entryId : entryId } } }
    ).limit(1)
        .next(function (err, doc) {
            if (err || doc === null) {
                logger.error('Failed to get entry with id ' + entryId);
                callback(err || ('No entry found for the given id: ' + entryId));
            }
            else {
                callback(null, doc.entries[0]);
            }
        });
}


function updateEntryLineup (tournamentId, entryId, playersIds, hasInactivePlayers, callback) {
    database.db.collection(database.Collections.Tournaments).updateOne(
        {
            _id : ObjectId(tournamentId),
            entries : { $elemMatch : { 'entryId' : entryId } }
        },
        {
            $set : {
                'entries.$.playersIds' : playersIds,
                'entries.$.hasInactivePlayers' : hasInactivePlayers
            }
        },
        { w : 1 },
        function (err) {
            if (err) {
                logger.error('Failed to update lineup for entry ' + entryId + ': ' + err);

                if (callback) {
                    callback(err);
                }
                return;
            }

            if (callback) {
                callback();
            }
        }
    )
}


function getLastPlayedSimilarTournament (tournament, callback, requiredFields) {
    database.db.collection(database.Collections.Tournaments).find(
        { programmedId : tournament.programmedId, playMode : tournament.playMode, isCancelled : { $ne : true }, finishedAt : {$exists : true}},
        requiredFields ? requiredFields : {},
        { 'sort' : { 'startDate' : -1 }, 'limit' : 1 }
    )
        .next(function (err, res) {
            callback(err, res);
        });
}


/*
 ****************   SLATES    ****************
 *
 * When a slate is first created, it stores a reference to the teams that are contained in it (a comma separated list of ids).
 * At the time a tournament is started, salaries are calculated for all the players in a slate, and a field containing also the teams
 * details is stored in the slate, to easily access the players and their calculated salaries.
 *
 */


// IMPORTANT!
// To prevent multiple equal slates to be inserted in the database, we keep track of the ones that are waiting for the insert callback.
// If the provided slate is in conflict with a slate that is already being inserted, that slate is returned and the insert is not performed.
function insertSlateFromDocumentAndCheckConflicts (slateDoc, callback) {
    var teamsIds = slateDoc.teamsIds.split(',');

    // check that a slate with the same matches is not already waiting for being inserted
    var indexOfEqualSlateBeingInserted = -1;

    for (var i = 0; i < SLATES_BEING_INSERTED.length; i++) {
        if (helper.arraysMatch(teamsIds, SLATES_BEING_INSERTED[i].teamsIds.split(','))) {
            indexOfEqualSlateBeingInserted = i;
            break;
        }
    }

    if (indexOfEqualSlateBeingInserted >= 0) {
        return SLATES_BEING_INSERTED[i];
    }

    SLATES_BEING_INSERTED.push(slateDoc);

    database.db.collection(database.Collections.Slates).insertOne(
        slateDoc,
        { w : 1 },
        function (err) {
            SLATES_BEING_INSERTED.splice(SLATES_BEING_INSERTED.indexOf(SLATES_BEING_INSERTED), 1);

            if (err) {
                logger.error('Failed to insert slate from doc! ' + err);
            }

            if (callback) {
                callback(err);
            }
        }
    );
}


/**
 * @param slateId the id of the ObjectId to be retrieved
 * @param callback (err, res) returns an error if no slate is found for the given slateId
 * @param shouldCreateModel - true if the model of the slate should be returned instead of the doc
 * @param requiredFields - restrict result to specified fields
 */
function getSlateById (slateId, callback, shouldCreateModel, requiredFields) {
    database.db.collection(database.Collections.Slates).find(
            { _id : ObjectId(slateId) },
            requiredFields ? requiredFields : {}
        )
        .limit(1)
        .next(function (err, doc) {
            if (err || doc === null) {
                logger.error('Failed to get slate with id ' + slateId);
                callback(err || ('No slate found for the given id: ' +slateId));
            }
            else {
                callback(null, shouldCreateModel ? dbHelper.createSlateFromDoc(doc) : doc);
            }
        });
}


function getSlatesByIds (ids, callback) {
    var objectIds = [];

    for (var i = 0; i < ids.length; i++) {
        objectIds.push(ObjectId(ids[i]));
    }

    database.db.collection(database.Collections.Slates).find(
        { _id : { $in : objectIds }},
        function (err, doc) {
            if (err) {
                logger.error('Failed to get slates by ids');
                callback(err);
            }
            else {
                doc.toArray(callback)
            }
        });
}


function getSlates (callback, query, requiredFields) {
    database.db.collection(database.Collections.Slates).find(
        query || {},
        requiredFields || {},
        function (err, res) {
            if (err) {
                logger.error('Failed to get slates with query ' + query + ': ' + err);
                return;
            }

            res.toArray(callback);
        }
    )
}


function updateSlateTeams (slate, callback, areSalariesCalculated) {
    logger.verbose('Updating slate teams for ' + slate._id);

    if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    var setObj = { teams : slate.teams };

    if (areSalariesCalculated) {
        setObj['salariesCalculated'] = areSalariesCalculated;
    }

    database.db.collection(database.Collections.Slates).updateOne(
        { _id : ObjectId(slate._id) },
        { $set : setObj },
        { w : 1 },
        function (err) {
            if (err) {
                logger.error('Failed to update slate ' + slate._id + ': ' + err);
                if (callback) callback(err);
                return;
            }

            if (callback) {
                callback();
            }

            if (constants.GLOBAL_DEBUG) logger.silly('Updated slate in ' + (Date.now() - debugTime));
        }
    )
}


function hasSlate (slateId, callback) {
    database.db.collection(database.Collections.Slates).count(
        { _id : ObjectId(slateId) },
        { limit : 1 },
        function (err, res) {
            if (err) {
                logger.error('Failed to search for slate: ' + err);
                callback(err);
            }
            else {
                callback(null, res !== 0);
            }
        }
    )
}


// returns the first slate found containing the match
function getSlateContainingMatch (matchId, callback) {
    /* //TODO to improve, implement following db function to return only the teams in the match
     db.getCollection('slates').aggregate([
     { $match : { 'matches.matchId' : '853298' } },
     {
     $project : {
     'teams' : {
     $filter : {
     input : '$teams',
     as : 'team',
     cond : {
     $or : [
     { '$eq' : [ '$$team.teamId', '145' ] }
     ]
     }
     }
     }
     }
     }
     ])
     */

    database.db.collection(database.Collections.Slates).find(
        { 'matches.matchId' : matchId }
    ).limit(1)
        .next(function (err, doc) {
            if (err) {
                logger.error('Failed to get slate containing match ' + matchId + ': ' + err);
                callback(err);
            }
            else {
                if (doc === null) {
                    logger.verbose('No slate found containig match ' + matchId);
                }
                callback(null, doc);
            }
        });
}


/*
Find slate containing all the matches with the given ids
 */
function getSlateByMatchesIds (matchesIds, callback, shouldReturnTeams) {
    var aggregationOperators = [];

    // 1. limit results to slates that dont contain more matches than what we are looking for
    var obj = {};
    obj['matches.' + matchesIds.length] = { $exists : false };
    aggregationOperators.push({ $match : obj });

    // 2. filter the matches with the same matches ids
    var cond = [];
    for (var i = 0; i < matchesIds.length; i++) {
        cond.push({ $eq : [ '$$match.matchId', matchesIds[i] ] })
    }
    var project = {};
    Object.keys(SLATE_BASIC_QUERY_FIELDS).forEach(function (field) {
        project[field] = 1;
    });
    if (shouldReturnTeams) {
        project['teams'] = 1;
    }
    project['matches'] = {
        $filter : {
            input : '$matches',
                as : 'match',
                cond : { $or : cond }
        }
    };
    aggregationOperators.push({ $project : project });

    // 3. don't consider slates with less filtered matches than the ones we are looking for
    var obj2 = {};
    obj2['matches.' + (matchesIds.length - 1)] = { $exists : true };
    aggregationOperators.push({ $match : obj2 });

    // 4. get only the first result
    aggregationOperators.push({ $limit : 1 });

    database.db.collection(database.Collections.Slates).aggregate(
        aggregationOperators,
        function (err, res) {
            if (err) {
                logger.error('Failed to find slate from matches ids: ' + err);
                callback(err);
                return;
            }

            if (res) {
                res = res[0];
            }
            callback(err, res);
        }
    )
}


function getSlatesContainingMatch (matchId, requiredFields, callback) {
    var aggregationOperators = [
        {
            $match : { 'matches.matchId' : matchId }
        }
    ];

    if (requiredFields) {
        aggregationOperators.push({
            $project : requiredFields
        })
    }

    database.db.collection(database.Collections.Slates).aggregate(
        aggregationOperators,
        function (err, res) {
            if (err) {
                logger.error('Failed to find slates containing match ' + matchId + ': ' + err);
                callback(err);
                return;
            }

            callback(err, res);
        }
    )
}


function calculateTotalSalaryForEntryInSlate (playersIds, slateId, callback) {
    // if (constants.GLOBAL_DEBUG) var debugTime = Date.now();

    // create a condition to query the players based on the ids
    var conditionsArr = [];
    for (var i = 0; i < playersIds.length; i++) {
        conditionsArr.push({ $eq : [ '$$player.playerId', playersIds[i] ] });
    }

    var playersIdsQuery = { $or : conditionsArr };

    database.db.collection(database.Collections.Slates).aggregate(
        [
            { $match : { _id : ObjectId(slateId) } }, // find slate
            { $project : {'teams.players' : 1} },     // we only want the players
            { $unwind : '$teams' },                   // place every team in a different doc
            { $project : { 'players' : {              // filter only the players we need
                $filter : {
                    input : '$teams.players',
                    as : 'player',
                    cond : playersIdsQuery
                }
            } }},
            {
                $project : { 'players.salary' : 1 }   // we actually only need the salaries
            },
            { $group : { _id : '$players.salary', count : { $sum : 1 } } }, // group the salaries for every team
            { $project : {                              // sum the salaries for every team
                totalSalary : {
                    $sum : '$_id'
                }
            } },
            { $group : { _id : null, totalSalary : { $sum : '$totalSalary' } } } // sum all the salaries
        ],
        function (err, res) {
            if (err) {
                logger.error('Failed to calculate total salaries for slate: ' + err);
                callback(err);
                return;
            }

            // if (constants.GLOBAL_DEBUG) logger.silly('Calculated total salaries for entry in ' + (Date.now() - debugTime));

            callback(null, parseFloat(res[0].totalSalary));
        }
    )
}


function updateSlateWithPlayersTransfers (competition) {
    //TODO
    // database.db.collection(database.Collections.Slates).find(
    //     { lastMatchStart : { $gt : new Date() }},
    //     { competitions : 1, teams : 1 },
    //     function (err, res) {
    //         res.toArray(function (err, slates) {
    //
    //             if (err) {
    //                 logger.error('Failed to update slates with players transfers: ' + err);
    //                 return;
    //             }
    //
    //             for (var p = 0; p < competition.playerTransfers.length; p++) {
    //                 var playerTransfer = competition.playerTransfers[p];
    //
    //                 console.log(playerTransfer.player.uID + ' team: ' + (playerTransfer.player.team ? playerTransfer.player.team.name : ''));
    //             }
    //
    //             for (var i = 0; i < slates.length; i++) {
    //                 var slate = slates[i];
    //                 var containsCompetition = false;
    //
    //                 // skip slates not containing the competition
    //                 for (var c = 0; c < slate.competitions.length; c++) {
    //                     if (slate.competitions[c].competitionId === competition.uID) {
    //                         containsCompetition = true;
    //                         break;
    //                     }
    //                 }
    //
    //                 if (!containsCompetition) continue;
    //
    //
    //             }
    //
    //         });
    //     }
    // );
}


/**
 * @param slateObjectId the id of the slate to be updated
 * @param teamsDoc the teams document to be set
 * @param batch the database batch where this operation has to be executed
 */
function batchUpdateSlateTeams (slateObjectId, teamsDoc, batch) {
    batch.find({ _id : slateObjectId }, { $limit : 1 })
        .updateOne(
            { $set :
                {
                    teams : teamsDoc
                }
            }
        );
}


function deleteSlate (slateId) {
    database.db.collection(database.Collections.Slates).deleteOne(
        { _id : ObjectId(slateId) },
        function (err) {
            if (err) {
                logger.error('Failed to delete slate! ' + err);
            }
        }
    )
}


/**
 * Finds the slates containing the given players and sets salary and points of last played matches from slate players,
 * giving priority to the most recent slates possibly containing the player in the same team provided with the teamsForPlayers fields,
 * and the same competition. If the player in the slate is not in the same competition and team as the ones provided, then only the salary is
 * set and not other stats.
 *
 * This query is not efficient at all but what can you, it's not ran often anyways.
 *
 * @param requiredPlayers - obj mapping players to their ids
 * @param teamsForPlayers - obj mapping players ids to teams ids
 * @param competitionId - the competition id of preference
 * @param callback
 */
function findSlatesContainingPlayersAndAssignSalaryAndStats (requiredPlayers, teamsForPlayers, competitionId, callback) {
    var playersIds = Object.keys(requiredPlayers);

    database.db.collection(database.Collections.Slates).find(
        { 'teams.players.playerId' : { $in : playersIds }},
        {
            'competitions.competitionId' : 1,
            'teams.teamId' : 1,
            'teams.players.playerId' : 1,
            'teams.players.lastPlayedMatchId' : 1,
            'teams.players.salary' : 1,
            'teams.pointsOfLastPlayedMatches' : 1,
            'teams.competitionId' : 1
        },
        function (err, res) {
            if (err) {
                logger.error('Failed to find slates containing players to set salary and stats: ' + err);
                callback(err);
                return;
            }

            res.toArray(function (err, slates) {
                if (err) {
                    logger.error('Failed to find slates containing players to set salary and stats: ' + err);
                    callback(err);
                    return;
                }

                // find slate players for every required player
                var foundSlatePlayers = {}; // maps player id to an array of slate players found

                for (var i = slates.length - 1; i--; i >= 0) {
                    var slate = slates[i];

                    for (var t = 0; t < slate.teams.length; t++) {
                        var team = slate.teams[t];

                        for (var p = 0; p < team.players.length; p++) {
                            var reqPlayer = requiredPlayers[team.players[p].playerId];

                            if (!reqPlayer) continue;

                            var slatePlayer = team.players[p];
                            slatePlayer.teamId = team.teamId;
                            slatePlayer.competitionId = team.competitionId;
                            var foundSlatePlayersForPlayer = foundSlatePlayers[slatePlayer.playerId];
                            if (foundSlatePlayersForPlayer) {
                                foundSlatePlayersForPlayer.push(slatePlayer);
                            }
                            else {
                                foundSlatePlayers[slatePlayer.playerId] = [ slatePlayer ];
                            }
                        }
                    }
                }

                // then, find the most appropriate slate player. Give priority to the most recent player with same team id and competitions,
                // otherwise of same team; last option, different competition and different team
                for (var playerId in requiredPlayers) {
                    reqPlayer = requiredPlayers[playerId];
                    foundSlatePlayersForPlayer = foundSlatePlayers[playerId];
                    var teamId = teamsForPlayers[playerId];

                    if (!foundSlatePlayersForPlayer) continue;

                    var validSlatePlayer = null;
                    var perfectSlatePlayerFound = false;

                    for (i = 0; i < foundSlatePlayersForPlayer.length; i++) {
                        slatePlayer = foundSlatePlayersForPlayer[i];

                        if (slatePlayer.teamId === teamId) {
                            if (slatePlayer.competitionId === competitionId) {
                                reqPlayer.salary = slatePlayer.salary;
                                if (slatePlayer.pointsOfLastPlayedMatches) {
                                    reqPlayer.pointsOfLastPlayedMatches = slatePlayer.pointsOfLastPlayedMatches;
                                    reqPlayer.lastPlayedMatchId = slatePlayer.lastPlayedMatchId;
                                }

                                perfectSlatePlayerFound = true;
                                break;
                            }
                            else if (!validSlatePlayer) {
                                validSlatePlayer = slatePlayer;
                            }
                        }
                    }

                    if (!perfectSlatePlayerFound) {
                        if (!validSlatePlayer) {
                            validSlatePlayer = foundSlatePlayersForPlayer[0];
                        }

                        reqPlayer.salary = validSlatePlayer.salary;
                    }
                }

                callback();
            });
        }
    )
}


/*
 ****************   TRANSACTIONS    ****************
 *
 */
function insertTransaction (transactionDoc, callback) {
    database.db.collection(database.Collections.Transactions).insertOne(
        transactionDoc,
        { w : 1 },
        function (err) {
            if (err) {
                logger.error('Failed to insert transaction! ' + err);
            }

            callback(err);
        }
    )
}


function getTransactionsForUser (username, callback) {
    database.db.collection(database.Collections.Transactions).find(
        { username : username },
        function (err, res) {
            if (err) {
                logger.error('Failed to get transactions for user: ' + err);
                callback(err);
            }
            else {
                res.toArray(callback);
            }
        }
    )
}


function getTransaction (transactionId, callback) {
    database.db.collection(database.Collections.Transactions).find(
        { transactionId : transactionId }
        )
        .limit(1)
        .next(function (err, res) {
            if (err) {
                logger.error('Failed to get transaction: ' + err);
            }

            callback(err, res);
        });
}


function getTransactionForUserWithPaymentMethod (username, paymentMethod, callback) {
    database.db.collection(database.Collections.Transactions).find(
        { username : username, paymentMethod : paymentMethod }
        )
        .limit(1)
        .next(function (err, res) {
            if (err) {
                logger.error('Failed to get transaction with payment method ' + paymentMethod + ': ' + err);
            }

            callback(err, res);
        });
}


function updateTransactionStatus (transactionId, newStatus) {
    logger.verbose('Updating transaction status for id ' + transactionId + ' to ' + newStatus);

    database.db.collection(database.Collections.Transactions).updateOne(
        { transactionId : transactionId },
        { $set : { status : newStatus } },
        function (err) {
            if (err) {
                logger.error('Failed to update transaction status: ' + err);
            }
        }
    )
}


function getAllTransactions (callback, requiredFields) {
    database.db.collection(database.Collections.Transactions).find(
        {},
        requiredFields ? requiredFields : {},
        function (err, res) {
            if (err) {
                logger.error('Failed to get all transactions: ' + err);
            }

            res.toArray(callback);
        }
    )
}


/*
 ****************   TRANSACTIONS REQUESTS    ****************
 *
 */
function insertTransactionRequest (transactionRequestDoc, callback) {
    database.db.collection(database.Collections.TransactionsRequests).insertOne(
        transactionRequestDoc,
        { w : 1 },
        function (err) {
            if (err) {
                logger.error('Failed to insert transaction request! ' + err);
            }

            callback(err);
        }
    )
}


function getTransactionRequest (transactionId, callback) {
    database.db.collection(database.Collections.TransactionsRequests).find(
        { transactionId : transactionId }
    )
        .limit(1)
        .next(function (err, res) {
            if (err) {
                logger.error('Failed to get transaction request: ' + err);
            }

            callback(err, res);
        });
}


/*
 ****************   BALANCE UPDATES    ****************
 *
 */
function insertBalanceUpdate (username, amount, reason, tournament, transaction, playMode, callback) {

    database.db.collection(database.Collections.BalanceUpdates).insertOne(
        dbHelper.createBalanceUpdateDoc(username, amount, reason, tournament, transaction, playMode),
        { w : 1 },
        function (err) {
            if (err) {
                logger.error('Failed to insert balance update: ' + err);
            }

            if (callback) {
                callback(err);
            }
        }
    )
}


function batchInsertBalanceUpdate (username, amount, reason, tournament, transaction, playMode, batch) {
    batch.insert(dbHelper.createBalanceUpdateDoc(username, amount, reason, tournament, transaction, playMode), { w : 1 });
}


function getBalanceUpdates (username, callback) {
    database.db.collection(database.Collections.BalanceUpdates).find(
        { username : username },
        { 'sort' : { date : -1 } },
        function (err, res) {
            if (err) {
                logger.error('Failed to get balance updates: ' + err);
                return;
            }

            res.toArray(callback);
        }
    )
}


/*
 ****************   CHAT MESSAGES    ****************
 *
 * Chat messages are stored in the redis cache.
 */
function insertChatMessage (message, tournamentId) {
    cache.insertChatMessage(message, tournamentId);
}


function getChatMessages (tournamentId, callback) {
    cache.getChatMessages(tournamentId, callback);
}


/*
 ****************   OLD COMPETITION MATCHES    ****************
 *
 */
function getMockMatches (matchesIds, callback) {
    var conditionsArr = [];
    for (var i = 0; i < matchesIds.length; i++) {
        conditionsArr.push({ $eq : [ '$$match.matchId', matchesIds[i] ] });
    }


    var query = { $or : conditionsArr };

    database.db.collection(database.Collections.OldCompetitionMatches).aggregate(
        [
            { $project : { competitionId : 1, matches : { $filter : { input : '$matches', as : 'match', cond : query } } } },
        ],
        function (err, res) {
            if (err) {
                logger.error('Failed to get mock matches: ' + err);
                callback(err);
            }
            else {
                callback(err, res);
            }
        }
    )
}


/*
 ****************   TERMS AND CONDITIONS    ****************
 */
function getTermsAndConditions (callback) {
    database.db.collection(database.Collections.TermsAndConditions).find(
        {},
        {},
        { 'sort' : { 'date' : -1 }, 'limit' : 1 }
    )
        .next(function (err, res) {
            callback(err, res);
        });
}


function insertTermsAndConditions (version, content, callback) {
    database.db.collection(database.Collections.TermsAndConditions).insertOne(
        {
            date : new Date(),
            version : version,
            content : content
        },
        { w : 1 },
        function (err, res) {
            if (err) {
                logger.error('Failed to insert terms and conditions: ' + err);
                callback(err);
            }
            else {
                callback(null, res.ops[0]);
            }
        }
    )
}


/*
 ****************   GAME RULES    ****************
 */
function getGameRules (callback) {
    database.db.collection(database.Collections.GameRules).find(
        {},
        {},
        { 'sort' : { 'date' : -1 }, 'limit' : 1 }
    )
        .next(function (err, res) {
            callback(err, res);
        });
}


function insertGameRules (version, content, actions, updateMessage, callback) {
    database.db.collection(database.Collections.GameRules).insertOne(
        {
            date : new Date(),
            version : version,
            content : content,
            actions : actions,
            message : updateMessage
        },
        { w : 1 },
        function (err, res) {
            if (err) {
                logger.error('Failed to insert game rules: ' + err);
                callback(err);
            }
            else {
                callback(null, res.ops[0]);
            }
        }
    )
}


function getGameRulesUpdates (sinceVersion, callback) {
    database.db.collection(database.Collections.GameRules).find(
        { version : { $gt : sinceVersion } },
        { date : 1, version : 1, message : 1 },
        { sort : { version : -1 }},
        function (err, res) {
            if (err) {
                logger.error('Failed to get Game Rules updates: ' + err);
            }
            else {
                res.toArray(callback);
            }
        }
    );
}



var COMPETITION_BASIC_QUERY_FIELDS = {
    competitionId : 1,
    name : 1
};

var TOURNAMENTS_BASIC_QUERY_FIELDS = {
    _id : 1,
    name : 1,
    type : 1,
    flags : 1,
    entryFee : 1,
    rake : 1,
    maxEntries : 1,
    guaranteedPrize : 1,
    startDate : 1,
    totalPrize : 1,
    slateId : 1,
    multiEntries : 1,
    groupId : 1,
    isActive : 1,
    isOpen : 1,
    isMock : 1,
    playMode : 1,
    programmedId : 1
};

var ENTRIES_BASIC_QUERY_FIELDS = {
    'username' : 1,
    'playersIds' : 1,
    'totalPoints' : 1,
    'entryId' : 1,
    'entryNumber' : 1,
    'title' : 1,
    'progress' : 1,
    'projectedPoints' : 1,
    'prize' : 1
};

var SLATE_BASIC_QUERY_FIELDS = {
    _id : 1,
    matches : 1,
    teamsIds : 1,
    competitions : 1
};

var SLATES_BEING_INSERTED = [];



exports.backupDatabase = backupDatabase;
exports.initUnorderedBulkOperation = initUnorderedBulkOperation;
exports.executeBulk = executeBulk;
exports.clearAllSessions = clearAllSessions;

exports.insertOrUpdateMatch = insertOrUpdateMatch;
exports.getPointsStatsForAllThePlayersFromMatches = getPointsStatsForAllThePlayersFromMatches;
exports.getLastMatchesPlayedByPlayer = getLastMatchesPlayedByPlayer;
exports.getAllMatches = getAllMatches;
exports.getMatchById = getMatchById;
exports.getMatchesByIds = getMatchesByIds;
exports.updateMatchWithDoc = updateMatchWithDoc;
exports.deleteMatch = deleteMatch;
exports.getCurrentSeasonId = getCurrentSeasonId;

exports.insertOrUpdatePlayersActionsForMatch = insertOrUpdatePlayersActionsForMatch;
exports.getPlayersActions = getPlayersActions;
exports.deletePlayersActions = deletePlayersActions;
exports.getMatchesStatsHistoryForPlayer = getMatchesStatsHistoryForPlayer;
exports.updatePlayerAction = updatePlayerAction;

exports.getCompetitionsByIds = getCompetitionsByIds;
exports.insertCompetitionMatches = insertOrUpdateCompetitionMatches;
exports.insertCompetitionTeams = insertOrUpdateCompetitionTeams;
exports.getAllPlayersFromTeamsInCompetition = getAllPlayersFromTeamsInCompetition;
exports.getAllTeamsInCompetition = getAllTeamsInCompetition;
exports.getAllMatchesInCompetition = getAllMatchesInCompetition;
exports.getTeamsByIdsFromCompetition = getTeamsByIdsFromCompetition;
exports.getTeamsByIdsFromMultipleCompetitions = getTeamsByIdsFromMultipleCompetitions;
exports.getMatchesByIdsFromCompetitions = getMatchesByIdsFromCompetitions;
exports.getUpcomingCompetitionMatches = getUpcomingCompetitionMatches;
exports.getAllCompetitions = getAllCompetitions;
exports.getTeamAndPlayersFromCompetition = getPlayersFromTeamInCompetition;
exports.updateTeamPlayersWithTeamDoc = updateTeamPlayersWithTeamDoc;
exports.updateCompetitionTeamsWithDoc = updateCompetitionTeamsWithDoc;
exports.updateMatchInCompetition = updateMatchInCompetition;

exports.insertOrUpdateUser = insertOrUpdateUser;
exports.batchUpdateUserBalance = batchUpdateUserBalance;
exports.updateUserBalance = updateUserBalance;
exports.hasUser = hasUser;
exports.getUser = getUser;
exports.getUsers = getUsers;
exports.isValidNewUser = isValidNewUser;
exports.findUserWithRegistrationToken = findUserWithRegistrationToken;
exports.findUserWithPasswordResetToken = findUserWithPasswordResetToken;
exports.updateUserFields = updateUserFields;
exports.setUserPasswordResetData = setUserPasswordResetData;
exports.resetUsersMonthlySpending = resetUsersMonthlySpending;

exports.insertTournament = insertTournament;
// exports.updateTournament = updateTournament;
exports.getTournaments = getTournaments;
exports.getActiveTournaments = getActiveTournaments;
exports.getUpcomingTournaments = getUpcomingTournaments;
exports.getLobbyTournaments = getUpcomingAndActiveTournaments;
exports.getTournamentById = getTournamentById;
exports.deleteTournament = deleteTournament;
exports.updateTournamentEntriesAndPayouts = updateTournamentEntriesAndPayouts;
exports.getTournamentsForUser = getTournamentsForUser;
exports.hasTournamentEntryForUser = hasTournamentEntryForUser;
exports.getActiveTournamentsContainingMatch = getActiveTournamentsContainingMatch;
exports.batchUpdateTournamentEntries = batchUpdateTournamentEntries;
exports.updateTournamentFields = updateTournamentFields;
exports.countEntriesForUser = countEntriesForUser;
exports.deleteEntryForUser = deleteEntryForUser;
exports.getEntriesUsernamesForTournament = getEntriesUsernamesForTournament;
exports.getOpenTournamentsContainingMatch = getOpenTournamentsContainingMatch;
exports.getEntryById = getEntryById;
exports.updateEntryLineup = updateEntryLineup;
exports.isTournamentFull = isTournamentFull;
exports.getCountOfNonFullTournamentsWithGroupId = getCountOfNonFullTournamentsWithGroupId;
exports.getTournamentOverview = getTournamentOverview;
exports.getLastPlayedSimilarTournament = getLastPlayedSimilarTournament;
exports.getTournamentByIdSimple = getTournamentByIdSimple;
exports.getAllTournamentsHistory = getAllTournamentsHistory;

exports.insertSlateFromDocumentAndCheckConflicts = insertSlateFromDocumentAndCheckConflicts;
exports.getSlateById = getSlateById;
exports.getSlatesByIds = getSlatesByIds;
exports.getSlates = getSlates;
exports.updateSlateTeams = updateSlateTeams;
exports.hasSlate = hasSlate;
exports.getSlatesContainingMatch = getSlatesContainingMatch;
exports.calculateTotalSalaryForEntryInSlate = calculateTotalSalaryForEntryInSlate;
exports.getSlateByMatchesIds = getSlateByMatchesIds;
exports.batchUpdateSlateTeams = batchUpdateSlateTeams;
exports.getSlateContainingMatch = getSlateContainingMatch;
exports.deleteSlate = deleteSlate;

exports.insertTransaction = insertTransaction;
exports.getTransactionsForUser = getTransactionsForUser;
exports.getTransaction = getTransaction;
exports.getTransactionForUserWithPaymentMethod = getTransactionForUserWithPaymentMethod;
exports.updateTransactionStatus = updateTransactionStatus;
exports.getAllTransactions = getAllTransactions;

exports.insertTransactionRequest = insertTransactionRequest;
exports.getTransactionRequest = getTransactionRequest;

exports.insertBalanceUpdate = insertBalanceUpdate;
exports.batchInsertBalanceUpdate = batchInsertBalanceUpdate;
exports.getBalanceUpdates = getBalanceUpdates;

exports.insertChatMessage = insertChatMessage;
exports.getChatMessages = getChatMessages;

exports.insertTermsAndConditions = insertTermsAndConditions;
exports.getTermsAndConditions = getTermsAndConditions;

exports.insertGameRules = insertGameRules;
exports.getGameRules = getGameRules;
exports.getGameRulesUpdates = getGameRulesUpdates;

exports.getMockMatches = getMockMatches;

exports.Collections = database.Collections;

// fields used to update tournament (@see updateTournamentFields)
exports.TOURNAMENT_UPDATE_FIELDS = {
    IS_OPEN : 'isOpen',
    IS_ACTIVE : 'isActive',
    MATCHES : 'matches',
    FINISHED_AT : 'finishedAt',
    PAYOUTS : 'payouts',
    PAYOUTS_ENTRIES_NUMBER : 'payoutsEntriesNumber',
    ENTRIES : 'entries',
    IS_CANCELLED : 'isCancelled',
    PROGRESS : 'progress'
};

exports.USER_UPDATE_FIELDS = {
    PASSWORD : 'password',
    PASSWORD_RESET_TOKEN : 'passwordResetToken',
    PLAY_MODE : 'playMode',
    TC_VERSION : 'tcVersion',
    GAME_RULES_VERSION : 'gameRulesVersion',
    SETTINGS : 'settings',
    RESPONSIBLE_GAMING_CHANGED_DATE : 'responsibleGamingChangedDate',
    IS_LOCKED : 'isLocked',
    IS_ID_VERIFIED : 'isIdVerified'
};













exports.test = function (callback) {
    database.db.collection(database.Collections.Tournaments).find({ startDate : { $gt : new Date('2016-12-02')},isMock : false  },
        { 'sort' : 'startDate', 'limit' : 100 },function (err, res) {
        res.toArray(callback);
    })
};

exports.test1 = function (date, matchId, callback) {
    database.db.collection(database.Collections.Tournaments).find({ startDate : { $lte : date}, 'matches.matchId' : matchId},
        { 'sort' : { startDate : -1 }, 'limit' : 100 },function (err, res) {
        res.toArray(callback);
    })
};