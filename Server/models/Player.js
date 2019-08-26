var Player = function (uID) {
    this.uID = uID;

    this.first = null;
    this.known = null;
    this.last = null;
    this.position = null;
    this.team = null;
    this.salary = null;
    this.lastPlayedMatchId = null;

    this.stats = null;
    this.jerseyNum = null;
    this.optasportsId = null;
};


Player.prototype.getName = function () {
    return this.known || this.first + ' ' + this.last;
};


Player.prototype.equals = function (otherPlayer) {
    if (!otherPlayer || !(otherPlayer instanceof Player))
        return false;

    return this.uID === otherPlayer.uID;
};


exports.Player = Player;