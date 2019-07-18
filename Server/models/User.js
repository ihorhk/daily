var crypt = require('../util/crypt.js');
var PlayMode = require('./enums/PlayMode').PlayMode;

const FREE_MONEY_START_BALANCE = 10000;
const REPONSIBLE_GAMING_CHANGE_MINIMUM_DAYS = 7;


var User = function (username,
                     pass,
                     email,
                     firstName,
                     lastName,
                     birthDate,
                     country,
                     city,
                     zipCode,
                     street,
                     streetNum,
                     registrationDate,
                     registrationToken,
                     registrationTokenExpiration,
                     passwordResetToken,
                     passwordResetExpirationDate,
                     isEmailValidated,
                     balance,
                     currency,
                     freeMoneyBalance,
                     playMode,
                     role,
                     tcVersion,
                     gameRulesVersion,
                     monthlySpending,
                     settings,
                     responsibleGamingChangedDate,
                     isLocked,
                     isIdVerified) {

    this.username = username;
    this.password = pass;
    this.email = email;
    this.firstName = firstName;
    this.lastName = lastName;
    this.birthDate = birthDate;
    this.country = country;
    this.city = city;
    this.zipCode = zipCode;
    this.street = street;
    this.streetNum = streetNum;
    this.registrationDate = registrationDate;
    this.registrationToken = registrationToken;
    this.registrationTokenExpiration = registrationTokenExpiration;
    this.passwordResetToken = passwordResetToken;
    this.passwordResetExpirationDate = passwordResetExpirationDate;
    this.isEmailValidated = isEmailValidated;
    this.balance = (balance ? balance : 0.0);
    this.currency = currency;
    this.freeMoneyBalance = freeMoneyBalance;
    this.playMode = (playMode ? playMode : PlayMode.REAL);
    this.role = role;
    this.tcVersion = tcVersion; //terms and conditions
    this.gameRulesVersion = gameRulesVersion;
    this.monthlySpending = monthlySpending;
    this.settings = settings;
    this.responsibleGamingChangedDate = responsibleGamingChangedDate;
    this.isLocked = isLocked;
    this.isIdVerified = isIdVerified;
};


User.prototype.verifyPassword = function (password) {
    return crypt.checkPasswordValidity(password, this.password);
};


User.prototype.isAdmin = function () {
    return this.role === Role.ADMIN;
};


var Role = {
    ADMIN : 'admin',
    BOT : 'bot'
};


var Settings = {
    RESPONSIBLE_GAMING : {
        ALLOW_REAL_MONEY : 'allowRealMoney',
        MAX_ENTRY_FEE : 'maxEntryFee',
        MONTHLY_SPENDING_CAP : 'monthlySpendingCap'
    }
};


exports.User = User;
exports.Role = Role;
exports.Settings = Settings;
exports.FREE_MONEY_START_BALANCE = FREE_MONEY_START_BALANCE;
exports.REPONSIBLE_GAMING_CHANGE_MINIMUM_DAYS = REPONSIBLE_GAMING_CHANGE_MINIMUM_DAYS;