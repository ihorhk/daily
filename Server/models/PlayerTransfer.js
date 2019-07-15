// this object represents a player being transferred FROM a team, without any specific info about the new team
var PlayerTransfer = function (player, isLoan, oldTeam) {
    this.player = player;
    this.isLoan = isLoan;
    this.oldTeam = oldTeam;

    this.newTeamName = null;
    this.joinDate = null;
    this.leaveDate = null;
};

exports.PlayerTransfer = PlayerTransfer;