var Booking = function (player, card, isStraightRed, period, reason, minute, eventId) {
    this.player = player;
    this.card = card;
    this.isStraightRed = isStraightRed;
    this.period = period;
    this.reason = reason;
    this.minute = minute;
    this.eventID = eventId;
};


Booking.prototype.Card = {
    RED : 'Red',
    YELLOW : 'Yellow'
};


exports.Booking = Booking;