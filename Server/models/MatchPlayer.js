var models = require('./index.js');

var MatchPlayer = function (player, position, subposition, shirtNumber, isCaptain) {
    this.player = player;
    this.position = position;
    this.subposition = subposition; // position in which a substitute should play once he's on the field, can be undefined even if the player is a substitute
    this.shirtNumber = shirtNumber;
    this.isCaptain = isCaptain;

    this.stats = new models.stats.Stats();
    this.formationPlace = -1;
    this.points = 0; // total points scored by the player in the match
    this.actions = []; // the actions are stored as PlayerAction objects, the position in the array is defined by the index field of the related Action
};


MatchPlayer.prototype.calculateActionAndIncreasePoints = function (action, playerPosition, teamData, isMatchFinished) {
    var count = action.countFunction(this.stats, teamData, isMatchFinished);

    if (!count) return 0;

    var playerAction = new models.playerAction.PlayerAction(action, count);
    playerAction.calculatePointsForPosition(playerPosition);

    if (playerAction.totalPoints === 0) return 0;

    this.points += playerAction.totalPoints;
    this.actions[action.index] = playerAction;

    //logger.debug('points for '+action.name + ': '+points);
};


MatchPlayer.prototype.isSubstitute = function () {
    if (this.subposition) {
        return true;
    }

    return this.position === models.PlayerPosition.SUBSTITUTE;
};


MatchPlayer.prototype.equals = function (otherPlayer) {
    if (!otherPlayer || !(otherPlayer instanceof MatchPlayer))
        return false;

    return this.player.equals(otherPlayer);
};


exports.MatchPlayer = MatchPlayer;