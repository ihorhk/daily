const db = require('../db/dbManager');
const TournamentTypes = require('../models/enums/TournamentType');
const TournamentFlags = require('../models/enums/TournamentFlags');
const helper = require('../util/helper');
const logger = require('../util/logger');
const Action = require('../models/enums/Action');


function getChatHistory (req, res) {
    var tournamentId = req.query.id;

    if (!tournamentId) {
        res.status(400).send('Error: no tournament id sent to server.');
        return;
    }

    db.getChatMessages(tournamentId, function (err, messages) {
        if (err) {
            res.status(501).send(err);
            return;
        }

        res.status(200).send(messages);
    });
}


function getTournamentCreationData (req, res) {
    if (!req.user || !req.user.role) {
        res.status(401).send();
        return;
    }

    db.getUpcomingCompetitionMatches(null, function (err, competitions) {
        if (err) {
            res.status(501).send(err);
            return;
        }

        res.status(200).send({
            competitions : competitions,
            tournamentTypes : TournamentTypes.getTournamentTypesStrings(),
            tournamentFlags : TournamentFlags.getTournamentFlagsToString()
        });
    });
}


function getTermsAndConditions (req, res) {
    res.status(200).send(helper.getTermsAndConditions());
}


function updateTermsAndConditions (req, res) {
    if (!req.user || !req.user.isAdmin()) {
        res.status(401).send();
        return;
    }

    if (!req.body.version || !req.body.content) {
        res.status(400).send();
        return;
    }

    // check that the version number is greater than the last terms and conditions
    db.getTermsAndConditions(function (err, oldTerms) {
        if (err) {
            res.status(501).send(err);
            return;
        }

        var newVersion = req.body.version;
        var newContent = req.body.content;

        if (oldTerms && parseFloat(newVersion) <= parseFloat(oldTerms.version)) {
            res.status(202).send('The version number must be greater than the one of the current version.');
            return;
        }

        db.insertTermsAndConditions(newVersion, newContent, function (err, insertedDoc) {
            if (err) {
                res.status(501).send(err);
            }
            else {
                res.status(200).send();
                helper.setTermsAndConditions(insertedDoc);

                logger.info('Updated terms and conditions version to ' + newVersion);
            }
        })
    });
}


function userHasAcceptedNewTermsAndConditions (req, res) {
    if (!req.user || !req.body.version) {
        res.status(400).send();
        return;
    }

    if (req.body.version != helper.getTermsAndConditions().version) {
        res.status(202).send('The version of the accepted Terms and Conditions is ' + req.body.version + ' but the latest is ' + helper.getTermsAndConditions().version);
        return;
    }

    db.updateUserFields(req.user.username, db.USER_UPDATE_FIELDS.TC_VERSION, req.body.version, function (err) {
        if (err) {
            res.status(501).send(err);
        }
        else {
            res.status(200).send();
        }
    })
}


function getGameRules (req, res) {
    var actionsOnly = req.query.actionsOnly && req.query.actionsOnly === 'true';
    res.status(200).send(actionsOnly ? helper.getGameRules().actions : helper.getGameRules());
}


function updateGameRules (req, res) {
    if (!req.user || !req.user.isAdmin()) {
        res.status(401).send();
        return;
    }

    if (!req.body.version || !req.body.content || !req.body.message || !req.body.actions) {
        res.status(400).send('Missing required params: version, content and message are all required');
        return;
    }

    var newVersion = req.body.version;
    var newContent = req.body.content;
    var newMessage = req.body.message;
    var newActions = JSON.parse(req.body.actions);

    // checks actions validity for points and definition
    for (var i = 0; i < newActions.length; i++) {
        var action = newActions[i];

        if (!action.definition || action.definition.length === 0) {
            res.status(400).send('Action definition is missing for ' + action.name);
            return;
        }

        for (var j = 0; j < action.values.length; j++) {
            var val = action.values[j];
            var parsedVal = parseInt(val);
            if (val.toString().length !== parsedVal.toString().length || isNaN(parsedVal)) {
                res.status(400).send('Actions points must be integer values: invalid value ' + val + ' for action ' + action.name);
                return;
            }
        }
    }

    if (parseFloat(newVersion) <= parseFloat(helper.getGameRules().version)) {
        res.status(202).send('The version number must be greater than the one of the current version.');
        return;
    }

    db.insertGameRules(newVersion, newContent, newActions, newMessage, function (err, insertedDoc) {
        if (err) {
            res.status(501).send(err);
        }
        else {
            res.status(200).send();
            helper.setGameRules(insertedDoc);
            db.clearAllSessions();

            logger.info('Updated Game Rules version to ' + newVersion);
        }
    });
}


exports.getChatHistory = getChatHistory;
exports.getTournamentCreationData = getTournamentCreationData;
exports.getTermsAndConditions = getTermsAndConditions;
exports.updateTermsAndConditions = updateTermsAndConditions;
exports.userHasAcceptedNewTermsAndConditions = userHasAcceptedNewTermsAndConditions;
exports.getGameRules = getGameRules;
exports.updateGameRules = updateGameRules;