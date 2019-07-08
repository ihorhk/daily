var pos = require('./PlayerPosition.js');
var logger = require('../../util/logger.js');


// the values, names and definitions for actions are set at startup, loaded from game rules
var Action = function (index, id, name, countFunction) {
    this.index = index;
    this.id = id;
    this.name = name;
    this.definition = null;
    this.values = [];
    this.countFunction = countFunction;
};


Action.prototype.setValues = function (att, mid, def, gk) {
    this.values[pos.PlayerPosition.STRIKER] = att;
    this.values[pos.PlayerPosition.MIDFIELDER] = mid;
    this.values[pos.PlayerPosition.DEFENDER] = def;
    this.values[pos.PlayerPosition.GOALKEEPER] = gk;
};


//TODO export the actions in an array for increased performance while looping through them?

exports.Action = {
    MP : new Action(0, 'MP', 'Minutes played',
        function (stats) {
            var minsPlayed = stats.get('mins_played');
            if (!minsPlayed) return 0;
            return minsPlayed;
        }),
    G : new Action(1, 'G', 'Goals',
        function (stats) { return stats.get('goals') - (stats.get('att_pen_goal') || 0) - (stats.get('solo_runs') || 0) }),
    PG : new Action(2, 'PG', 'Penalty goals',
        function (stats) { return stats.get('att_pen_goal') }),
    PM : new Action(3, 'PM', 'Penalties missed',
        function (stats) {
            return (stats.get('att_pen_miss') || 0) + (stats.get('att_pen_post') || 0) + (stats.get('att_pen_target') || 0);
        }),
    ASS : new Action(4, 'ASS', 'Goal assists',
        function (stats) { return stats.get('goal_assist') }),
    IN : new Action(5, 'IN', 'Shot on target',
        function (stats) { return stats.get('total_scoring_att') }),
    OUT : new Action(6, 'OUT', 'Shot off target',
        function (stats) { return stats.get('shot_off_target') }),
    AP : new Action(7, 'AP', 'Accurate passes',
        function (stats) { return stats.get('accurate_pass') }),
    IP : new Action(8, 'IP', 'Inaccurate passes',
        function (stats) { return stats.get('total_pass') - (stats.get('accurate_pass') || 0)}),
    PI : new Action(9, 'PI', 'Pass interceptions',
        function (stats) { return stats.get('interception_won') }),
    BS : new Action(10, 'BS', 'Blocked shots',
        function (stats) { return stats.get('blocked_scoring_att') }),
    S : new Action(11, 'S', 'Saves',
        function (stats) { return stats.get('saves') }),
    PS : new Action(12, 'PS', 'Penalty saves',
        function (stats) { return stats.get('penalty_save') }),
    F : new Action(13, 'F', 'Fouls',
        function (stats) { return stats.get('fouls') }),
    WT : new Action(14, 'WT', 'Tackles won',
        function (stats) { return stats.get('won_tackle') }),
    GC : new Action(15, 'GC', 'Goals conceded',
        function (stats) { return stats.get('goals_conceded') }),
    CS : new Action(16, 'CS', 'Clean sheet',
        function (stats, teamData, isMatchFinished) {
            return (teamData.goals_conceded === 0 && (isMatchFinished && stats.get('mins_played') >= 60)) ? 1 : 0;
        }),
    SG : new Action(17, 'SG', 'Single goal match',
        function (stats, teamData, isMatchFinished) {
            return (teamData.goals_conceded === 1 && (isMatchFinished && stats.get('mins_played') >= 60)) ? 1 : 0;
        }),
    YC : new Action(18, 'YC', 'Yellow cards',
        function (stats) {
            var secondYellow = stats.get('second_yellow');
            if (secondYellow) return 2;
            return stats.get('yellow_card')
        }),
    RC : new Action(19, 'RC', 'Red cards',
        function (stats) {
            var yellow = stats.get('second_yellow');
            if (!yellow) return stats.get('red_card');
            return 0;
        }),
    OFF : new Action(20, 'OFF', 'Offsides',
        function (stats) { return stats.get('total_offside') }),
    OG : new Action(21, 'OG', 'Own Goals',
        function (stats) { return stats.get('own_goals') })
    // SR : new Action(21, 'SR', 'Solo runs',
    //     function (stats) { return stats.get('solo_runs') })
};