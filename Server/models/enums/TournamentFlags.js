var TournamentFlags = {
    FEATURED : 'FEATURED',
    GUARANTEED : 'GUARANTEED',
    MULTI_ENTRY : 'MULTI_ENTRY'
};


function getTournamentFlagsToString() {
    return {
        FEATURED : 'Featured',
        GUARANTEED : 'Guaranteed',
        MULTI_ENTRY : 'Multi-Entry'
    }
}


exports.TournamentFlags = TournamentFlags;
exports.getTournamentFlagsToString = getTournamentFlagsToString;