var db = require('../db/dbManager.js');
var xlsx = require('xlsx');


function setTeamsShortNamesAndAbbreviationsFromFile (file) {
    var file = xlsx.readFile(file);
    var sheet = file.Sheets['Sheet 1'];
    var fileTeams = {};
    var hasMoreTeams = true;
    var ind = 3;

    while (hasMoreTeams) {
        var teamIdCol = sheet['B' + ind];
        var shortNameCol = sheet['D' + ind];
        var abbrCol = sheet['E' + ind];

        if (!teamIdCol) {
            hasMoreTeams = false;
            break;
        }

        if (!shortNameCol || !abbrCol) {
            ind++;
            continue;
        }

        var teamId = teamIdCol.w;

        if (teamId) {
            fileTeams[teamId] = {teamId : teamId, shortName : shortNameCol.w, abbreviation : abbrCol.w};
        }

        ind++;
    }

    db.getAllCompetitions(function (err, competitions) {

        for (var c = 0; c < competitions.length; c++) {
            var competition = competitions[c];

            for (var t = 0; t < competition.teams.length; t++) {
                var competitionTeam = competition.teams[t];
                var fileTeam = fileTeams[competitionTeam.teamId];

                if (!fileTeam) continue;

                competitionTeam.name = fileTeam.shortName;
                competitionTeam.abbreviation = fileTeam.abbreviation;

                delete competitionTeam.shortName;
            }

            db.updateCompetitionTeamsWithDoc(competition.competitionId, competition.teams);
        }

    }, true)
}


exports.setTeamsShortNamesAndAbbreviationsFromFile = setTeamsShortNamesAndAbbreviationsFromFile;