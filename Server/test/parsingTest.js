var fs = require('fs');
var feedManager = require('../controllers/feedManager.js');
var logger = require('../util/logger.js');
var should = require('should');
var models = require('../models/index.js');
var dbManager = require('../db/dbManager');
var helper = require('../util/helper');

require('../db/Database.js').initDB(function () {
    dbManager.getCurrentSeasonId(function (err, seasonId) {
        helper.setCurrentSeasonId(seasonId);

        var f9file = (process.cwd() + '/mock_matches/802530/95');
        logger.debug('Testing F9 parsing on ' + f9file);
        feedManager.handleFeed(f9file, parsingCompletedF9);

        //var f1file = (process.cwd() + '/test_feeds/f1feedTest.xml');
        //logger.debug('Testing F1 parsing on ' + f1file);
        //feedManager.handleFeed(f1file, parsingCompletedF1);
        //
        //var f40file = (process.cwd() + '/test_feeds/f40feedTest.xml');
        //logger.debug('Testing F40 parsing on ' + f40file);
        //feedManager.handleFeed(f40file, parsingCompletedF40);
    });
});


var IS_TEST_ENABLED = false;


function parsingCompletedF9 (feedFormat, match, err) {
    if (!IS_TEST_ENABLED) return;

    if (err) {
        logger.error('F9 parsing test failed! Err: '+err);
        return;
    }

    logger.debug('F9 parsing completed, checking validity');

    match.should.have.property('competition');
    match.competition.should.have.property('uID').which.is.a.String;
    match.competition.should.have.property('name').which.is.a.String;
    match.competition.should.have.property('country').which.is.a.String;

    match.should.have.property('teamsData').which.is.an.Array;

    match.teamsData.should.have.lengthOf(2);

    for (var i = 0; i < 2; i++) {
        var teamData = match.teamsData[i];
        teamData.should.have.property('side').which.is.a.String;
        teamData.should.have.property('score').which.is.an.Int;
        teamData.should.have.property('shootOutScore');
        teamData.should.have.property('bookings').which.is.an.Array;
        teamData.should.have.property('substitutions').which.is.an.Array;
        //teamData.should.have.property('stats').which.is.an.Array;
        teamData.should.have.property('formation_used').which.is.an.Int;

        teamData.should.have.property('team').which.is.an.instanceOf(models.team.Team);
        var team = teamData.team;
        team.should.have.property('uID').which.is.a.String;
        team.should.have.property('country').which.is.a.String;
        team.should.have.property('name').which.is.a.String;
        team.should.have.property('teamManagerFirstName').which.is.a.String;
        team.should.have.property('teamManagerLastName').which.is.a.String;
        team.should.have.property('players').which.is.an.Array;

        for (var playerId in team.players) {
            var player = team.players[playerId];
            player.should.have.property('first').which.is.a.String;
            player.should.have.property('last').which.is.a.String;
            player.should.have.property('team').which.is.an.instanceOf(models.team.Team);
        }


        for (var j = 0; j < teamData.bookings.length; j++) {
            var booking = teamData.bookings[j];
            booking.should.have.property('player').which.is.an.instanceOf(models.player.Player);
            booking.should.have.property('card').which.is.a.String;
            booking.should.have.property('isStraightRed').which.is.a.Boolean;
            booking.should.have.property('period').which.is.a.String;
            booking.should.have.property('minute').which.is.an.Int;
            booking.minute.should.be.greaterThan(-1);
            booking.should.have.property('reason').which.is.a.String;
            booking.should.have.property('eventID').which.is.a.String;
        }

        for (j = 0; j < teamData.goals.length; j++) {
            var goal = teamData.goals[j];
            goal.should.have.property('eventID').which.is.a.String;
            goal.should.have.property('minute').which.is.an.Int;
            goal.minute.should.be.greaterThan(-1);
            goal.should.have.property('period').which.is.a.String;
            goal.should.have.property('player').which.is.an.instanceOf(models.player.Player);
            goal.should.have.property('timeStamp').which.is.a.Date;
            goal.should.have.property('type').which.is.a.String;
        }

        for (j = 0; j < teamData.missedPenalties.length; j++) {
            var missedPenalty = teamData.missedPenalties[j];
            missedPenalty.should.have.property('eventID').which.is.a.String;
            missedPenalty.should.have.property('minute').which.is.an.Int;
            missedPenalty.should.have.property('period').which.is.a.String;
            missedPenalty.should.have.property('player').which.is.an.instanceOf(models.player.Player);
        }

        for (j = 0; j < teamData.matchPlayers.length; j++) {
            var matchPlayer = teamData.matchPlayers[j];
            matchPlayer.should.have.property('player').which.is.an.instanceOf(models.player.Player);
            matchPlayer.should.have.property('position').which.is.a.String;
            matchPlayer.should.have.property('shirtNumber').which.is.a.String;
            matchPlayer.should.have.property('isPlayingFromStart').which.is.a.Boolean;
            matchPlayer.should.have.property('isCaptain').which.is.a.Boolean;
            matchPlayer.should.have.property('stats').which.is.an.instanceOf(models.stats.Stats);
            matchPlayer.should.have.property('formationPlace').which.is.an.Int;

            var player = matchPlayer.player;
            player.should.have.property('first').which.is.a.String;
            player.should.have.property('last').which.is.a.String;
            //player.should.have.property('position').which.is.a.String;
        }

        for (j = 0; j < teamData.substitutions.length; j++) {
            var substitution = teamData.substitutions[j];
            substitution.should.have.property('eventID').which.is.a.String;
            substitution.should.have.property('period').which.is.a.String;
            substitution.should.have.property('reason').which.is.a.String;
            substitution.should.have.property('subOff').which.is.an.instanceOf(models.player.Player);
            //substitution.should.have.property('subOn').which.is.an.instanceOf(models.player.Player);
            substitution.should.have.property('substitutePosition').which.is.a.String;
        }

        for (j = 0; j < teamData.penaltyShots.length; j++) {
            var penaltyShot = teamData.penaltyShots[j];
            penaltyShot.should.have.property('eventID').which.is.a.String;
            penaltyShot.should.have.property('outcome').which.is.a.String;
            penaltyShot.should.have.property('player').which.is.an.instanceOf(models.player.Player);
            penaltyShot.should.have.property('timeStamp').which.is.a.Date;
        }
    }

    match.should.have.property('matchOfficial');
    match.matchOfficial.should.have.property('uID').which.is.a.String;
    match.matchOfficial.should.have.property('first').which.is.a.String;
    match.matchOfficial.should.have.property('last').which.is.a.String;

    match.should.have.property('uID').which.is.a.String;
    match.should.have.property('attendance').which.is.an.Int;
    match.should.have.property('date').which.is.a.Date;
    match.should.have.property('matchType').which.is.a.String;
    match.should.have.property('period').which.is.a.String;
    match.should.have.property('timeStamp').which.is.a.Date;
    match.should.have.property('match_time').which.is.not.equal(-1);
    //match.should.have.property('first_half_time').which.is.not.equal(-1);
    //match.should.have.property('second_half_time').which.is.not.equal(-1);
    //match.should.have.property('matchDay').which.is.not.equal(-1);
    //match.should.have.property('resultType').which.is.a.String;
    match.should.have.property('seasonName').which.is.a.String;
    //match.should.have.property('winner').which.is.an.instanceOf(models.team.Team);
    match.should.have.property('venue').which.is.an.instanceOf(models.venue.Venue);

    match.venue.should.have.property('name').which.is.a.String;
    match.venue.should.have.property('country').which.is.a.String;
    match.venue.should.have.property('uID').which.is.a.String;
}


function parsingCompletedF1 (feedFormat, competition, err) {
    if (!IS_TEST_ENABLED) return;

    if (err) {
        logger.error('F1 parsing test failed! Err: '+err);
        return;
    }

    competition.should.have.property('matches').which.is.an.Array;

    var matches = competition.matches;

    logger.debug('F1 parsing completed, checking validity');

    for (var matchId in matches) {
        var match = matches[matchId];

        match.should.have.property('competition').which.is.an.instanceOf(models.competition.Competition);

        match.competition.should.have.property('uID').which.is.a.String;
        match.competition.should.have.property('name').which.is.a.String;
        match.competition.should.have.property('teams').which.is.an.Array;
        match.competition.teams.should.not.have.lengthOf(0);

        match.should.have.property('seasonName').which.is.a.String;
        match.should.have.property('date').which.is.a.Date;
        match.should.have.property('timeStamp').which.is.a.Date;
        match.should.have.property('matchDay').which.is.not.equal(-1);
        match.should.have.property('matchType').which.is.a.String;
        match.should.have.property('period').which.is.a.String;
        match.should.have.property('winner');
        match.should.have.property('venue').which.is.an.instanceOf(models.venue.Venue);

        match.teamsData.should.have.lengthOf(2);

        for (var j = 0; j < 2; j++) {
            var teamData = match.teamsData[j];

            teamData.should.have.property('side').which.is.a.String;
            teamData.should.have.property('score').which.is.not.equal(-1);
            teamData.should.have.property('team').which.is.an.instanceOf(models.team.Team);
            var team = teamData.team;
            team.should.have.property('uID').which.is.a.String;
            team.should.have.property('name').which.is.a.String;
        }
    }
}


function parsingCompletedF40 (feedFormat, competition, err) {
    if (!IS_TEST_ENABLED) return;

    if (err) {
        logger.error('F40 parsing test failed! Err: '+err);
        return;
    }

    logger.debug('F40 parsing completed, checking validity');

    competition.should.have.property('uID').which.is.a.String;
    competition.should.have.property('name').which.is.a.String;
    competition.should.have.property('teams').which.is.an.Array;

    for (var teamId in competition.teams) {
        var team = competition.teams[teamId];

        team.should.have.property('uID').which.is.a.String;
        team.should.have.property('country').which.is.a.String;
        team.should.have.property('name').which.is.a.String;
        team.should.have.property('regionName').which.is.a.String;
        team.should.have.property('shortName').which.is.a.String;
        team.should.have.property('teamManagerFirstName').which.is.a.String;
        team.should.have.property('teamManagerLastName').which.is.a.String;
        team.should.have.property('founded').which.is.an.Int;
        team.founded.should.not.equal(-1);

        var playersAreEmpty = true;

        for (var playerId in team.players) {
            playersAreEmpty = false;

            var player = team.players[playerId];

            player.should.have.property('first').which.is.a.String;
            player.should.have.property('last').which.is.a.String;
            player.should.have.property('position').which.is.a.String;
        }

        playersAreEmpty.should.be.false;
    }

    competition.should.have.property('playersTransfers').which.is.an.Array;
    competition.playersTransfers.should.not.have.lengthOf(0);

    for (var i = 0; i < competition.playersTransfers.length; i++) {
        var playerTransfer = competition.playersTransfers[i];

        playerTransfer.should.have.property('joinDate').which.is.a.Date;
        playerTransfer.should.have.property('leaveDate').which.is.a.Date;
        playerTransfer.should.have.property('player').which.is.an.instanceOf(models.player.Player);
        playerTransfer.should.have.property('oldTeam').which.is.an.instanceOf(models.team.Team);
        playerTransfer.should.have.property('newTeamName').which.is.a.String;
    }
}