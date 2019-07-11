var PenaltyShot = function (eventID, outcome, player, timeStamp) {
    this.eventID = eventID;
    this.outcome = outcome;
    this.player = player;
    this.timeStamp = timeStamp;
};

var Outcome = {
    SCORED : 'Scored',
    MISSED : 'Missed',
    SAVED : 'Saved'
};

exports.PenaltyShot = PenaltyShot;
exports.Outcome = Outcome;