var MissedPenalty = function (player, eventID, period) {
    this.eventID = eventID;
    this.period = period;
    this.player = player;

    this.minute = -1;
};

exports.MissedPenalty = MissedPenalty;