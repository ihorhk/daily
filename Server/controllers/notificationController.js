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

            //TODO remove test
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

        // var table = '<table style="border-collapse: collapse;background-color: #f1f1f1;">';
        // var thStyle = 'border: 0; padding: 5px 10px; font-size: 90%; color: #ddd; text-align: center;';
        // var thead = '<thead>' +
        //     '<tr style="background: #0D763B;">' +
        //     '<th style="'+ thStyle + '; min-width: 350px;">Contest</th>' +
        //     '<th style="'+ thStyle + '; min-width: 120px;">Total Prizes</th>' +
        //     '<th style="'+ thStyle + '; min-width: 120px;">Start Time</th>' +
        //     '</tr></thead>';
        //
        // var tbody = '<tbody>';
        // var trStyle = 'border-bottom: 1px solid #DCDCDC;';
        // var tdStyle = 'border: 0; font-size: 95%; height: 35px; text-align: center; color: #333; padding: 3px 8px;';
        // var contestStyle = 'color: #333; font-weight: bold; text-decoration: underline;';
        //
        // for (var i = 0; i < tournaments.length; i++) {
        //     var tournament = tournaments[i];
        //
        //     var link = 'https://' + constants.WEBSITE_URL + routes.MY_TOURNAMENTS + '?contest=' + tournament._id + '&type=upcoming';
        //
        //     tbody += '<tr style="' + trStyle + '">';
        //     tbody += '<td style="' + tdStyle + '"><a style="' + contestStyle + '" href="' + link + '">' + tournament.name + '</a>';
        //     tbody += '<td style="' + tdStyle + '">' + helper.formatMoney(tournament.totalPrize)  + '</td>';
        //     tbody += '<td style="' + tdStyle + '">' + moment(tournament.startDate).format("HH:mm")  + '</td>';
        // }
        //
        // msg += table + thead + tbody + '</tbody></table>';

        emailer.sendEmail(user.email,
                        'Inactive players in your lineups',
                        msg);
    });
}


exports.notifyUserForTournamentsWithNonPlayingPlayers = notifyUserForTournamentsWithNonPlayingPlayers;