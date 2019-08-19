var helper = require('../util/helper');
var emailer = require('../util/emailer');
var db = require('../db/dbManager');
var logger = require('../util/logger');
var moment = require('moment');
var models = require('../models/index');
var routes = require('../net/routes');
var constants = require('../util/constants');


function notifyUserForTournamentsWithNonPlayingPlayers (username, tournaments, inactivePlayers) {
    db.getUser(username, function (err, user) {
        if (err) {
            logger.error('Failed to notify non-playing players to user: ' + err);
            return;
        }

        var tournamentString = (tournaments.length === 1 ? '1 contest' : tournaments.length + ' contests');

        var msg = 'Hi ' + username + ',<br><br>You have entered ' + tournamentString + ' using players that ' +
            'are not in the final formations of the matches. We recommend removing those players from the lineup and choosing active ones.<br>';

        for (var i = 0; i < tournaments.length; i++) {
            var tournament = tournaments[i];
            var tournamentPlayers = models.tournament.createPlayersDocFromTournamentPlayersString(tournament.players);
            var inactivePlayersIds = inactivePlayers[tournament._id];

            if (!inactivePlayersIds) {
                logger.error('Inactive players ids is undefined: inactivePlayers: ' + JSON.stringify(inactivePlayers) + '  ||   tournaments: ' + JSON.stringify(tournaments));
                continue;
            }

            var string = tournament.name + ': ';

            for (var p = 0; p < inactivePlayersIds.length; p++) {
                var player = tournamentPlayers[inactivePlayersIds[p]];
                string += player.name;

                if (p !== inactivePlayersIds.length - 1) {
                    string += ',';
                }
            }

            msg += string + '<br>';
        }

        emailer.sendEmail(user.email,
                        'Inactive players in your lineups',
                        msg);
    });
}


exports.notifyUserForTournamentsWithNonPlayingPlayers = notifyUserForTournamentsWithNonPlayingPlayers;