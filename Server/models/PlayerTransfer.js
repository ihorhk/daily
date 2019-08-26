
var PlayerTransfer = function (player, isLoan, oldTeam) {
    this.player = player;
    this.isLoan = isLoan;
    this.oldTeam = oldTeam;

    this.newTeamName = null;
    this.joinDate = null;
    this.leaveDate = null;
};

exports.PlayerTransfer = PlayerTransfer;