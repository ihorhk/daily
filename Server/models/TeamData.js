var models = require('./index.js');

var TeamData = function (team) {
    if (team) {
        this.team = team;
    }
    else {
        this.team = new models.team.Team();
    }

    this.side = null;
    this.score = -1;
    this.shootOutScore = -1;

    this.formation_used = -1;
    this.goals_conceded = 0;

    this.bookings = [];
    this.goals = [];
    this.missedPenalties = [];
    this.matchPlayers = [];
    this.substitutions = [];
    this.penaltyShots = [];
};


exports.TeamData = TeamData;