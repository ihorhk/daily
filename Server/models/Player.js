var Player = function (uID) {
    this.uID = uID;

    this.first = null;
    this.known = null;
    this.last = null;
    /*
     The position of the player can be different from the one that a player has in an actual match;
     for example if this player is a substitute in a match and the subposition attribute is specified,
     the position attribute in MatchPlayer will be 'Substitute' while the one here will indicate a position such as
     'Midfielder', 'Goalkeeper', etc.. On the other hand, if the subposition is not specified and the player is a 'Substitute',
     the position will be null;
     */
    this.position = null;
    this.team = null;
    this.salary = null;
    this.lastPlayedMatchId = null;

    this.stats = null; // stats such as height, weight, birth date, etc.
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