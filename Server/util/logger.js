var winston = require('winston');
var constants = require('./constants.js');
winston.emitErrs = true;

var logger = new winston.Logger({
    transports: [
        new winston.transports.File({
            name: 'info-log',
            level: (constants.GLOBAL_DEBUG) ? 'debug' : 'verbose',
            filename: constants.LOG_FILENAME,
            handleExceptions: true,
            json: true,
            maxsize: 5242880, //5MB
            maxFiles: 5,
            colorize: false
        }),
        new winston.transports.Console({
            level: 'silly',
            handleExceptions: true,
            json: false,
            colorize: true
        }),
        new winston.transports.File({
            name: 'error-log',
            level: 'error',
            filename: constants.ERROR_LOG_FILENAME,
            handleExceptions: true,
            json: false,
            maxsize: 5242880, //5MB
            maxFiles: 3,
            colorize: false
        }),
        new winston.transports.File({
            name: 'emerg-log',
            level: 'emerg',
            filename: constants.EMERG_LOG_FILENAME,
            handleExceptions: true,
            json: false,
            maxsize: 5242880, //5MB
            maxFiles: 3,
            colorize: false
        })
    ],
    levels : { emerg : 0, error: 1, warn: 2, info: 3, verbose: 4, debug: 5, silly: 6 },
    exitOnError: false
});

module.exports = logger;
module.exports.stream = {
    write: function(message, encoding){
        logger.info(message);
    }
};
