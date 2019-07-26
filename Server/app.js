const express = require('express');
const fs = require('fs');
const https = require('https');
const path = require('path');
const favicon = require('serve-favicon');
const logger = require('./util/logger.js');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const passport = require('passport');
const flash = require('connect-flash');
const externalIp = require('external-ip')();
const LocalStrategy = require('passport-local').Strategy;
const constants = require('./util/constants.js');
const db = require('./db/dbManager.js');
const dbOrganizer = require('./db/dbOrganizer.js');
const tournamentsController = require('./controllers/tournamentsController.js');
const socket = require('./net/socket');
const helper = require('./util/helper');
const netRoutes = require('./net/routes');
const session = require('express-session');
const MongoStore = require('connect-mongo/es5')(session);
const database = require('./db/Database.js');
const userHandler = require('./controllers/userHandler');
const models = require('./models/index');

const app = express();

// check if we are running local
externalIp (function (err, ip) {
    if (err) {
        constants.IS_RUNNING_LOCAL = true;
        constants.SERVER_PORT = 8080;
    }
    else {
        constants.SERVER_IP = ip;
        constants.IS_RUNNING_LOCAL = (ip !== constants.PRODUCTION_SERVER_IP && ip !== constants.STAGING_SERVER_IP && ip !== constants.DEVELOPMENT_SERVER_IP);
        constants.SERVER_PORT = constants.IS_RUNNING_LOCAL ? 8080 : 443;
    }

    init();
});


function init () {
    constants.CWD = process.cwd();

    // init db connection
    require('./db/Database.js').initDB(function () {

        // save sessions through server restarts
        app.use(session( {
            secret : 'ohmygodthisissosecret',
            maxAge : 1296000000, // 2 weeks
            store : new MongoStore( {
                db : database.db,
                autoRemove : 'interval',
                autoRemoveInterval : 60 } ), // remove expired sessions after a while
            resave: false,
            saveUninitialized: false
        }));

        loadDailyChampionData();

        constants.CERTIFICATE = (constants.IS_RUNNING_LOCAL ? 'test/ssl/cert.pem' : '/etc/letsencrypt/live/dailychampion.com/fullchain.pem');
        constants.PRIVATE_KEY = (constants.IS_RUNNING_LOCAL ? 'test/ssl/key.pem' : '/etc/letsencrypt/live/dailychampion.com/privkey.pem');

        // setup server
        var httpsOptions = {
            key : fs.readFileSync(constants.PRIVATE_KEY),
            cert : fs.readFileSync(constants.CERTIFICATE)
        };

        var server = https.createServer(httpsOptions, app).listen(constants.SERVER_PORT);
        https.createServer(httpsOptions, app).listen(constants.API_SERVER_PORT);

        // setup io socket
        socket.initSocket(server);

        require('./controllers/feedManager').scheduleOldFeedsRemoval();

        // view engine setup
        app.set('views', path.join(__dirname, 'client/DailyChampion_webclient/views'));
        app.set('view engine', 'jade');

        app.use(morgan('dev'));
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: false }));
        app.use(cookieParser());
        app.use(flash());

        app.use(passport.initialize());
        app.use(passport.session());
        var clientDir = (constants.GLOBAL_DEBUG) ? 'client/DailyChampion_webclient/public' : '.clientBuild/public';
        app.use(express.static(path.join(__dirname, clientDir)));

        app.use(require('serve-favicon')(path.join(__dirname, clientDir, 'icongraphy', 'img', 'favicon.ico')));

        app.use(require('compression')({ level : 6 }));

        app.use('/', require('./net/index'));
        app.use('/api', require('./net/indexApi'));

        // passport config
        passport.use(new LocalStrategy(
            function(username, password, done) {
                db.getUser(username, function (err, user) {
                    if (err) {
                        return done(err);
                    }

                    if (!user) {
                        return done(null, false, { message : 'Login failed, wrong username or password' });
                    }

                    if (!user.verifyPassword(password)) {
                        return done(null, false, { message : 'Login failed, wrong username or password' });
                    }

                    return done(null, user);
                });
            }
        ));

        passport.serializeUser(function (user, done) {
            done(null, user.username);
        });

        passport.deserializeUser(function (username, done) {
            db.getUser(username, function (err, user) {
                if (err) {
                    done(err, null);
                }
                else {
                    done(null, user);
                }
            });
        });

        // catch 404 and forward to error handler
        app.use(function(req, res, next) {
            var err = new Error('Not Found');
            err.status = 404;
            next(err);
        });

        // error handlers

        // development error handler
        // will print stacktrace
        if (app.get('env') === 'development') {
            app.use(function(err, req, res, next) {
                res.status(err.status || 500);
                res.render(netRoutes.ERROR, {
                    message: err.message,
                    error: err
                });
            });
        }

        // production error handler
        // no stacktraces leaked to user
        app.use(function(err, req, res, next) {
            res.status(err.status || 500);
            res.render(netRoutes.ERROR, {
                message: err.message,
                error: {}
            });
        });

        // init server
        if (fs.existsSync('./util/secretConstants.js')) {
            constants.API_MASTER_KEY = require('./util/secretConstants').API_MASTER_KEY;
            logger.info('Server running on ' + constants.SERVER_PORT + '. Initializing FTP connection.');
            require('./net/ftpServer.js').setupFtpServer(helper.getDebugIp());
        }
        else {
            logger.info('FTP server not started, ./util/secretConstants.js not found.');
        }

        // init robin the bot
        if (constants.IS_CONTESTS_REGISTRATION_BOT_ENABLED) {
            require('./controllers/robinTheDailyChampionAddict').startRobinTheCrazyBot();
        }

        userHandler.scheduleMonthlySpendingReset();
    });
}


function loadDailyChampionData () {
    db.getCurrentSeasonId(function (err, res) {
        if (err || !res) {
            throw new Error('Failed to get current season id: ' + (err || 'Season id is NULL!'));
        }

        logger.info('Current season ID is ' + res);

        helper.setCurrentSeasonId(res);
        tournamentsController.initTournamentsController();
        dbOrganizer.scheduleOrganizer();
    });

    db.getTermsAndConditions(function (err, res) {
        if (err || !res) {
            throw new Error('Failed to get current terms and conditions: ' + (err || 'Terms and conditions not found!'));
        }

        logger.info('Terms and Conditions version is ' + res.version);

        helper.setTermsAndConditions(res);
    });

    db.getGameRules(function (err, gameRules) {
        if (err || !gameRules) {
            throw new Error('Failed to get current game rules: ' + (err || 'Game rules not found!'));
        }

        logger.info('Game Rules version is ' + gameRules.version);

        helper.setGameRules(gameRules);

        // setup actions
        for (var i = 0; i < gameRules.actions.length; i++) {
            var action = gameRules.actions[i];
            var obj = models.Action[action.key];
            obj.name = action.name;
            obj.definition = action.definition;
            obj.setValues(action.values[0], action.values[1], action.values[2], action.values[3])
        }
    });
}


module.exports = app;
