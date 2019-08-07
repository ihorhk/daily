var mongodb = require('mongodb');
var Db = require('mongodb').Db;
var Server = require('mongodb').Server;
var logger =  require('../util/logger.js');
var redis = require('redis');
var scheduler = require('node-schedule');
var dbManager = require('./dbManager');
var constants = require('../util/constants');


var Database = function () {
};


Database.initDB = function (callback) {
    logger.info('Connecting with mongoDB database ' + constants.DB_NAME);

    Database.db = new Db(constants.DB_NAME, new Server(constants.DB_HOST, constants.DB_PORT, {}, {}), { safe: false, auto_reconnect: true });

    Database.db.open(function (err, database) {
        if (err) {
            logger.error('Darnit! Failed to connect to the mongoDB server!! What in the world is going on here?!? ERR: ' + err);

            if (callback) {
                callback(database, err);
            }
            return;
        }
        else {
            logger.info('Connection to mongoDB established succesfully. Proceeding to authentication.')
        }

        Database.db.authenticate(constants.DB_USER, constants.DB_PWD, function (err, result) {
            if (err) {
                logger.error('Failed to authenticate MongoDB! ' + err);
            }
	        else {
                logger.info('Authentication successful. Connected&Authenticated with MongoDB');
            }

            if (callback) {
                callback(database, err);
            }

            // schedule db backup once every 12 hours
            scheduler.scheduleJob('0 */6 * * *', function () {
                dbManager.backupDatabase();
            })
        });

        Database.cache = redis.createClient();
    });
};


Database.disconnect = function () {
    if (Database.db) {
        Database.db.close();
    }
};


Database.bsonIdFromString = function (id) {
    var BSON = mongodb.BSONPure;
    return new BSON.ObjectID(id);
};


Database.Collections = {
    Matches : 'matches',
    Competitions : 'competitions',
    PlayersActions : 'player_actions',
    Users : 'users',
    Slates : 'slates',
    Tournaments : 'tournaments',
    Transactions : 'transactions',
    TransactionsRequests : 'transactions_requests',
    BalanceUpdates : 'balance_updates',
    TermsAndConditions : 'terms_and_conditions',
    GameRules : 'game_rules',
    Sessions : 'sessions',

    OldMatches : 'old_matches',
    OldPlayersActions : 'old_players_actions',
    OldSlates : 'old_slates',
    OldTournaments : 'old_tournaments',
    OldCompetitionMatches : 'old_competition_matches'
};


module.exports = Database;
