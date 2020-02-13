var db = require('../db/dbManager');
var crypt = require('../util/crypt');
var helper = require('../util/helper');
var emailer = require('../util/emailer');
var moment = require('moment');
var crypto = require('crypto');
var paymentController = require('./paymentsController');
var scheduler = require('node-schedule');
var logger = require('../util/logger');
var models = require('../models/index');
var passport = require('passport');


function logIn (req, res, next) {
    passport.authenticate('local', function(err, user) {
        if (err) {
            return next(err);
        }

        if (!user) {
            return res.status(401).send();
        }

        req.logIn(user, function(err) {
            if (err) {
                return next(err);
            }

            // check if game rules have changed since last user log in. If so, send over the updates and change user's game rules version
            if (helper.getGameRules().version === user.gameRulesVersion) {
                res.status(200).send();
                return;
            }

            // send over game rules updates
            var gameRulesUpdates = [];

            db.getGameRulesUpdates(user.gameRulesVersion, function (err, newGameRules) {
                if (err) {
                    res.status(501).send(err);
                    return;
                }

                db.updateUserFields(user.username, db.USER_UPDATE_FIELDS.GAME_RULES_VERSION, newGameRules.version, function (err) {
                    if (err) {
                        res.status(501).send(err);
                        return;
                    }
                    for (var i = 0; i < newGameRules.length; i++) {
                        var gameRule = newGameRules[i];
                        gameRulesUpdates.push({ date : gameRule.date, version : gameRule.version, message : gameRule.message});
                    }

                    res.status(200).send(gameRulesUpdates);

                });
            });
        });
    })(req, res, next);
}


function getUserDetails (req, res) {
    if (!req.user) {
        res.status(401).send();
        return;
    }

    var resObj = {
        firstName : req.user.firstName,
        lastName : req.user.lastName,
        balance : req.user.balance,
        freeMoneyBalance : req.user.freeMoneyBalance,
        username : req.user.username,
        birthDate : req.user.birthDate,
        email : req.user.email,
        country : req.user.country,
        city : req.user.city,
        zipCode : req.user.zipCode,
        street : req.user.street,
        streetNum : req.user.streetNum,
        registrationDate : req.user.registrationDate,
        previousLogin : req.user.previousLogin,
        playMode : req.user.playMode,
        settings : req.user.settings || {}
    };

    res.status(200).send(resObj);
}


function handlePasswordResetRequest (req, res) {
    // check that a user with the given email or username exists
    var emailOrUsername = req.body.emailOrUsername;

    if (!emailOrUsername) {
        res.status(400).send('Enter the username or the e-mail of your Daily Champion account');
        return;
    }

    db.getUser(emailOrUsername, function (err, user) {
        if (err) {
            res.status(501).send(err);
            return;
        }

        if (!user) {
            res.status(404).send('Sorry, we haven\'t found any matching account');
            return;
        }

        // user found! generate token and send e-mail with link to reset password
        helper.generateToken(function(token) {

            var tokenExpireDate = moment().add(2, 'd').toDate();
            var url = 'https://' + req.get('host') + '/resetPassword?token=' + token;

            db.setUserPasswordResetData(user.username, token, tokenExpireDate);

            emailer.sendEmail(
                user.email,
                'Password Reset',
                'Hi ' + user.username + ', <br><br>To reset the password of your Daily Champion account, just click on the ' +
                '<br>If you didn\'t request any password reset, simply ignore this e-mail and your password will safely remain the same.' +
                '<br><br><a href=' + url + ' style="padding:8px; margin-top: 20px; color:#FFFFFF; font-weight:bold; font-size: 150%; text-decoration:none; ' +
                'background-color: #0C9548; border-radius: 5px;">RESET PASSWORD</a>',
                function (err) {
                    if (err) {
                        res.status(501).send(err);
                    }
                    else {
                        res.status(200).send();
                    }
                }
            );
        });
    });
}


function handlePasswordResetForm (req, res) {
    var token = req.query.token;

    if (!token) {
        res.status(404).render('error', { error : { status : 404, message : 'Not found' }});
        return;
    }

    if (req.user) {
        res.render('resetPassword', { title : "Password Reset" });
    }
    else {
        db.findUserWithPasswordResetToken(token, function (err, user) {
            if (err) {
                res.status(501).render('error', { error : { status : 501, message : 'Server error' }});
                return;
            }

            if (!user) {
                res.status(404).render('error', { error : { status : 404, message : 'Not found' }});
                return;
            }

            res.render('resetPassword', { title : "Password Reset" });
        })
    }
}


// to reset the password are necessary either the password reset token through which a user can be retrieved, or the user itself (if logged in)
function resetPassword (req, res) {
    var password = req.body.password;
    var token = req.body.passwordResetToken;

    if (!password || (!req.user && (!token || token.length === 0))) {
        res.status(400).send('The request is not valid');
        return;
    }

    // check that the password is valid
    var errorMsg = helper.checkPasswordValidity(password);
    if (errorMsg) {
        res.status(400).send(errorMsg);
        return;
    }

    const updateUserPasswordFn = function (user) {
        // update password in db and delete password reset token
        var username = user.username;
        var password = crypt.encryptPassword(req.body.password);

        db.updateUserFields(username,
            [ db.USER_UPDATE_FIELDS.PASSWORD_RESET_TOKEN, db.USER_UPDATE_FIELDS.PASSWORD ],
            [ '', password ],
            function (err) {
                if (err) {
                    res.status(501).send('Something went wrong. Please try again');
                    return;
                }

                res.status(200).send();

                emailer.sendEmail(
                    user.email,
                    'Password changed successfully',
                    'Hi ' + user.username + ', <br><br>You password change is complete. <br><br>Good luck!'
                );
            });
    };

    if (req.user) {
        updateUserPasswordFn(req.user);
        return;
    }

    // find the user and check that his token is still valid
    db.findUserWithPasswordResetToken(token, function (err, user) {
        if (err) {
            res.status(501).send('Something went wrong. Please try again');
            return;
        }

        if (!user) {
            res.status(404).send('The request is not valid');
            return;
        }

        if (moment().isAfter(moment(user.passwordResetExpirationDate))) {
            res.status(202).send('The password reset request has expired, please request a new one');
            return;
        }

        updateUserPasswordFn(user);
    });
}


function getTransactionsHistory (req, res) {
    if (!req.user) {
        res.status(401).send();
        return;
    }

    var transactions = [];
    var statusKeys = Object.keys(paymentController.PaymentStatus);
    for (var i = 0; i < 50; i++) {
        var obj = {
            transactionId : Math.random().toString(36).substr(2),
            username : req.user.username,
            status : paymentController.PaymentStatus[statusKeys[i % 5]],
            pspID : Math.round(Math.random() * 100000000),
            currency : '978',
            amount : Math.random() * 1000,
            email : req.user.email,
            transactionType : (i % 2 === 0 ? 1 : 13),
            paymentMethod : paymentController.PAYMENT_METHODS_NAMES[i % paymentController.PAYMENT_METHODS_NAMES.length].code,
            time : new Date(Date.now() - Math.round((Math.random() * 5184000000)))
        };

        transactions.push(obj);
    }
    res.status(200).send(transactions);

}


function setPlayMode (req, res) {
    if (!req.user) {
        res.status(401).send();
        return;
    }

    if (!req.body.playMode) {
        res.status(400).send();
        return;
    }

    var playMode = req.body.playMode;
    db.updateUserFields(req.user.username, db.USER_UPDATE_FIELDS.PLAY_MODE, playMode, function (err) {
        if (err) {
            res.status(501).send(err);
        }
        else {
            res.status(200).send();
        }
    });
}


function getBalanceUpdates (req, res) {
    if (!req.user) {
        res.status(401).send();
        return;
    }

    db.getBalanceUpdates(req.user.username, function (err, balanceUpdates) {
        if (err) {
            res.status(501).send(err);
        }
        else {
            res.status(200).send(balanceUpdates);
        }
    });
}


function updateUser (req, res) {
    //TODO
}


function updateUserAdmin (req, res) {
    if (!req.user || !req.user.isAdmin()) {
        res.status(401).send();
        return;
    }

    if (!req.body.username) {
        res.status(400).send('Username is missing');
        return;
    }

    db.hasUser(req.body.username, function (err, hasUser) {
        if (err) {
            res.status(501).send(err);
            return;
        }
        if (!hasUser) {
            res.status(404).send('User not found');
            return;
        }

        var fields = [];
        var values = [];

        var isLocked = helper.parseBoolean(req.body.isLocked);
        var isIdVerified = helper.parseBoolean(req.body.isIdVerified);
        if (isLocked !== undefined) {
            fields.push(db.USER_UPDATE_FIELDS.IS_LOCKED);
            values.push(isLocked);
        }
        if (isIdVerified !== undefined) {
            fields.push(db.USER_UPDATE_FIELDS.IS_ID_VERIFIED);
            values.push(isIdVerified);
        }

        if (fields.length === 0) {
            res.status(200).send();
            return;
        }

        db.updateUserFields(req.body.username, fields, values, function (err) {
            if (err) {
                res.status(501).send(err);
            }
            else {
                res.status(200).send();
            }
        });
    })
}


function updateSettings (req, res) {
    if (!req.user) {
        res.status(401).send();
        return;
    }

    var settings = req.body;

    if (!settings) {
        res.status(400).send('Request not valid: user settings are missing');
        return;
    }

    if (settings.allowRealMoney) {
        settings.allowRealMoney = (settings.allowRealMoney === true || settings.allowRealMoney === 'true');
    }
    if (settings.maxEntryFee) {
        settings.maxEntryFee = parseFloat(settings.maxEntryFee);
        if (isNaN(settings.maxEntryFee) || settings.maxEntryFee < 0) {
            res.status(400).send('Request not valid: max entry fee can\'t be lower than 0');
            return;
        }
    }
    if (settings.monthlySpendingCap) {
        settings.monthlySpendingCap = parseFloat(settings.monthlySpendingCap);
        if (isNaN(settings.monthlySpendingCap) || settings.monthlySpendingCap < 0) {
            res.status(400).send('Request not valid: monthly spending cap can\'t be lower than 0');
            return;
        }
    }

    // if responsible gaming settings have changed, update the field that keeps track of the time of change
    var oldSettings = req.user.settings;
    if (settings.allowRealMoney !== oldSettings.allowRealMoney || settings.maxEntryFee !== oldSettings.maxEntryFee
        || settings.monthlySpendingCap !== oldSettings.monthlySpendingCap) {

        req.user.responsibleGamingChangedDate = new Date();
    }

    db.updateUserFields(req.user.username,
        [ db.USER_UPDATE_FIELDS.SETTINGS, db.USER_UPDATE_FIELDS.RESPONSIBLE_GAMING_CHANGED_DATE ],
        [ settings, req.user.responsibleGamingChangedDate ], function (err) {

        if (err) {
            res.status(501).send(err);
        }
        else {
            req.user.settings = settings;
            res.status(200).send();
        }
    });
}


function scheduleMonthlySpendingReset () {
    scheduler.scheduleJob('0 0 1 * *', function () {
        logger.info('Resetting users monthly spendings');

        db.resetUsersMonthlySpending();
    })
}


function getUsersAdminData (req, res) {
    if (!req.user || !req.user.isAdmin()) {
        res.status(401).send();
        return;
    }

    const tournamentRequiredFields = {
        entryFee : 1,
        'entries.username' : 1,
        'entries.prize' : 1,
    };

    const transactionRequiredFields = {
        amount : 1,
        username : 1,
        transactionType : 1
    };

    db.getUsers(null, null, function (err, users) {
        if (err) {
            res.status(501).send(err);
            return;
        }

        db.getAllTournamentsHistory(function (err, tournaments) {
            if (err) {
                res.status(501).send(err);
                return;
            }

            db.getAllTransactions(function (err, transactions) {
                if (err) {
                    res.status(501).send(err);
                    return;
                }

                var usersByUsername = {};
                for (var i = 0; i < users.length; i++) {
                    var user = users[i];
                    usersByUsername[user.username] = user;
                    user.entriesByContest = {};
                    user.totalContests = 0;
                    user.totalEntries = 0;
                    user.totalBet = 0;
                    user.totalWon = 0;
                    user.totalWithdrawals = 0;
                    user.totalDeposits = 0;
                }

                for (i = 0; i < tournaments.length; i++) {
                    var tournament = tournaments[i];

                    if (!tournament.entries) continue;

                    for (var j = 0; j < tournament.entries.length; j++) {
                        var entry = tournament.entries[j];
                        user = usersByUsername[entry.username];

                        user.totalEntries++;
                        user.totalBet += tournament.entryFee;
                        if (entry.prize) {
                            user.totalWon += entry.prize;
                        }

                        var contestForUser = user.entriesByContest[tournament._id];
                        if (contestForUser) {
                            contestForUser++;
                        }
                        else {
                            user.entriesByContest[tournament._id] = 1;
                        }
                    }
                }

                for (i = 0; i < transactions.length; i++) {
                    var transaction = transactions[i];
                    user = usersByUsername[transaction.username];

                    if (transaction.transactionType === models.TransactionType.DEPOSIT) {
                        user.totalDeposits += transaction.amount;
                    }
                    else if (transaction.transactionType === models.TransactionType.WITHDRAWAL) {
                        user.totalWithdrawals += transaction.amount;
                    }
                }

                users = [];

                // normalize users and count contests
                Object.keys(usersByUsername).forEach(function (username) {
                    user = usersByUsername[username];
                    user.totalContests = Object.keys(user.entriesByContest).length;
                    users.push(user);
                });

                res.status(200).send(users);

            }, transactionRequiredFields);

        }, tournamentRequiredFields);
    })
}


exports.getUserDetails = getUserDetails;
exports.handlePasswordResetRequest = handlePasswordResetRequest;
exports.handlePasswordResetForm = handlePasswordResetForm;
exports.resetPassword = resetPassword;
exports.getTransactionsHistory = getTransactionsHistory;
exports.setPlayMode = setPlayMode;
exports.getBalanceUpdates = getBalanceUpdates;
exports.updateSettings = updateSettings;
exports.updateUser = updateUser;
exports.updateUserAdmin = updateUserAdmin;
exports.scheduleMonthlySpendingReset = scheduleMonthlySpendingReset;
exports.logIn = logIn;
exports.getUsersAdminData = getUsersAdminData;