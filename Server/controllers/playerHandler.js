var db = require('../db/dbManager');


function getPlayerStatsHistory (req, res) {
    const playerId = req.query.playerId;
    const competitionId = req.query.competitionId;
    const teamId = req.query.teamId;

    if (!playerId || !competitionId || !teamId) {
        res.status(400).send();
        return;
    }

    db.getMatchesStatsHistoryForPlayer(playerId, teamId, competitionId, function (err, playerActions) {
        if (err) {
            res.status(501).send(err);
            return;
        }

        if (!playerActions) {
            res.status(404).send();
            return;
        }

        res.status(200).send(playerActions);
    })
}


exports.getPlayerStatsHistory = getPlayerStatsHistory;
