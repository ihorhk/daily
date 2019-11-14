var db = require('../db/dbManager.js');
var passport = require('passport');
var validator = require('validator');
var models = require('../models/index.js');
var crypt = require('../util/crypt');
var logger = require('../util/logger.js');
var constants = require('../util/constants.js');
var routes = require('../net/routes.js');
var helper = require('../util/helper');
var emailer = require('../util/emailer');
var countries = require('country-data').countries;

var VERIFICATION_VIEW_NAME = 'emailVerification';


function handleRegistrationSubmission (req, res) {
    // check username validity (username is case insensitive)
    var username = req.body.username;

    if (!username || username.length < 4) {
        handleRegistrationError(res,  'The chosen username is too short. The minimum length is 4 characters.');
        return;
    }

    if (username.length > 20) {
        handleRegistrationError(res,  'The chosen username is too long. The maximum length is 20 characters.');
        return;
    }

    if (!/^[0-9a-zA-Z]+[_-]?/.test(username) || username.indexOf(' ') >= 0) {
        handleRegistrationError(res,  'The chosen username is invalid. It can contain only latin letters and numbers followed by - or _');
        return;
    }

    // check password validity
    var password = req.body.password;
    var errorMsg = helper.checkPasswordValidity(password);
    if (errorMsg) {
        handleRegistrationError(res, errorMsg);
        return;
    }

    // check first/last name
    var firstName = req.body.firstName;
    var lastName = req.body.lastName;

    if (!firstName || !helper.isLatinString(firstName)) {
        handleRegistrationError(res,  'Please enter a valid first name');
        return;
    }
    if (!lastName || !helper.isLatinString(lastName)) {
        handleRegistrationError(res,  'Please enter a valid last name');
        return;
    }

    // check date validity
    var birthDate = new Date(req.body.birthDate);
    var birthDay = birthDate.getDate();
    var birthMonth = birthDate.getMonth();
    var birthYear = birthDate.getFullYear();
    var currentYear = new Date().getFullYear();

    if (!birthDay || (!birthMonth && birthMonth !== 0) || !birthYear || birthDay < 1 || birthDay > 31 || birthMonth < 0 || birthMonth > 11
        || birthYear < 1880 || birthYear > currentYear) {
        handleRegistrationError(res, 'Please enter a valid birth date.');
        return;
    }

    birthYear = parseInt(birthYear);

    birthDate = new Date(birthYear + 18, birthMonth, birthDay);
    birthDate.setHours(birthDate.getHours() - (birthDate.getTimezoneOffset() / 60));

    if (birthDate.getTime() > Date.now()) {
        handleRegistrationError(res, 'Sorry, you must be at least 18 years old to register to Daily Champion.');
        return;
    }

    birthDate.setFullYear(birthYear);

    // check email validity
    var email = req.body.email;
    if (!validator.isEmail(email)) {
        handleRegistrationError(res, 'Please enter a valid e-mail.');
        return;
    }

    // check country, city, street, zipCode
    var country = req.body.country;
    var city = req.body.city;
    var zipCode = req.body.zipCode;
    var street = req.body.street;
    var streetNum = req.body.streetNum;
    if (!country || !city || !zipCode || !street || !streetNum) {
        handleRegistrationError(res, 'Please enter your residence address, including country, city, zip code and street.');
        return;
    }

    if (!isValidCountryISO(country)) {
        handleRegistrationError(res, 'Please provide a valid 3-letters ISO code for the country of residence.');
        return;
    }

    if (!helper.isLatinString(country)) {
        handleRegistrationError(res, 'Please enter a valid country of residence');
        return;
    }
    if (zipCode.length < 3 || !helper.isLatinString(city) || !helper.isLatinString(zipCode)) {
        handleRegistrationError(res, 'Please enter a valid city and zip code');
        return;
    }

    var user = new models.user.User(username, password, email, firstName, lastName, birthDate, country, city, zipCode, street, streetNum);
    user.registrationDate = new Date();
    user.currency = models.Currency.EURO; //TODO hardcoded for now, but we may support different currencies in the future
    user.freeMoneyBalance = models.user.FREE_MONEY_START_BALANCE;
    user.tcVersion = helper.getTermsAndConditions().version;
    user.gameRulesVersion = helper.getGameRules().version;
    user.monthlySpending = 0;
    user.settings = {};

    db.isValidNewUser(user, function (err, collidingUser) {
        if (err) {
            handleRegistrationError(res,  'An error has been encountered while trying to process your request.');
            return;
        }

        if (!collidingUser) {
            generateAccountVerificationData(user, function () {
                user.password = crypt.encryptPassword(user.password);

                db.insertOrUpdateUser(user, function (err) {
                    if (err) {
                        handleRegistrationError(res,  'A strange error has been encountered while trying to process your request.');
                        return;
                    }

                    completeUserCreation(user, req, res)
                });
            });
        }
        // check what field is wrong, and return message to client
        else {
            if (username.toLowerCase() === collidingUser.username.toLowerCase()) {
                res.status(202).send('The username ' + username + ' is already taken. Choose another one and try again.');
            }
            else if (email === collidingUser.email) {
                res.status(202).send('The e-mail ' + email + ' is already in use.');
            }
            else {
                res.status(501).send();
            }
        }
    }.bind(user));
}


function generateAccountVerificationData (user, callback) {
    helper.generateToken( function(registrationToken) {
        var expirationDate = Date.now() + (constants.REGISTRATION_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

        user.registrationToken = registrationToken;
        user.registrationTokenExpiration = expirationDate;
        user.isEmailValidated = false;

        callback();
    });
}


function handleRegistrationError(res, msg) {
    res.status(501).send(msg);
}


function completeUserCreation (user, req, res) {
    passport.authenticate('local')(req, res, function () {
        res.status(200).send();
    });

    sendVerificationEmail(user, req);
}


function sendVerificationEmail (user, req) {
    var url = 'https://' + req.get('host') + '/verify?id=' + user.registrationToken;

    emailer.sendEmail(
        user.email,
        'Confirm your DailyChampion account registration',
        'Hi ' + user.username + ', <br><br> Please click on the link below to verify your DailyChampion account registration.' +
        '<br>If you didn\'t request any account registration, simply ignore this e-mail - the registration will automatically expire.' +
        '<br><br><a href=' + url + '>Click here to verify</a>'
    );
}


function verifyRegistration (req, res) {
    var id = req.query.id;

    if (!id) {
        handleVerificationError(res, 'Your verification request is invalid. Please fill in a new registration form or contact the support.');
        return;
    }

    db.findUserWithRegistrationToken(id, function (err, user) {
        if (err) {
            handleVerificationError(res, 'Something went wrong while processing your account verification. Please try again.');
            return;
        }

        if (user) {
            if (user.isEmailValidated) { // user already validated
                res.redirect(routes.HOME);
            }
            else if (user.registrationTokenExpiration < Date.now()) { // token expired
                handleVerificationError(res, 'Your registration request has expired. Please fill in a new registration.');
            }
            else { // validate user and update in db
                user.isEmailValidated = true;
                db.insertOrUpdateUser(user, function (err, user) {
                    if (err) {
                        handleVerificationError(res, 'Something went wrong while processing your account verification. Please try again.');
                    }
                    else {
                        res.render(VERIFICATION_VIEW_NAME, { success : true, title : "Account Verified" })
                    }
                });
            }
        }
        else {
            // no user found with the given token
            handleVerificationError(res, 'Your verification request is invalid. Please fill in a new registration or contact the support.');
        }
    });
}


function handleVerificationError(res, msg) {
    res.render(VERIFICATION_VIEW_NAME, { error : msg });
}


function isValidCountryISO (code) {
    var isValid = false;

    Object.keys(countries).forEach(function (key) {
        if (countries[key].alpha3 === code) {
            isValid = true;
        }
    });

    return isValid;
}


function handleNewAccountVerificationEmailRequest (req, res) {
    if (!req.user) {
        res.status(401).send();
        return;
    }

    if (req.user.isEmailValidated === true) {
        res.status(202).send('Your account is already verified.');
        return;
    }

    generateAccountVerificationData(req.user, function () {
        db.insertOrUpdateUser(req.user, function (err) {
            if (err) {
                res.status(501).send(err);
            }
            else {
                sendVerificationEmail(req.user, req);
                res.status(200).send(req.user.email);
            }
        });
    });
}


exports.handleRegistrationSubmission = handleRegistrationSubmission;
exports.handleNewAccountVerificationEmailRequest = handleNewAccountVerificationEmailRequest;
exports.verifyRegistration = verifyRegistration;
