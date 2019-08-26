var Team = function (uID) {
    this.uID = uID;

    this.country = null;
    this.name = null;
    this.teamManagerFirstName = null;
    this.teamManagerLastName = null;
    this.players = [];

    this.abbreviation = null;
    this.regionName = null;
    this.founded = -1;
    this.optasportsId = null;
};


Team.prototype.findPlayer = function (playerId) {
    for (var i = 0; i < this.players.length; i++) {
        if (this.players[i].uID === playerId) {
            return this.players[i];
        }
    }
};


exports.Team = Team;