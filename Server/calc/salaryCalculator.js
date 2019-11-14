var db = require('../db/dbManager.js');
var moment = require('moment');
var logger = require('../util/logger.js');
var constants = require('../util/constants.js');
var helper = require('../util/helper.js');
var lock = require('../util/lock');


var AVERAGE_SALARY = 110000;
var BASE_SALARY = 90000;
var MINIMUM_SALARY = 60000;
var POINTS_AVERAGE_MEDIAN_POINT = 70;
var MATCH_WEIGHTS = [
    19/48,
    13/48,
    9/48,
    4/48,
    3/48
];


/**
 * The salary for every player in the slate is calculated based on the points scored in the previous matches, in proportion with
 * the average of points scored by all the players from the matches of the past 12 months.
 *
 * @param slate - the slate containing also all the teams and players
 * @param callback(slate) - the callback to which the calculation is notified
 * @param competitionsIds[optional] the ids of the competitions related to the slate
 */
function calculateSalaryForSlate (slate, callback, competitionsIds) {
    if (!competitionsIds) {
        competitionsIds = [];
        for (var i = 0; i < slate.competitions.length; i++) {
            competitionsIds.push(slate.competitions[i].competitionId);
        }
    }

    if (constants.GLOBAL_DEBUG) var debugTime = Date.now();
    var untilDate = moment().subtract(12, 'months').toDate();

    // get the average points for all the players of all the matches of all competitions
    db.getPointsStatsForAllThePlayersFromMatches(competitionsIds, untilDate, function (err, pointsOfAllPlayers) {
        if (err) {
            logger.error('Salary calculation failed! Couldnt get avg of points from DB: ' + err);
            return;
        }

        var avg = calculatePointsAverage(pointsOfAllPlayers); //TODO for more performance: cache this calculation
        for (var i = 0; i < slate.teams.length; i++) {
            var players = slate.teams[i].players;

            for (var j = 0; j < players.length; j++) {
                var player = players[j];
                calculateSalaryForPlayer(player, player.pointsOfLastPlayedMatches ? player.pointsOfLastPlayedMatches.split(',') : null, avg);
            }
        }

        if (constants.GLOBAL_DEBUG) logger.debug('Calculated salaries in ' + (Date.now() - debugTime));

        db.updateSlateTeams(slate, function (err) {

            if (err) {
                logger.error('Failed to update slate teams after salary calculation: ' + err);
            }

            if (callback) {
                callback(slate);
            }

        }, true);
    });
}


function calculateSalaryForPlayer (player, lastMatchesPoints, avg) {
    if (lastMatchesPoints && lastMatchesPoints.length > 0) {
        var playerPoints = calculatePointsForLastPlayedMatches(lastMatchesPoints, avg);

        player.salary = calculateSalaryUsingProportion(avg, playerPoints);
    }
    else {
        player.salary = BASE_SALARY;
    }
}


function calculateSalaryUsingProportion (avg, playerPoints) {
    // points_player : x($$$) = average_points : (average_salary - base_salary)
    var salary = Math.round((AVERAGE_SALARY - MINIMUM_SALARY) * playerPoints / avg + MINIMUM_SALARY);

    if (salary >= 100000) {
        salary = helper.roundNumber(salary + 1000, 10000);
    }
    else {
        salary = helper.roundNumber(salary + 500, 5000);
    }

    return Math.max(MINIMUM_SALARY, salary);
}


function calculatePointsForLastPlayedMatches (arr, avgPoints) {
    var points = 0;
    var weightsSum = 0;
    var matchesCount = 0;

    //var debugString = '';

    for (var i = 0; i < Math.min(arr.length, getNumberOfMatchesUsedForCalculations()); i++) {
        if (arr[i].length === 0) break;

        points += arr[i] * MATCH_WEIGHTS[i];
        weightsSum += MATCH_WEIGHTS[i];
        matchesCount++;
    }

    //logger.verbose(debugString);

    if (weightsSum < 0.99) {
        // in this case some weights have not been counted in. Then we need to apply the weights to the remaining portion of the calculation
        for (i = 0; i < MATCH_WEIGHTS.length; i++) {
            if (!arr[i] || arr[i].length === 0) break;

            points += arr[i] * (MATCH_WEIGHTS[i] * (1 - weightsSum) / weightsSum);
        }

        // if the player doesn't have enough matches in the history for the calculation, ease it out using the average points of all players
        var div = (arr.length > 1) ? 5 : 3;
        points -= (points - avgPoints) / div;
    }

    return points;
}


function calculatePointsAverage (pointsOfAllPlayers) {
    return pointsOfAllPlayers[Math.round(pointsOfAllPlayers.length / 100 * POINTS_AVERAGE_MEDIAN_POINT)];
}


function getNumberOfMatchesUsedForCalculations () {
    return MATCH_WEIGHTS.length;
}


function testCalculateSalary (competitionId) {
    db.getAllTeamsInCompetition(competitionId, false, false, function (err, teams) {

        var untilDate = moment().subtract(12, 'months').toDate();

        // get the average points for all the players of all the matches of all competitions
        db.getPointsStatsForAllThePlayersFromMatches(competitionId, untilDate, function (err, pointsOfAllPlayers) {
            if (err) {
                logger.error('Salary calculation failed! Couldnt get avg of points from DB: ' + err);
                return;
            }

            var avg = calculatePointsAverage(pointsOfAllPlayers); //TODO for more performance: cache this calculation

            logger.verbose('Average is ' + avg);

            // then calculate the points of every player in every team in the slate, by weighting the points of his last played matches

            //loop through teams and through every player of each team
            for (var i = 0; i < teams.length; i++) {
                var players = teams[i].players;

                for (var j = 0; j < players.length; j++) {
                    var player = players[j];

                    if (player.pointsOfLastPlayedMatches && player.pointsOfLastPlayedMatches.length > 0) {
                        var playerPoints = calculatePointsForLastPlayedMatches(player.pointsOfLastPlayedMatches, avg);
                        player.salary = calculateSalaryUsingProportion(avg, playerPoints);

                        logger.verbose('Player ' + player.playerId + ' || Last matches: ' + player.pointsOfLastPlayedMatches
                            + ' || Points: ' + Math.round(playerPoints) + ' - €' + player.salary + '\n');
                    }
                    else {
                        player.salary = BASE_SALARY;
                    }
                }
            }
        });

    });
}


exports.calculateSalaryForPlayer = calculateSalaryForPlayer;
exports.calculateSalaryForSlate = calculateSalaryForSlate;
exports.calculatePointsAverage = calculatePointsAverage;
exports.testCalculateSalary = testCalculateSalary;
exports.getNumberOfMatchesUsedForCalculations = getNumberOfMatchesUsedForCalculations;