var constants = require('./constants.js');
var models = require('../models/index.js');
var nodemailer = require('nodemailer');
var logger = require('./logger');
var fs = require('fs');


if (fs.existsSync('./util/secretConstants.js')) {
    const secretConstants = require('./secretConstants');
    var email = constants.NOREPLY_EMAIL;
    var pwd = secretConstants.EMAIL_PASS;
    var host = 'smtp.zoho.eu';
}
else {
    email = '';
    pwd = '';
    host = 'smtp.gmail.com';
}

var smtpTransport = nodemailer.createTransport("SMTP",
    {
        host: host,
        port: 465,
        secureConnection: true,
        auth: {
            user: email,
            pass: pwd
        }
    });


function sendEmail (to, subject, message, callback) {
    var mailOptions = {
        from: '"Champion League" <' + constants.NOREPLY_EMAIL + '>',
        to : to,
        subject : subject,
        html : message
    };

    smtpTransport.sendMail(mailOptions, function (err) {
        if (err) {
            logger.error('Failed to send email to ' + to + ': ' + err);
        }

        if (callback) {
            callback(err);
        }
    });
}


function sendErrorEmail (subject, message) {
    sendEmail(constants.ERROR_NOTIFICATION_EMAIL, subject, message);
}


function sendFraudEmail (subject, message) {
    sendEmail(constants.ERROR_NOTIFICATION_EMAIL, 'FRAUD: ' + subject, message);
}


exports.sendEmail = sendEmail;
exports.sendErrorEmail = sendErrorEmail;
exports.sendFraudEmail = sendFraudEmail;