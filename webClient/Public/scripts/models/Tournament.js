window.GK_POS = 'GK';
window.DEF_POS = 'DEF';
window.MID_POS = 'MID';
window.ATT_POS = 'ATT';
window.ALL_POS = 'ALL';
window.POSITIONS = [ GK_POS, DEF_POS, MID_POS, ATT_POS ];

window.TEAM_FORMATIONS_7P = [
    { GK : 1, DEF : 3, MID : 2, ATT : 1 },
    { GK : 1, DEF : 3, MID : 1, ATT : 2 },
    { GK : 1, DEF : 2, MID : 2, ATT : 2 },
    { GK : 1, DEF : 2, MID : 3, ATT : 1 }
];

window.TEAM_FORMATIONS_11P = [
    { GK : 1, DEF : 4, MID : 3, ATT : 3 },
    { GK : 1, DEF : 4, MID : 4, ATT : 2 },
    { GK : 1, DEF : 3, MID : 5, ATT : 2 },
    { GK : 1, DEF : 5, MID : 4, ATT : 1 }
];

window.TOURNAMENT_STATE_PREMATCH = 'prematch';
window.TOURNAMENT_STATE_LIVE = 'live';
window.TOURNAMENT_STATE_HISTORY = 'history';

function getTournamentState (tournament) {
    if (!tournament.isActive && !tournament.isOpen) {
        return TOURNAMENT_STATE_HISTORY;
    }
    else if (tournament.isActive) {
        return TOURNAMENT_STATE_LIVE;
    }
    else {
        return TOURNAMENT_STATE_PREMATCH;
    }
}


function addEntryToTournament (tournament, entry, username) {
    if (tournament.entries) {
        tournament.entries.push(entry);
    }
    else {
        tournament['entries'] = [entry];
    }

    if (tournament.entriesCount) {
        tournament.entriesCount++;
    }
    else {
        tournament.entriesCount = 1;
    }

    if (username && entry.username === username) {
        if (tournament.userEntriesCount) {
            tournament.userEntriesCount++;
        }
        else {
            tournament.userEntriesCount = 1;
        }
    }
}


function removeEntryFromTournament (tournament, entryId, entryUsername, username) {
    if (tournament.entries) {
        for (var i = 0; i < tournament.entries.length; i++) {
            var entry = tournament.entries[i];
            if (entry.entryId === entryId) {
                tournament.entries.splice(i, 1);
                break;
            }
        }
    }

    if (tournament.entriesCount) {
        tournament.entriesCount--;
    }
    else {
        tournament.entriesCount = 0;
    }

    if (entryUsername && username && entryUsername === username) {
        if (tournament.userEntriesCount) {
            tournament.userEntriesCount--;
        }
        else {
            tournament.userEntriesCount = 0;
        }
    }
}


function formatEntryCount (entries, maxEntries) {
    return entries + ((maxEntries && maxEntries > 0) ? ('/' + maxEntries) : '');
}


function formatLobbyEntryCount (tournament) {
    return tournament.entriesCount + ((tournament.type === "HEAD_TO_HEAD") ? ('/' + tournament.maxEntries) : '');
}


function getTournamentTeamWithId (tournament, teamId) {
    if (!teamId) return null;

    for (var i = 0; i < tournament.slate.teams.length; i++) {
        var team = tournament.slate.teams[i];

        if (teamId === team.teamId) {
            return team;
        }
    }

    return null;
}


function isTournamentFeatured (tournament) {
    return tournament.flags && tournament.flags.indexOf('FEATURED') >= 0;
}


function isTournamentFreePlayMode (tournament) {
    return tournament.playMode === PLAY_MODE.FREE;
}


function parsePlayerInfo (s) {
    if (!s || s.length === 0) return null;

    var arr = s.split('%');

    return {
        id : arr[0],
        name : arr[1],
        position : arr[2],
        optasportsId : arr[3]
    };
}


function competitionIdsFromTournament (tournament) {
    var matches = tournament.slate ? tournament.slate.matches : tournament.matches;

    var ids = matches.map(function(match, index) {
        return match.competitionId;
    });
    
    return $.unique(ids);
}


function formatFormation (formation) {
    return formation[GK_POS] + '-' + formation[DEF_POS] + '-' + formation[MID_POS] + '-' + formation[ATT_POS];
}


function logoForTournament (tournament, logoSize) {
    var competitionId;
    var hasMultipleCompetitions = false;

    if (tournament.competitionsIds) {
        for (var c = 0; c < tournament.competitionsIds.length; c++) {
            var matchCompetitionId = tournament.competitionsIds[c];

            if (!competitionId) {
                competitionId = matchCompetitionId;
            }
            else if (competitionId !== matchCompetitionId) {
                hasMultipleCompetitions = true;
                break;
            }
        }
    }
    else {
        var matches = tournament.slate ? tournament.slate.matches : tournament.matches;
        for (var m = 0; m < matches.length; m++) {
            matchCompetitionId = matches[m].competitionId;

            if (!competitionId) {
                competitionId = matchCompetitionId;
            }
            else if (competitionId !== matchCompetitionId) {
                hasMultipleCompetitions = true;
                break;
            }
        }
    }

    if (hasMultipleCompetitions) {
        return '/icongraphy/svg/flags/European-Union.svg';
    }

    return logoForCompetition(competitionId, logoSize);
}