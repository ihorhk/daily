var Goal = function (player, eventID, period, minute, timeStamp, type) {
    this.player = player;
    this.eventID = eventID;
    this.period = period;
    this.minute = minute;
    this.timeStamp = timeStamp;
    this.type = type;

    // players from which the assist is received
    this.assist = null;
    this.secondAssist = null;

    this.isSoloRun = false;
};


var Type = {
    GOAL : 'Goal',
    OWN : 'Own',
    PENALTY : 'Penalty'
};


exports.Goal = Goal;
exports.Type = Type;