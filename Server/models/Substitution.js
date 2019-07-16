var Substitution = function (eventID, period, reason, subOff, substitutePosition, minute) {
    this.eventID = eventID;
    this.period = period;
    this.reason = reason;
    this.subOff = subOff; // player out of the gam
    this.substitutePosition = substitutePosition;
    this.minute = minute;

    this.subOn = null;
    this.hasRetired = false; // true when a player has been forced from the field due to injury after their team has made all of their allocated substitutions
};

exports.Substitution = Substitution;