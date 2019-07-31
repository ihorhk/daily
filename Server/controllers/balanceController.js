// manages the cash flow of the users
const db = require('../db/dbManager');
const constants = require('../util/constants');
const socket = require('../net/socket');
const helper = require('../util/helper');
const Tournament = require('../models/Tournament');
const BalanceUpdate = require('../models/enums/BalanceUpdate').BalanceUpdate;
const emailer = require('../util/emailer');


// adds the prize of every user at his balance; also sets the payouts for every entry in the tournament in db
function assignPayoutsForTournament (tournament) {
    if (!tournament.entries) return;

    var usersBatch = db.initUnorderedBulkOperation(db.Collections.Users);
    var balanceUpdatesBatch = db.initUnorderedBulkOperation(db.Collections.BalanceUpdates);

    var updatedEntries = [];

    for (var i = 0; i < tournament.entries.length; i++) {
        var entry = tournament.entries[i];

        if (entry.prize > 0) {
            updatedEntries.push(entry.username);

            db.batchUpdateUserBalance(entry.username, entry.prize, usersBatch, tournament.playMode);
            db.batchInsertBalanceUpdate(entry.username, entry.prize, BalanceUpdate.TOURNAMENT_WINNING, tournament, null, tournament.playMode, balanceUpdatesBatch);
        }
    }

    db.executeBulk(balanceUpdatesBatch, function (err) {
        if (err) {
            logger.error('Failed to batch update balances while assigning tournament payouts: ' +err);
        }
    });
    db.executeBulk(usersBatch, function (err) {
        if (err) {
            emailer.sendErrorEmail('Failed to execute batch to update users balance for tournament ' + tournament._id, err + ' ||| entries: ' + updatedEntries);
            logger.emerg('Failed to execute batch to update users balance for tournament ' + tournament._id + ': ' + err);
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

    }.bind(updatedEntries));
}


function updateBalanceForNewTournamentEntry (username, tournament) {
    var amount = -parseFloat(tournament.entryFee);

    updateBalanceAndNotify(username, amount, BalanceUpdate.TOURNAMENT_REGISTRATION, tournament);
    db.insertBalanceUpdate(username, amount, BalanceUpdate.TOURNAMENT_REGISTRATION, tournament, null, tournament.playMode);
}


function updateBalanceForRemovedTournamentEntry (username, tournament) {
    var amount = parseFloat(tournament.entryFee);

    updateBalanceAndNotify(username, amount, BalanceUpdate.TOURNAMENT_REGISTRATION_CANCELLED, tournament);
    db.insertBalanceUpdate(username, amount, BalanceUpdate.TOURNAMENT_REGISTRATION_CANCELLED, tournament, null, tournament.playMode);
}


function updateBalanceAndNotify (username, amount, reason, tournament) {

    db.updateUserBalance(username, amount, reason, function (err, user) {

        if (!err) {
            if (Tournament.isTournamentFreePlayMode(tournament)) {
                socket.freeMoneyBalanceUpdate(user.username, user.freeMoneyBalance)
            }
            else {
                socket.balanceUpdate(user.username, user.balance)
            }
        }
    }, tournament.playMode);
}


// function testAddMoneyToUser (user) {
//     if (constants.TEST_VERSION) {
//         updateBalanceAndNotify(user.username, 1000, { playMode : require('../models/enums/PlayMode').PlayMode.REAL });
//     }
// }


exports.assignPayoutsForTournament = assignPayoutsForTournament;
exports.updateBalanceForNewTournamentEntry = updateBalanceForNewTournamentEntry;
exports.updateBalanceForRemovedTournamentEntry = updateBalanceForRemovedTournamentEntry;
// exports.testAddMoneyToUser = testAddMoneyToUser;