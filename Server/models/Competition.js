var Competition = function () {
    this.uID = null;
    this.country = null;
    this.name = null;
    this.teams = []; // sparse array: teamId -> team
    this.playersTransfers = null;
    this.matches = []; // sparse array: matchId -> match
};


exports.Competition = Competition;