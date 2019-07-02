// just a generic test for generic purposes
var db = require('../db/dbManager.js');
var moment = require('moment');
var fs = require('fs');
var crypt = require('../util/crypt.js');
var lock = require('../util/lock');
var helper = require('../util/helper');
var dcHelper = require('../util/dailyChampionHelper');
var optasportsScraper = require('../util/optasportsIdsScraper');
var dbOrganizer = require('../db/dbOrganizer');
var routes = '../net/routes';
var crypto = require('crypto');
var logger = require('../util/logger');
var actions = require('../models/enums/Action').Action;
var constants = require('../util/constants')
var feedManager = require('../controllers/feedManager');
var models = require('../models/index');
var robin = require('../controllers/robinTheDailyChampionAddict');
var tourController = require('../controllers/tournamentsController');
var tourProgrammer = require('../controllers/tournamentsProgrammer');
var paymentsManager = require('../controllers/paymentsController');


var redis = require("redis");
var client = redis.createClient();


// init db connection
require('../db/Database.js').initDB(function () {

    db.getUsers(null, {}, function (err, users) {
        for (var i = 0; i < users.length; i++) {
            var user = users[i];
            user.gameRulesVersion = '0.1';
            user.registrationDate = new Date();

            if (user.lastName === 'The Addict') {
                user.balance = 100000;
            }

            db.insertOrUpdateUser(user);
        }
    });

    var actions = [
        { key : 'MP', values : [ 2, 2, 2, 2 ] },
        { key : 'G', values : [ 700, 800, 900, 1500 ] },
        { key : 'PG', values : [ 500, 500, 500, 500 ] },
        { key : 'PM', values : [ -500, -500, -500, -500 ] },
        { key : 'IN', values : [ 120, 120, 120, 120 ] },
        { key : 'OUT', values : [ 40, 40, 40, 40 ] },
        { key : 'AP', values : [ 3, 5, 3, 10 ] },
        { key : 'IP', values : [ -3, -5, -3, -10 ] },
        { key : 'PI', values : [ 30, 30, 30, 30 ] },
        { key : 'BS', values : [ 50, 50, 50, 0 ] },
        { key : 'S', values : [ 0, 0, 0, 100 ] },
        { key : 'PS', values : [ 0, 0, 0, 700 ] },
        { key : 'F', values : [ 100, 100, 100, 100 ] },
        { key : 'WT', values : [ 20, 30, 50, 50 ] },
        { key : 'GC', values : [ 0, 0, -100, -200 ] },
        { key : 'CS', values : [ 0, 0, 400, 600 ] },
        { key : 'SG', values : [ 0, 0, 200, 300 ] },
        { key : 'YC', values : [ -200, -200, -200, -200 ] },
        { key : 'RC', values : [ -500, -500, -500, -500 ] },
        { key : 'OFF', values : [ -100, -100, -100, -100 ] },
        { key : 'OG', values : [ -800, -800, -800, -800 ] },
    ];

    var definitions = require('../models/enums/Action.js').ACTIONS_DEFINITIONS;
    var actionsForPositions = require('../models/enums/Action.js').ACTIONS_FOR_POSITIONS;

    for (var i = 0; i < actions.length; i++) {
        var action = actions[i];

        for (var j = 0; j < definitions.length; j++) {
            if (definitions[j].action === action.key) {
                action.definition = definitions[j].desc;
                action.definition = action.definition.replace(/\t/g, ' ');
                break;
            }
        }

        for (j = 0; j < actionsForPositions.length; j++) {
            var pos = actionsForPositions[j];

            for (var a = 0; a < pos.actions.length; a++) {
                if (pos.actions[a].action === action.key) {
                    action.name = pos.actions[a].desc;
                }
            }
        }
    }

    db.insertGameRules('0.1', 'Test game rules', actions, 'Oh my gosh', function (err, res) {

    });


    // db.getCompetitionsByIds(null, true, false, function (err, competitions) {
    //
    //     for (var c = 0; c < competitions.length; c++) {
    //         var teams = competitions[c].teams;
    //
    //         for (var t = 0; t < teams.length; t++) {
    //             var team = teams[t];
    //
    //             for (var p = 0; p < team.players.length; p++) {
    //                 var player = team.players[p];
    //
    //                 if (player.historyPoints) {
    //                     delete player.historyPoints;
    //                 }
    //             }
    //         }
    //
    //         db.updateCompetitionTeamsWithDoc(competitions[c].competitionId, teams);
    //     }
    //
    // });


    // for (var i = 0; i < paymentsManager.PAYMENT_METHODS_NAMES.length; i++) {
    //     console.log(paymentsManager.PAYMENT_METHODS_NAMES[i].name);
    // }

    // dcHelper.setTeamsShortNamesAndAbbreviationsFromFile(process.cwd() + '/teams-final.xlsx');


    // optasportsScraper.scrapeTeamsOptasportsIds([ '354']);

    // db.getAllCompetitions(function (err, competitions) {

        // var competitionToFix = '2';

        // for (var i = 0; i < competitions.length; i++) {
        //     if (competitions[i].competitionId === competitionToFix) {
        //         competitionToFix = competitions[i];
        //         break;
        //     }
        // }
        //
        // var allTeams = {};
        //
        // for (var i = 0; i < competitions.length; i++) {
        //     var competition = competitions[i];
        //     if (competition.competitionId === competitionToFix.competitionId) continue;
        //
        //     for (var j = 0; j < competition.teams.length; j++) {
        //         var team = competition.teams[j];
        //         if (!team.optasportsId) continue;
        //         allTeams[team.teamId] = team;
        //     }
        // }
        //
        // for (var i = 0; i < competitionToFix.teams.length; i++) {
        //     var team = allTeams[competitionToFix.teams[i].teamId];
        //
        //     if (team) {
        //         console.log('Setting optasportsId ' + team.optasportsId + ' to ' + team.name);
        //         competitionToFix.teams[i].optasportsId = team.optasportsId;
        //     }
        // }
        //
        // db.updateCompetitionTeamsWithDoc(competitionToFix.competitionId, competitionToFix.teams);

    // }, true);

    // db.getAllCompetitions(function (err, competitions) {
    //     for (var i = 0; i < competitions.length;i++) {
    //         var competition = competitions[i];
    //
    //         console.log('\n_________________________')
    //         console.log(competition.name.toUpperCase());
    //         console.log('_________________________')
    //
    //         for (var j = 0; j < competition.teams.length; j++) {
    //             var team = competition.teams[j];
    //             console.log(team.teamId + ' - ' + team.name + ' - ' + (team.shortName || ''));
    //         }
    //     }
    // }, true)

    // db.getPlayersActions(null, function (err, playersActions) {
    //
    //     for (var i = 0; i < playersActions.length; i++) {
    //         var playerActions = playersActions[i];
    //
    //         for (var p = 0; p < playerActions.players.length; p++) {
    //             var player = playerActions.players[p];
    //
    //             if (player.salary && playerActions.matchStartDate < new Date('2016-12-12')) {
    //                 delete player.salary;
    //             }
    //
    //             if (!player.salary) {
    //                 db.test1(playerActions.matchStartDate, playerActions.matchId, function (err, tournaments) {
    //
    //                     var player = this;
    //                     if (tournaments.length > 0) {
    //                         var tournament = tournaments[0];
    //                         db.getSlateById(tournament.slateId, function (err, slate) {
    //
    //                             if (!slate) return;
    //                             var player = this;
    //
    //                             for (var i = 0; i < slate.teams.length; i++) {
    //                                 var team = slate.teams[i];
    //                                 for (var p = 0; p < team.players.length; p++) {
    //                                     var slatePlayer = team.players[p];
    //                                     if (slatePlayer.playerId === player.playerId) {
    //                                         player.salary = slatePlayer.salary;
    //                                         if (player.salary > 200000)
    //                                             console.log('set salary to player ' + player.playerId + ': ' + player.salary);
    //                                         return;
    //                                     }
    //                                 }
    //                             }
    //
    //                         }.bind(player))
    //                     }
    //
    //                 }.bind(player));
    //             }
    //         }
    //
    //         db.test2(playerActions);
    //
    //         setTimeout(function () {
    //             console.log('updating');
    //             db.test2(this)
    //         }.bind(playerActions), 60000)
    //     }
    // });
    

    // require('../calc/salaryCalculator').testCalculateSalary('9');

    //var team = { name : 'Heracles Almelo', country : 'Netherlands' };
    //var teamName = (team.shortName ? team.shortName : team.name);
    //
    //var query = encodeURI('/search/?q=' + (team.shortName ? team.shortName : team.name) + ' ' + team.country + '&module=all');
    //query = query.replace(/\./g, '');
    ////
    //helper.httpGet('www.soccerway.com', query, function (err, html) {
    //
    //    var teamId = requestCallback(html, this);
    //
    //    if (teamId) {
    //        callback(teamId);
    //    }
    //    else {
    //        var teamName = team.shortName;
    //        var query = encodeURI('/search/?q=' + teamName + ' ' + team.country + '&module=all');
    //        query = query.replace(/\./g, '');
    //
    //        helper.httpGet('www.soccerway.com', query, function (err, html) {
    //
    //            var teamId = requestCallback(html, this);
    //
    //            if (teamId) {
    //                callback(teamId);
    //            }
    //            else {
    //                logger.debug('No team found on soccerway.com with name ' + this);
    //                callback();
    //            }
    //
    //        }.bind(teamName));
    //    }
    //
    //}.bind(teamName));
    //
    //var requestCallback = function (html, teamName) {
    //    html = fs.readFileSync('./teamId').toString();
    //    html = html.replace(/\s/g, '');
    //    var ind = html.indexOf('<ulclass="treesearch-results">');
    //
    //    if (ind > 0) {
    //        html = html.substring(ind + ('<ulclass="treesearch-results">').length);
    //        var ul = html.match(/(<li><ahref="\/teams(.)+?<\/li>)+/g);
    //        teamName = teamName.replace(/\s/g, '').toLowerCase();
    //
    //        // find the list of results
    //        if (ul && ul.length > 0) {
    //            ul = ul[0];
    //
    //            // for every element, get the name of the team and check if it matches at least 90% of the query team
    //            do {
    //                var el = ul.match(/<li>.+?<\/li>/);
    //                if (el && el.length > 0) {
    //                    el = el[0];
    //                    var name = el.match(/">(.+)<\/a>/);
    //
    //                    if (name && name.length > 1) {
    //                        name = name[1].toLowerCase();
    //
    //                        if (name.length > teamName.length) {
    //                            var shortest = teamName;
    //                            var longest = name;
    //                        }
    //                        else {
    //                            shortest = name;
    //                            longest = teamName;
    //                        }
    //
    //                        shortest = helper.makeAccentsPlain(shortest);
    //                        longest = helper.makeAccentsPlain(longest);
    //
    //                        if (shortest === longest || (team.shortName && helper.makeAccentsPlain(team.shortName.toLowerCase()) === name)) {
    //                            // acceptable result, get team id
    //                            var result = el.match(/\/[a-zA-Z0-9\/-]+\/([0-9]+)\//);
    //
    //                            console.log(team.name + ' from ' + team.optasportsId + ' to ' + result[1] + ' | ' + shortest + ' ' + longest);
    //
    //                            return result[1];
    //                        }
    //
    //
    //                        var missingChars = 0;
    //
    //                        for (var i = 0; i < longest.length; i++) {
    //                            for (var j = 0; j < shortest.length; j++){
    //                                if (longest[i] === shortest[j]) {
    //                                    i++;
    //                                }
    //                                else {
    //                                    missingChars++;
    //                                    break;
    //                                }
    //                            }
    //                        }
    //
    //                        // acceptable result, get team id
    //                        if (missingChars <= Math.round(shortest.length * 0.35)) {
    //                            var result = el.match(/\/[a-zA-Z0-9\/-]+\/([0-9]+)\//);
    //
    //                            console.log(team.name + ' from ' + team.optasportsId + ' to ' + result[1] + ' | ' + shortest + ' ' + longest);
    //
    //                            return result[1];
    //                        }
    //                    }
    //
    //                    // go to next li
    //                    ul = ul.substring(el.length);
    //                }
    //
    //            } while (el)
    //        }
    //    }
    //
    //    return null;
    //};


    //db.getTournamentById('582a02a30bc502bc3ec0ea14', function (err, res) {
    //    console.log(res);
    //}, false, false, true, true, true);

    //db.getUser('walkerjitzu', function (err, user) {
    //    var xml = require('../controllers/paymentsController').generateFastPayXML(user, 5, 20);
    //
    //    console.log(xml);
    //    //xml = encodeURIComponent(xml);
    //    //console.log(xml);
    //});
    //
    //var countryData = require('country-data').countries;
    //var countries = [];
    //var country;
    //
    //Object.keys(countryData).forEach(function (key) {
    //    if (country && country.name === countryData[key]) return;
    //
    //    country = countryData[key];
    //
    //    if (!country.name) return;
    //
    //    countries.push({ name : country.name, code : country.alpha3 });
    //});
    //
    //countries = countries.sort(function (c1, c2) {
    //    if (!c1.name || !c2.name) return 0;
    //    return c1.name.localeCompare(c2.name);
    //});
    //
    //country = null;
    //
    //for (var i = 0; i < countries.length; i++) {
    //    if (country && country.name === countries[i].name) continue;
    //
    //    country = countries[i];
    //    if (!country.code) continue;
    //    console.log("{ country : '" + country.name + "', code : '" + country.code + "'}, ");
    //}


    //var xml = fs.readFileSync(process.cwd() + '/acpo_purchase_test', 'UTF-8');
    ////76e96b177b
    //var hash = crypto.createHash('md5').update(xml).digest('hex');
    //console.log(hash);
});


function printContests () {
    db.getAllMatches(function (err, res) {
        var matches = [];

        for (var i = 0; i < res.length; i++) {
            matches[res[i].matchId] = res[i];
        }

        db.test(function (err, tournaments) {
            var matches = this;

            for (var i = 0; i < tournaments.length; i++) {
                var tournament = tournaments[i];

                console.log(tournament.startDate + ' ' + tournament.name + ' | €' + tournament.entryFee);
                console.log('____________________________________________________________________________');
                for (var j = 0; j < tournament.matches.length; j++) {
                    var match = matches[tournament.matches[j].matchId];
                    console.log('Match ' + (j + 1) + ': ' + match.startDate + ' | ' + match.firstTeam.teamName + ' vs ' + match.secondTeam.teamName );
                }

                console.log('\n');
            }
        }.bind(matches));
    });
}


//var arr = [];
//arr['lol'] = '123';
//arr['asd'] = '256';
//
//console.log(arr);
//arr = helper.convertAssociativeArrayToNormalArray(arr);
//console.log(arr);

//var file = '/home/jedi/Desktop/payouts';
//
//var array = fs.readFileSync(file).toString().split("\n");
//var prizes = [];
//var count = 0;
//
//for (var i = 0; i < array.length; i++) {
//    var str = array[i];
//    var startPos = str.substring(0, str.indexOf(' '));
//    startPos = parseInt(startPos);
//
//    var dashInd = str.indexOf('-');
//    if (dashInd > 0) {
//        var endPos = str.substring(dashInd + 2, str.substring(dashInd + 2).indexOf(' ') + dashInd + 2);
//        endPos = parseInt(endPos);
//    }
//    else {
//        endPos = startPos;
//    }
//
//    while (startPos <= endPos) {
//        var money = str.substring(str.indexOf('$') + 1);
//        money = money.replace(',', '');
//        money = parseFloat(money);
//        count += money;
//
//        prizes.push(money);
//
//        startPos++;
//    }
//}
//
//for (i = 0; i < prizes.length; i++) {
//    var perc = prizes[i] * 100 / count;
//    console.log(perc);
//}

//var files = [];
//var dir = '/home/jedi/Desktop/lele';
//var cont = 0;
//
//fs.readdirSync(dir).forEach(function(file) {
//
//    file = dir+'/'+file;
//    var newFile =  '/home/jedi/Desktop/lele/' + (100 + cont++);
//    fs.rename(file, newFile);
//    files.push(newFile);
//
//});
//
//console.log(files);
