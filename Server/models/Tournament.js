var moment = require('moment');
var TournamentFlags = require('./enums/TournamentFlags').TournamentFlags;
var PlayMode = require('./enums/PlayMode').PlayMode;
var helper = require('../util/helper');

var RAKE = 0.1;
var MAX_MULTI_ENTRIES = 42;
var FREE_TOURNAMENTS_ENTRY_FEE_MULTIPLIER = 50;


var Tournament = function (name, summary, type, subtype, flags, entryFee, maxEntries, guaranteedPrize, startDate, lineupSize, isOpen, multiEntries, salaryCap, slate) {
    if (typeof flags === 'string') {
        flags = flags.split(',');
    }

    this.name = name;
    this.summary = summary;
    this.type = type;
    this.subtype = subtype;
    this.flags = flags;
    this.entryFee = parseFloat(entryFee);
    this.maxEntries = maxEntries ? parseInt(maxEntries) : -1;
    this.guaranteedPrize = parseFloat(guaranteedPrize);
    this.startDate = startDate;
    this.lineupSize = parseInt(lineupSize);
    this.isOpen = (isOpen === 'true' || isOpen === 'TRUE' || isOpen === true);
    this.slate = slate;
    this.multiEntries = (!multiEntries || multiEntries < 1) ? 0 : parseInt(multiEntries);
    this.salaryCap = salaryCap;

    this.tournamentId = null;
    this.slateId = null;
    this.isMock = false;
    this.playMode = PlayMode.REAL;
    this.entries = null;
    this.entriesCount = 0;
    this.userEntriesCount = 0;
    this.payouts = null;
    this.payoutsEntriesNumber = 0;
    this.totalPrize = -1;
    this.rake = 0;
    this.isCancelled = false;
    this.groupId = null;
    this.copyNumber = 0;
    this.programmedId = null;
    this.progress = 0;
};


Tournament.prototype.isMultiEntry = function () {
    return this.flags && this.flags.indexOf(TournamentFlags.MULTI_ENTRY) >= 0;
};


Tournament.prototype.isFeatured = function () {
    return this.flags && this.flags.indexOf(TournamentFlags.FEATURED) >= 0;
};


Tournament.prototype.hashCode = function () {
    return helper.generateHashCodeForString(this.name) * (this.entryFee + this.maxEntries) + Math.round(this.startDate.valueOf() / 1000);
};


function payoutsToString (payouts) {
    if (!payouts) return null;

    var s = '';

    for (var i = 0; i < payouts.length; i++) {
        s += payouts[i].toString();

        if (i !== payouts.length - 1) {
            s += ',';
        }
    }

    return s;
}


function flagsToString (flags) {
    if (!flags) return null;

    var s = '';

    for (var i = 0; i < flags.length; i++) {
        s += flags[i].toString();

        if (i !== flags.length - 1) {
            s += ',';
        }
    }

    return s;
}


function parsePayoutsFromString (s) {
    var arr = s.split(',');
    for (var i = 0; i < arr.length; i++) {
        arr[i] = parseFloat(arr[i]);
    }
    return arr;
}


function getTournamentOpeningTime (tournament) {
    var openingTime = moment(tournament.startDate);
    return openingTime.add(-7, 'd').toDate();
}


function isTournamentFreePlayMode (tournament) {
    return tournament.playMode === PlayMode.FREE;
}


function createPlayersDocFromTournamentPlayersString (playersString) {
    var playersArr = playersString.split(',');
    playersArr = playersArr.splice(0, playersArr.length - 1);
    var playersDoc = {};

    for (var i = 0; i < playersArr.length; i++) {
        var arr = playersArr[i].split('%');

        var playerDoc = {
            playerId : arr[0],
            name : arr[1],
            position : arr[2]
        };

        if (arr.length > 3) {
            playerDoc.optasportsId = arr[3];
        }

        playersDoc[playerDoc.playerId] = playerDoc;
    }

    return playersDoc;
}


exports.Tournament = Tournament;
exports.getTournamentOpeningTime = getTournamentOpeningTime;
exports.payoutsToString = payoutsToString;
exports.flagsToString = flagsToString;
exports.parsePayoutsFromString = parsePayoutsFromString;
exports.isTournamentFreePlayMode = isTournamentFreePlayMode;
exports.createPlayersDocFromTournamentPlayersString = createPlayersDocFromTournamentPlayersString;

exports.RAKE = RAKE;
exports.MAX_MULTI_ENTRIES = MAX_MULTI_ENTRIES;
exports.FREE_TOURNAMENTS_ENTRY_FEE_MULTIPLIER = FREE_TOURNAMENTS_ENTRY_FEE_MULTIPLIER;
exports.TEAM_FORMATIONS_7P = [
    { GK : 1, DEF : 3, MID : 2, ATT : 1 },
    { GK : 1, DEF : 3, MID : 1, ATT : 2 },
    { GK : 1, DEF : 2, MID : 2, ATT : 2 },
    { GK : 1, DEF : 2, MID : 3, ATT : 1 }
];
exports.TEAM_FORMATIONS_11P = [
    { GK : 1, DEF : 4, MID : 3, ATT : 3 },
    { GK : 1, DEF : 4, MID : 4, ATT : 2 },
    { GK : 1, DEF : 3, MID : 5, ATT : 2 },
    { GK : 1, DEF : 5, MID : 4, ATT : 1 }
];