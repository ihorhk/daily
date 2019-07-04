var MatchPeriod = {
    PRE_MATCH: 'PreMatch',
    FIRST_HALF: 'FirstHalf',
    HALF_TIME: 'HalfTime',
    SECOND_HALF: 'SecondHalf',
    EXTRA_FIRST_HALF: 'ExtraFirstHalf',
    EXTRA_SECOND_HALF: 'ExtraSecondHalf',
    EXTRA_HALF_TIME: 'ExtraHalfTime',
    SHOOT_OUT: 'ShootOut',
    FULL_TIME: 'FullTime',
    FULL_TIME_90: 'FullTime90',
    FULL_TIME_PENS: 'FullTimePens',
    ABANDONED : 'Abandoned', // A game had been abandoned midway throught he play
    POSTPONED : 'Postponed', // A game was postponed before the game was started
    VOID : 'Void' // The match has been deemed as void (e.g. team going into administration)
};

exports.MatchPeriod = MatchPeriod;
