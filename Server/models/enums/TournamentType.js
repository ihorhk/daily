var Type = {
    TOURNAMENT : 'TOURNAMENT',
    HEAD_TO_HEAD : 'HEAD_TO_HEAD',
    DOUBLE_UP : 'DOUBLE_UP',
    //FIFTY_FIFTY : 'FIFTY_FIFTY',
    //MULTIPLIER : 'MULTIPLIER'
};

var Subtype = {
    MULTIPLIER_FIVE : 'MULTIPLIER_FIVE',
    MULTIPLIER_TEN : 'MULTIPLIER_TEN'
};


function getTournamentTypesStrings() {
    return {
        TOURNAMENT : 'Tournament',
        HEAD_TO_HEAD : 'Head-to-head',
        DOUBLE_UP : 'Double Up',
        //FIFTY_FIFTY : '50/50',
        //MULTIPLIER : 'Multiplier'
    }
}


exports.Type = Type;
exports.Subtype = Subtype;
exports.getTournamentTypesStrings = getTournamentTypesStrings;