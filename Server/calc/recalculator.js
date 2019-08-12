// script useful to re-calculate and assign the points of the last played matches for every player in the DB
var db = require('../db/dbManager.js');
var salaryCalculator = require('./salaryCalculator.js');
var logger = require('../util/logger.js');
var models = require('../models/index.js');
var moment = require('moment');

/**
 * The re-calculation consist of two steps:
 * 1. Calculation of points of all the players in all the matches, based on the stored actions of each one of them
 * 2. Calculation of the history points, history stats and points of the last matches for every player in every competition
 */

//TODO set a limit of the number of matches to consider, cause now it's recalculating ALL of the matches

require('../db/Database.js').initDB(function() {
    recalculateSalariesForPreviousPlayersActions();
});


function recalculatePointsForAllMatches (callback) {
    var calcTime = Date.now();

    db.getAllMatches(function (err, matches) {
        if (err) return;

        // loop through every match and every player
        for (var i = 0; i < matches.length; i++) {
            var match = matches[i];

            for (var k = 0; k < 2; k++) {
                var players = (k === 0) ? match.firstTeam.players : match.secondTeam.players;

                for (var j = 0; j < players.length; j++) {
                    var player = players[j];
                    var actions = models.playerAction.parseActions(player.actions);

                    if (!actions) continue;

                    var playerPos = player.subposition || player.position;
                    player.points = 0;

                    // recalculate points for actions
                    for (var actionIndex in actions) {
                        player.points += actions[actionIndex].calculatePointsForPosition(playerPos);
                    }

                    player.actions = models.playerAction.convertActionsToString(actions);
                }
            }

            db.updateMatchWithDoc(match);
        }

        logger.debug('It took ' + (Date.now() - calcTime) + 'ms to recalculate points for all the matches');

        if (callback) {
            callback();
        }
    });
}


function recalculateHistoryPointsForAllPlayers() {
    var calcTime = Date.now();

    db.getAllCompetitions(function (err, competitions) {
        if (err) {
            logger.error('Failed to get all competitions from DB: '+ err);
            return;
        }

        for (var i = 0; i < competitions.length; i++) {
            recalculatePointsForCompetition(competitions[i].competitionId);
        }
    });


    var recalculatePointsForCompetition = function (competitionId) {
        db.getAllTeamsInCompetition(competitionId, false, false, function (err, teams) {
            if (err) {
                logger.debug('Failed to get players from DB: ' + err);
                return;
            }

            var requestsWaiting = 0;

            for (var i = 0; i < teams.length; i++) {
                var team = teams[i];

                for (var j = 0; j < team.players.length; j++) {
                    var player = team.players[j];
                    requestsWaiting++;

                    db.getLastMatchesPlayedByPlayer(player.playerId, -1, function (err, matches) {

                        if (err) {
                            notifyRequestFinished();
                            logger.debug('Failed to get matches for player ' + this.playerId + ': ' + err);
                            return;
                        }

                        if (matches.length === 0) {
                            notifyRequestFinished();
                            return;
                        }

                        var pointsCount = 0;
                        var actions = [];
                        // get the ids of the last matches and set them to the player
                        var points = '';

                        for (var k = 0; k < matches.length; k++) {
                            var matchPlayer = getPlayerFromMatch(matches[k], this.playerId);
                            var matchActions = models.playerAction.parseActions(matchPlayer.actions);

                            if (matchActions) {
                                actions = models.playerAction.mergeAndSumActions(matchActions, actions);
                            }

                            pointsCount += matchPlayer.points;

                            if (k < salaryCalculator.getNumberOfMatchesUsedForCalculations()) {
                                points += matchPlayer.points + ',';
                            }
                        }

                        this.lastPlayedMatchId = matches[0].matchId;
                        this.pointsOfLastPlayedMatches = points;

                        notifyRequestFinished();

                    }.bind(player));
                }
            }

            // update the db once we are done with all of this craziness
            var notifyRequestFinished = function() {
                if (--requestsWaiting === 0) {
                    logger.debug('Done re calculating everything! Now its time to update the DB.');
                    db.updateCompetitionTeamsWithDoc(competitionId, this);

                    logger.debug('It took ' + (Date.now() - calcTime) + 'ms to re calculate everything.');
                }
            }.bind(teams);
        });
    };
}


function getPlayerFromMatch (matchDoc, playerId) {
    for (var i = 0; i < matchDoc.firstTeam.players.length; i++) {
        if (matchDoc.firstTeam.players[i].playerId === playerId) {
            return matchDoc.firstTeam.players[i];
        }
    }

    for (i = 0; i < matchDoc.secondTeam.players.length; i++) {
        if (matchDoc.secondTeam.players[i].playerId === playerId) {
            return matchDoc.secondTeam.players[i];
        }
    }
}


function recalculateSalariesForPreviousPlayersActions () {
    var untilDate = moment().subtract(12, 'months').toDate();
    db.getPointsStatsForAllThePlayersFromMatches(null, untilDate, function (err, pointsOfAllPlayers) {

        var avg = salaryCalculator.calculatePointsAverage(pointsOfAllPlayers);

        // get all matches and get all players actions
        db.getAllMatches(function (err, matches) {

            matches.sort(function (m1, m2) {
                return new Date(m2.startDate) - new Date(m1.startDate);
            });

            db.getPlayersActions(null, function (err, playersActions) {

                for (var i = 0; i < playersActions.length; i++) {
                    var playerAction = playersActions[i];

                    if (!playerAction.matchStartDate) continue;

                    // for each player, get the last 5 matches played and calculate salary
                    for (var p = 0; p < playerAction.players.length; p++) {
                        var player = playerAction.players[p];
                        var lastMatchesPoints = [];

                        for (var m = 0; m < matches.length; m++) {
                            var match = matches[m];

                            if (match.matchId === playerAction.matchId || playerAction.matchStartDate <= match.startDate) continue;

                            var matchPlayer = getPlayerFromMatch(match, player.playerId);

                            if (!matchPlayer) continue;

                            if (matchPlayer.points) {
                                lastMatchesPoints.push(matchPlayer.points);
                            }

                            if (lastMatchesPoints.length === 5) break;
                        }

                        const before = player.salary;
                        salaryCalculator.calculateSalaryForPlayer(player, lastMatchesPoints, avg);
                        console.log('match: ' + playerAction.matchId + ' - player ' + player.playerId + ' | before: ' + before + ' || after: ' + player.salary);
                    }

                    db.updatePlayerAction(playerAction);
                }

            })

        });

    });
}