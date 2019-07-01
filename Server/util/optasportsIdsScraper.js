var helper = require('./helper');
var logger = require('./logger');
var db = require('../db/dbManager');

var playersActiveProcessId = -1;
var teamsActiveProcessId = -1;
var requestsWaiting = []; // maps competitions ids to requests sent count

var SCRAPING_REQUEST_INTERVAL = 10;


/**
 * To get the player or team id used by optasports we send a query to soccerway.com using the name of the player. Then we find the
 * first resulting player in the html, and that's where we find the id used by optasports.
 * To prevent inconsistencies between teams data, we get the teams from the competitions both before and after the process.
 * @param competitionsIds - can be either a single value, an array of values, or null/undefined (applying for all the competitions)
 */
function scrapePlayersOptasportsIds (competitionsIds) {
    doPlayersScraping(competitionsIds, ++playersActiveProcessId);
}


function scrapeTeamsOptasportsIds (competitionsIds) {
    doTeamsScraping(competitionsIds, ++teamsActiveProcessId);
}


function doPlayersScraping (competitionsIds, processId) {
    logger.info('Scraping players optasports ids from soccerway.com (pid: ' + processId + ')');

    db.getCompetitionsByIds(competitionsIds, true, false, function (err, competitions) {
        var counter = 0;
        var allPlayers = []; // players mapped by ids

        for (var c = 0; c < competitions.length; c++) {
            var competition = competitions[c];
            var teams = competition.teams;
            requestsWaiting[competition.competitionId] = 0;

            for (var t = 0; t < teams.length; t++) {
                var team = teams[t];
                var players = team.players;

                for (var i = 0; i < players.length; i++) {
                    var player = players[i];
                    allPlayers[player.playerId] = player;
                    requestsWaiting[competition.competitionId]++;
                    counter++;

                    setTimeout(function () {

                        // stop process
                        if (processId !== playersActiveProcessId) {
                            return;
                        }

                        getPlayerId(this.player, function (playerId) {
                            var player = this.player;

                            if (playerId) {
                                player.optasportsId = playerId;
                            }

                            scrapingResponseReceived(this.competition, null, allPlayers);

                        }.bind(this));

                    }.bind({ competition : competitions[c], player : player }), SCRAPING_REQUEST_INTERVAL * counter);
                }
            }
        }
    });
}


function getPlayerId (player, callback) {
    var firstName = player.firstName;
    var lastName = player.lastName;

    var query = encodeURI('/search/?q=' + firstName + '+' + lastName + '&module=all');
    helper.httpGet('www.soccerway.com', query, function (err, html) {

        html = html.replace(/\s/g, '');
        var td = html.match(/(<tdclass="player")(.)+(<\/td>)/g);

        if (!td || !td[0]) {
            logger.debug('No player found on soccerway.com with name ' + firstName + ' ' + lastName);
            callback();
            return;
        }

        td = td[0];
        td = td.substr(td.indexOf('ahref') + 7);
        var href = td.substr(0, td.indexOf('"'));

        href = href.split('/');

        var playerId = href[href.length - 1];
        if (playerId.length === 0) {
            playerId = href[href.length - 2];
        }

        callback(playerId);
    });
}


function doTeamsScraping (competitionsIds, processId) {
    logger.info('Scraping teams optasports ids from soccerway.com (pid: ' + processId + ')');

    db.getCompetitionsByIds(competitionsIds, true, false, function (err, competitions) {
        var counter = 0;
        var allTeams = []; // teams mapped by ids

        for (var c = 0; c < competitions.length; c++) {
            var competition = competitions[c];
            var teams = competition.teams;
            requestsWaiting[competition.competitionId] = 0;

            for (var t = 0; t < teams.length; t++) {
                var team = teams[t];
                allTeams[team.teamId] = team;
                requestsWaiting[competition.competitionId]++;
                counter++;

                setTimeout(function () {

                    // stop process
                    if (processId !== teamsActiveProcessId) {
                        return;
                    }

                    getTeamId(this.team, function (teamId) {
                        var team = this.team;

                        if (teamId) {
                            team.optasportsId = teamId;
                        }

                        scrapingResponseReceived(this.competition, allTeams);

                    }.bind(this));

                }.bind({ competition : competitions[c], team : team }), SCRAPING_REQUEST_INTERVAL * counter);
            }
        }
    });
}


function getTeamId (team, callback) {
    var teamName = team.name;
    var query = encodeURI('/search/?q=' + teamName + ' ' + team.country + '&module=all');
    query = query.replace(/\./g, '');

    helper.httpGet('www.soccerway.com', query, function (err, html) {

        var teamId = requestCallback(html, this);

        if (teamId) {
            callback(teamId);
        }
        else if (team.shortName) {
            console.log('Retrying with short name ' + team.shortName);

            var teamName = team.shortName;
            var query = encodeURI('/search/?q=' + teamName + ' ' + team.country + '&module=all');
            query = query.replace(/\./g, '');

            helper.httpGet('www.soccerway.com', query, function (err, html) {

                var teamId = requestCallback(html, this);

                if (teamId) {
                    callback(teamId);
                }
                else {
                    logger.debug('No team found on soccerway.com with name ' + team.name);
                    callback();
                }

            }.bind(teamName));
        }
        else {
            logger.debug('No team found on soccerway.com with name ' + team.name);
            callback();
        }

    }.bind(teamName));

    var requestCallback = function (html, teamName) {
        html = html.replace(/\s/g, '');
        var ind = html.indexOf('<ulclass="treesearch-results">');

        if (ind > 0) {
            html = html.substring(ind + ('<ulclass="treesearch-results">').length);
            var ul = html.match(/(<li><ahref="\/teams(.)+?<\/li>)+/g);
            teamName = teamName.replace(/\s/g, '').toLowerCase();

            // find the list of results
            if (ul && ul.length > 0) {
                ul = ul[0];

                // for every element, get the name of the team and check if it matches at least 90% of the query team
                do {
                    var el = ul.match(/<li>.+?<\/li>/);
                    if (el && el.length > 0) {
                        el = el[0];
                        var name = el.match(/">(.+)<\/a>/);

                        if (name && name.length > 1) {
                            name = name[1].toLowerCase();

                            if (name.length > teamName.length) {
                                var shortest = teamName;
                                var longest = name;
                            }
                            else {
                                shortest = name;
                                longest = teamName;
                            }

                            shortest = helper.makeAccentsPlain(shortest);
                            longest = helper.makeAccentsPlain(longest);

                            if (shortest === longest || (team.shortName && helper.makeAccentsPlain(team.shortName.toLowerCase()) === name)) {
                                // acceptable result, get team id
                                var result = el.match(/\/[a-zA-Z0-9\/-]+\/([0-9]+)\//);

                                console.log(team.name + ' from ' + team.optasportsId + ' to ' + result[1] + ' | ' + shortest + ' ' + longest);

                                return result[1];
                            }

                            var missingChars = 0;

                            for (var i = 0; i < longest.length; i++) {
                                for (var j = 0; j < shortest.length; j++){
                                    if (longest[i] === shortest[j]) {
                                        i++;
                                    }
                                    else {
                                        missingChars++;
                                        break;
                                    }
                                }
                            }

                            // acceptable result, get team id
                            if (missingChars <= Math.round(shortest.length * 0.35)) {
                                var result = el.match(/\/[a-zA-Z0-9\/-]+\/([0-9]+)\//);

                                console.log(team.name + ' from ' + team.optasportsId + ' to ' + result[1] + ' | ' + shortest + ' ' + longest);

                                return result[1];
                            }
                        }

                        // go to next li
                        ul = ul.substring(el.length);
                    }

                } while (el)
            }
        }

        return null;
    };
}


function scrapingResponseReceived (competition, teams, players) {
    requestsWaiting[competition.competitionId]--;

    if (requestsWaiting[competition.competitionId] === 0) {
        logger.verbose('Done scraping optasports ids for competition ' + competition.competitionId);

        // "retrieveImageURLs" supports both players and teams, but we need it only for players
        if (players) {
            retrieveImagesURLs(teams, players, function () {
                updateTeamsForCompetition(competition, teams, players)
            });
        }
        else {
            updateTeamsForCompetition(competition, teams, players)
        }
    }
}


// create urls using optasports id, and send requests to check if images actually exists, for different sizes
function retrieveImagesURLs (teams, players, callback) {
    if (teams) {
        var sizes = [ 150, 75, 30 ];
        var models = teams;
        var baseQuery = '/soccer/teams/';
    }
    else {
        sizes = [ 150, 50 ];
        models = players;
        baseQuery = '/soccer/players/';
    }

    var url = 'cache.images.core.optasports.com';

    var keys = Object.keys(models);
    var urlResponsesWaiting = keys.length * sizes.length;

    keys.forEach(function (key) {
        var model = models[key];
        var optasportsId = model.optasportsId;
        var sizes = this;

        if (!optasportsId) return;

        delete model.imageSizes;
        delete model.optasportsId;

        for (var i = 0; i < sizes.length; i++) {
            var size = sizes[i];

            /* The comments in this function are to actually set image urls as fields */
            //switch (i) {
            //    case 0:
            //        var fieldName = 'largeImageUrl';
            //        break;
            //    case 1:
            //        fieldName = 'mediumImageUrl';
            //        break;
            //    case 2:
            //        fieldName = 'smallImageUrl';
            //        break;
            //}

            var query = baseQuery + size + 'x' + size + '/' + optasportsId + '.png';

            helper.httpGet(url, query, function (status) {

                if (status === 200) {
                    //this.model[this.fieldName] = 'http://' + this.url;
                    if (this.model.imageSizes) {
                        if (this.model.imageSizes.split(',').indexOf(this.size) < 0) {
                            this.model.imageSizes += ',' + this.size;
                        }
                    }
                    else {
                        this.model.imageSizes = this.size.toString();
                        this.model.optasportsId = this.optasportsId;
                    }
                }

                if (--urlResponsesWaiting === 0) {
                    callback();
                }

                //}.bind({ model : model, fieldName : fieldName, url : url + query }));
            }.bind({ model : model, url : url + query, size : size, optasportsId : optasportsId }));
        }

    }.bind(sizes));
}


function updateTeamsForCompetition (competition, updatedTeams, updatedPlayers) {
    // we do all of this craziness because it could be that the teams in the db have changed since when we first retrieved them
    db.getAllTeamsInCompetition(competition.competitionId, false, false, function (err, teams) {
        for (var i = 0; i < teams.length; i++) {
            var team = teams[i];

            if (updatedTeams) {
                var updatedTeam = updatedTeams[team.teamId];

                if (updatedTeam && updatedTeam.optasportsId) {
                    team.optasportsId = updatedTeam.optasportsId;
                    //if (updatedTeam.imageSizes)
                    //  team.imageSizes = updatedTeam.imageSizes;
                    //if (updatedTeam.smallImageUrl) {
                    //    team.smallImageUrl = updatedTeam.smallImageUrl;
                    //}
                    //if (updatedTeam.mediumImageUrl) {
                    //    team.mediumImageUrl = updatedTeam.mediumImageUrl;
                    //}
                    //if (updatedTeam.largeImageUrl) {
                    //    team.largeImageUrl = updatedTeam.largeImageUrl;
                    //}
                }
            }

            if (updatedPlayers) {
                for (var j = 0; j < team.players.length; j++) {
                    var player = team.players[j];
                    var updatedPlayer = updatedPlayers[player.playerId];

                    if (updatedPlayer && updatedPlayer.optasportsId) {
                        player.optasportsId = updatedPlayer.optasportsId;
                        if (updatedPlayer.imageSizes) {
                            player.imageSizes = updatedPlayer.imageSizes;
                        }
                        //if (updatedPlayer.mediumImageUrl) {
                        //    player.mediumImageUrl = updatedPlayer.mediumImageUrl;
                        //}
                        //if (updatedPlayer.largeImageUrl) {
                        //    player.largeImageUrl = updatedPlayer.largeImageUrl;
                        //}
                    }
                }
            }
        }

        db.updateCompetitionTeamsWithDoc(competition.competitionId, teams);
    });
}


exports.scrapePlayersOptasportsIds = scrapePlayersOptasportsIds;
exports.scrapeTeamsOptasportsIds = scrapeTeamsOptasportsIds;

exports.retrieveImagesURLs = retrieveImagesURLs;