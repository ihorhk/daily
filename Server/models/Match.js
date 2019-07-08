const models = require('./index.js');


var Match = function (competition, teamsData) {
    this.competition = competition;
    if (teamsData) {
        this.teamsData = teamsData;
    }
    else {
        this.teamsData = [new models.teamData.TeamData(), new models.teamData.TeamData()];
    }

    this.matchOfficial = null;
    this.seasonName = null;
    this.seasonId = null;
    this.uID = null;
    this.period = null;
    this.attendance = -1;
    this.date = null; //start time
    this.matchType = null;
    this.timeStamp = null; //last update
    this.weather = null; // can be undefined
    this.resultType = null;
    this.winner = null; // winning team
    this.venue = null;

    this.matchDay = -1; // season match day

    // round info for cups, etc.
    this.roundNumber = -1; // id of the round in the competition
    this.roundName = null;
    this.roundPool = -1; // group number

    this.previousMatchId = null; // if match is the second of a two legged game, this is the uID of the first match
    this.match_time = -1; // total minutes
    this.first_half_time = -1; // first half minutes
    this.second_half_time = -1; // second half minutes

    // Please gently note that i didn't mix underscores with lower/upper case letters in the naming just to annoy OCD people,
    // but for a more efficient parsing. See models/README.txt. -Alessandro
};


Match.prototype.getTeamDataForPlayer = function (matchPlayer) {
    var teamData = this.teamsData[0];

    for (var i = 0; i < teamData.matchPlayers.length; i++) {
        if (teamData.matchPlayers[i].equals(matchPlayer)) {
            return teamData;
        }
    }

    return this.teamsData[1];
};


Match.prototype.manageGameStatusForPlayerAndCalculateMinutesPlayed = function (matchPlayer, teamData) {
    var isPlaying = !matchPlayer.isSubstitute();
    var totalMinutesPlayed = 0;
    var lastEntryMinute = 0;

    for (var i = 0; i < teamData.substitutions.length; i++) {
        var substitution = teamData.substitutions[i];

        if (isPlaying && substitution.subOff.equals(matchPlayer.player)) {
            totalMinutesPlayed += (substitution.minute - lastEntryMinute);
            isPlaying = false;
        }
        else if (!isPlaying && substitution.subOn && substitution.subOn.equals(matchPlayer.player)) {
            lastEntryMinute = substitution.minute;
            isPlaying = true;
        }
    }

    if (isPlaying) {
        totalMinutesPlayed += (this.match_time - lastEntryMinute);

        if (this.isFinished()) {
            isPlaying = false;
        }
    }

    matchPlayer.isPlaying = isPlaying;

    return totalMinutesPlayed;
};


Match.prototype.isComing = function () {
    return this.period === models.MatchPeriod.PRE_MATCH;
};


Match.prototype.isFinished = function () {
    return this.period === models.MatchPeriod.FULL_TIME ||
        (this.resultType && (this.isCancelled() || this.isAbandoned()));
};


Match.prototype.isCancelled = function () {
    return this.resultType && (this.resultType === ResultType.VOID || this.resultType === ResultType.POSTPONED);
};


Match.prototype.isAbandoned = function () {
    return this.resultType && this.resultType === ResultType.ABANDONED;
};


var ResultType = {
    NORMAL_RESULT : 'NormalResult',
    // this is displayed for matches played over 2 legs when there is a winner based on the total score over the 2 games.
    // Note: it will only appear if Match Type = 2nd leg
    AGGREGATE : 'Aggregate',
    // this is displayed for matches played over 2 legs when the two teams are level on goals scored,
    // but tie is decided by the away goals rule. Note: it will only appear if Match Type = 2nd leg
    AWAY_GOALS : 'AwayGoals',
    PENALTY_SHOOTOUT : 'PenaltyShootout',
    AFTER_EXTRA_TIME : 'AfterExtraTime',
    GOLDEN_GOAL : 'GoldenGoal',
    ABANDONED : 'Abandoned',
    POSTPONED : 'Postponed',
    VOID : 'Void',
    DELAYED : 'Delayed'
};


// given an array of matches, returns an array with the ids of the teams playing in the matches
function getTeamsIdsFromMatches (matches) {
    var teamsIds = [];

    for (var i = 0; i < matches.length; i++) {
        var docMatch = matches[i];

        teamsIds.push(docMatch.firstTeamId);
        teamsIds.push(docMatch.secondTeamId);
    }

    return teamsIds;
}


function isCupMatch (match) {
    return match.matchType === models.MatchType.CUP || match.matchType === models.MatchType.CUP_ENGLISH ||
        match.matchType === models.MatchType.CUP_GOLD || match.matchType === models.MatchType.CUP_SHORT;
}


exports.Match = Match;
exports.ResultType = ResultType;
exports.getTeamsIdsFromMatches = getTeamsIdsFromMatches;
exports.isCupMatch = isCupMatch;