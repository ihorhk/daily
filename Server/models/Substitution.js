var Substitution = function (eventID, period, reason, subOff, substitutePosition, minute) {
    this.eventID = eventID;
    this.period = period;
    this.reason = reason;
    this.subOff = subOff;
    this.substitutePosition = substitutePosition;
    this.minute = minute;

    this.subOn = null;
    this.hasRetired = false;
};

exports.Substitution = Substitution;