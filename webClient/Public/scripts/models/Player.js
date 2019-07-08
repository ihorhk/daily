const SMALL_IMAGE_SIZE = '15';
const MEDIUM_IMAGE_SIZE = '50';
const LARGE_IMAGE_SIZE = '150';


function playerAvatarUrl (optasportsId, size) {
    return 'http://cache.images.core.optasports.com/soccer/players/' + size + 'x' + size + '/' + optasportsId + '.png';
}


function smallPlayerAvatarUrl (player) {
    if (!player.optasportsId || !player.imageSizes) return null;

    var sizes = player.imageSizes.split(',');

    if (sizes.indexOf(SMALL_IMAGE_SIZE) >= 0) {
        return playerAvatarUrl(player.optasportsId, SMALL_IMAGE_SIZE);
    }
    else if (sizes.indexOf(MEDIUM_IMAGE_SIZE) >= 0) {
        return playerAvatarUrl(player.optasportsId, MEDIUM_IMAGE_SIZE);
    }
    else {
        return playerAvatarUrl(player.optasportsId, LARGE_IMAGE_SIZE);
    }
}


function mediumPlayerAvatarUrl (player) {
    if (!player.optasportsId || !player.imageSizes) return null;

    var sizes = player.imageSizes.split(',');

    if (sizes.indexOf(MEDIUM_IMAGE_SIZE) >= 0) {
        return playerAvatarUrl(player.optasportsId, MEDIUM_IMAGE_SIZE);
    }
    else if (sizes.indexOf(LARGE_IMAGE_SIZE) >= 0) {
        return playerAvatarUrl(player.optasportsId, LARGE_IMAGE_SIZE);
    }
    else {
        return playerAvatarUrl(player.optasportsId, SMALL_IMAGE_SIZE);
    }
}


function largePlayerAvatarUrl (player) {
    if (!player.optasportsId || !player.imageSizes) return null;

    var sizes = player.imageSizes.split(',');

    if (sizes.indexOf(LARGE_IMAGE_SIZE) >= 0) {
        return playerAvatarUrl(player.optasportsId, LARGE_IMAGE_SIZE);
    }
    else if (sizes.indexOf(MEDIUM_IMAGE_SIZE) >= 0) {
        return playerAvatarUrl(player.optasportsId, MEDIUM_IMAGE_SIZE);
    }
    else {
        return playerAvatarUrl(player.optasportsId, SMALL_IMAGE_SIZE);
    }
}


function getShortPositionForPlayer (player) {
    var pos = (player.subposition) ? player.subposition : player.position;
    pos = pos.toLowerCase();

    switch (pos.toLowerCase()) {
        case 'goalkeeper':
            return 'GK';

        case 'defender':
            return 'DEF';

        case 'striker':
        case 'forward':
            return 'ATT';

        case 'midfielder':
            return 'MID';

        case 'substitute':
            return 'SUB';
    }
}


function getPositionForPlayer (player) {
    var pos = (player.subposition) ? player.subposition : player.position;
    pos = pos.toLowerCase();

    switch (pos.toLowerCase()) {
        case 'goalkeeper':
            return 'Goal Keeper';

        case 'defender':
            return 'Defender';

        case 'striker':
        case 'forward':
            return 'Attacker';

        case 'midfielder':
            return 'Middle Fielder';
    }
}


function formatPlayerName (player) {
    if (player.hasOwnProperty('name')) {
        return player.name;
    }
    else {
        return player.knownName || player.firstName + ' ' + player.lastName;
    }
}


function formatPlayerNameShort (player) {
    if (player.knownName) {
        var arr = player.knownName.split(' ');
        return arr[arr.length - 1];
    }
    else if (player.lastName) {
        return player.lastName;
    }

    var names = player.name.split(' ');
    return names[0][0] + '. ' + names[names.length - 1];
}


function parsePersonalStat (s) {
    if (!s || s.length === 0) return null;

    var divInd = s.indexOf('=');

    var name = s.substring(0, divInd);
    var value = s.substring(divInd + 1, s.length);

    return {
        name : name,
        value : value
    }
}


function getPlayerPersonalStats (player, key) {
    var playerStats = player.personalStats.split(',');
    for (var i = 0; i < playerStats.length; i++) {
        var stats = parsePersonalStat(playerStats[i]);
        if (stats.name === key) {
            return stats.value;
        }
    }
    return null;
}


function getJerseyNumber (player) {
    if (player.jerseyNum) {
        return player.jerseyNum;
    }

    if (player.personalStats) {
        var jerseyNum = getPlayerPersonalStats(player, 'jersey_num');
        if (jerseyNum.toLowerCase() === 'unknown') {
            return null;
        }
        return jerseyNum;
    }

    return null;
}


function statToString (stat) {
    switch (stat) {
        case 'birth_date':
            return 'Birth Date';
        case 'birth_place':
            return 'Birth Place';
        case 'first_nationality':
            return 'First Nationality';
        case 'weight':
            return 'Weight';
        case 'height':
            return 'Height';
        case 'jersey_num':
            return 'Jersey Number';
        case 'real_position':
            return 'Position';
        case 'real_position_side':
            return 'Position Side';
        case 'country':
            return 'Country';
        case 'join_date':
            return 'Join Date';
        case 'preferred_foot':
            return 'Preferred Foot';
        case 'middle_name':
            return 'Middle Name';
        default:
            return '';
    }
}


function parseAction (s) {
    if (!s || s.length === 0) return null;

    var startInd = s.indexOf('(');
    var divInd = s.indexOf(',');

    var name = s.substring(0, startInd);
    var count = s.substring(startInd + 2, divInd);
    var points = s.substring(divInd + 1, s.length - 1);

    return {
        name : name,
        count : parseInt(count),
        points : parseInt(points)
    }
}


function parseStatsFromMatch (match) {
    var stat = [];

    if (match.hasOwnProperty('lastActions')) {
        var lastActions = match.lastActions;
        var actionStats = lastActions.actions.split(';');

        for (var j = 0; j < actionStats.length; j++) {
            var action = parseAction(actionStats[j]);
            if (action) {
                stat.push(Object.assign({}, action));
            }
        }
    }

    return stat;
}


function isValidActionForPosition (action, pos) {
    var actionObj = ACTIONS[action];

    if (actionObj.excludedPos && actionObj.excludedPos.indexOf(pos) >= 0) {
        return false;
    }

    return true;
}


function findObjectIndex (ary, key, val) {
    for (var i = 0; i < ary.length; i++) {
        var obj = ary[i];
        if (!obj.hasOwnProperty(key)) continue;
        else if (obj[key] == val) {
            return i;
        }
    }
    return -1;
}


function calcPlayerStats (matches) {
    var allSeasonStats = [];
    var last10GamesStats = [];
    var lastGameStats = [];
    var matchCount = matches.length;
    var lastGamePoints = 0;
    var last10GamePoints = 0;
    var allSeasonPoints = 0;
    var last10GameMatches = 0;      // number of matches for last 10 games
    var allSeasonMatches = 0;       // number of matches for all season

    for (var i = matchCount - 1; i >= 0; i--) {

        var match = matches[i];
        if (match.hasOwnProperty('lastActions')) {

            allSeasonMatches++;

            if (i >= matchCount - 10) {
                last10GameMatches++;
            }

            var lastActions = match.lastActions;
            var actionStats = lastActions.actions.split(';');

            for (var j = 0; j < actionStats.length; j++) {
                var action = parseAction(actionStats[j]);
                if (!action || isNaN(action.points)) continue;

                var idx = findObjectIndex(allSeasonStats, 'name', action.name);

                if (idx === -1) {
                    allSeasonStats.push(Object.assign({}, action));
                    allSeasonPoints += action.points;

                    if (i === matchCount - 1) {
                        lastGameStats.push(Object.assign({}, action));
                        lastGamePoints += action.points;
                    }
                    else {
                        lastGameStats.push(Object.assign({}, {
                            name : action.name,
                            count : 0,
                            points : 0
                        }));
                    }

                    if (i >= matchCount - 10) {
                        last10GamesStats.push(Object.assign({}, action));
                        last10GamePoints += action.points;
                    }
                    else {
                        last10GamesStats.push(Object.assign({}, {
                            name : action.name,
                            count : 0,
                            points : 0
                        }));
                    }
                }
                else {
                    allSeasonStats[idx].count += action.count;
                    allSeasonStats[idx].points += action.points;
                    allSeasonPoints += action.points;

                    if (i === matchCount - 1) {
                        lastGameStats[idx].count += action.count;
                        lastGameStats[idx].points += action.points;
                        lastGamePoints += action.points;
                    }

                    if (i >= matchCount - 10) {
                        last10GamesStats[idx].count += action.count;
                        last10GamesStats[idx].points += action.points;
                        last10GamePoints += action.points;
                    }
                }
            }
        }
    }

    if (allSeasonStats.length > 0) {
        allSeasonStats.unshift({
            name: 'AVERAGE_TOTAL_POINTS',
            count: -1,
            points: [Math.round(allSeasonPoints / allSeasonMatches)]
        });
    }

    if (last10GamesStats.length > 0) {
        last10GamesStats.unshift({
            name: 'AVERAGE_TOTAL_POINTS',
            count: -1,
            points: [Math.round(last10GamePoints / last10GameMatches)]
        });
    }

    if (lastGameStats.length > 0) {
        lastGameStats.unshift({
            name: 'TOTAL_POINTS',
            count: -1,
            points: [lastGamePoints]
        });
    }
    
    return [lastGameStats, last10GamesStats, allSeasonStats];
}


function getPlayerStatsNames (matches) {
    var names = [];

    for (var i = 0; i < matches.length; i++) {
        var match = matches[i];
        var stats = parseStatsFromMatch(match);

        for (var j = 0; j < stats.length; j++) {
            var stat = stats[j];

            if (names.indexOf(stat.name) === -1) {
                names.push(stat.name);
            }
        }
    }

    return names;
}


function parsePlayerActions (player) {
    var stats = [];

    if (player.hasOwnProperty('actions')) {
        var actions = player.actions;
        var actionStats = actions.split(';');

        for (var i = 0; i < actionStats.length; i++) {
            var action = parseAction(actionStats[i]);
            if (action) {
                stats.push(Object.assign({}, action));
            }
        }
    }

    return stats;
}


var ACTIONS = {
    TOTAL_POINTS : { desc : 'Total Points', isSummary : true },
    AVERAGE_TOTAL_POINTS : { desc : 'Average Points', isSummary : true },
    MP : { desc : 'Minute Played', icon : {'icon': 'actions/icon-action-minute-played.svg', 'width': '11', 'height': '13'}},
    G : { desc : 'Goal', icon : {'icon': 'actions/icon-action-goal.svg', 'width': '12', 'height': '12'}},
    PG : { desc : 'Penalty Goal', icon : {'icon': 'actions/icon-action-penalty-scored.svg', 'width': '11', 'height': '12'}},
    PM : { desc : 'Penalty Missed', icon : {'icon': 'actions/icon-action-penalty-missed.svg', 'width': '11', 'height': '12'}},
    ASS : { desc : 'Goal Assist', icon : {'icon': 'actions/icon-action-assist.svg', 'width': '14', 'height': '12'}},
    IN : { desc : 'Shot On Target', icon : {'icon': 'actions/icon-action-shot-on-goal.svg', 'width': '14', 'height': '12'}},
    OUT : { desc : 'Shot Off Target', icon : {'icon': 'actions/icon-action-shot-off-target.svg', 'width': '11', 'height': '13'}},
    AP : { desc : 'Accurate Pass', icon : {'icon': 'actions/icon-action-pass-successful.svg', 'width': '15', 'height': '9'}},
    IP : { desc : 'Inaccurate Pass', icon: {'icon' : 'actions/icon-action-pass-unsuccessful.svg', 'width': '15', 'height': '9'}},
    PI : { desc : 'Pass Intercepted', icon : {'icon': 'actions/icon-action-pass-intercepted.svg', 'width': '15', 'height': '12'}},
    BS : { desc : 'Blocked Shot', icon : {'icon': 'actions/icon-action-block-shot.svg', 'width': '15', 'height': '9'}, excludedPos : [ 'GK' ]},
    S : { desc : 'Save', icon : {'icon': 'actions/icon-action-save-a-goal.svg', 'width': '14', 'height': '11'}, excludedPos : [ 'ATT', 'MID', 'DEF' ]},
    PS : { desc : 'Penalty Save', icon : {'icon': 'actions/icon-action-penalty-saved.svg', 'width': '14', 'height': '11'}, excludedPos : [ 'ATT', 'MID', 'DEF' ]},
    F : { desc : 'Foul', icon : {'icon': 'actions/icon-action-foul.svg', 'width': '14', 'height': '8'}},
    WT : { desc : 'Won Tackle', icon : {'icon': 'actions/icon-action-tackle-successful.svg', 'width': '9', 'height': '15'}},
    GC : { desc : 'Goal Conceded', icon : {'icon': 'actions/icon-action-goal-conceded.svg', 'width': '13', 'height': '14'}, excludedPos : [ 'ATT', 'MID' ]},
    CS : { desc : 'Clean Sheet', icon : {'icon': 'actions/icon-action-clean-sheet.svg', 'width': '9', 'height': '13'}, excludedPos : [ 'ATT', 'MID' ]},
    SG : { desc : 'Single Goal Match', icon : {'icon': 'actions/icon-action-single-goal.svg', 'width': '12', 'height': '12'}, excludedPos : [ 'ATT', 'MID' ]},
    YC : { desc : 'Yellow Card', icon : {'icon': 'actions/icon-action-yellow-card.svg', 'width': '9', 'height': '19'}},
    RC : { desc : 'Red Card', icon : {'icon': 'actions/icon-action-red-card.svg', 'width': '8', 'height': '19'}},
    OFF : { desc : 'Offside', icon : {'icon': 'actions/icon-action-offside.svg', 'width': '11', 'height': '16'}},
    OG : { desc : 'Own Goal', icon : {'icon': 'actions/icon-action-own-goal.svg', 'width': '12', 'height': '12'}}
};