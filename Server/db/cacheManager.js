var database = require('./Database.js');

var CHAT_LIST = 'chat';


function insertChatMessage (message, tournamentId) {
    //TODO insert every second or so
    database.cache.lpush(CHAT_LIST + ':' + tournamentId, JSON.stringify(message));
    database.cache.ltrim(CHAT_LIST + ':' + tournamentId, 0, 100);
}


function getChatMessages (tournamentId, callback) {
    database.cache.lrange(CHAT_LIST + ':' + tournamentId, 0, -1, function (err, res) {
        if (err) {
            logger.error('Error while getting chat messages for tour ' + tournamentId + ': ' + err);
        }
        callback (err, res);
    });
}


exports.insertChatMessage = insertChatMessage;
exports.getChatMessages = getChatMessages;