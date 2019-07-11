var MissedPenalty = function (player, eventID, period) {
    this.eventID = eventID;
    this.period = period;
    this.player = player;

    this.minute = -1; // appears only for regular play penalties, not for shoot-outs
};

exports.MissedPenalty = MissedPenalty;