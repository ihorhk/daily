var models = require('../models/index.js');
var db = require('../db/dbManager.js');
var dbHelper = require('../db/docHelper.js');
var logger = require('../util/logger.js');
var moment = require('moment');
var scheduler = require('node-schedule');
var fs = require('fs');
var feedManager = require('./feedManager.js');
var tournamentsController = require('./tournamentsController.js');
var extend = require('util')._extend;
var constants = require('../util/constants');
var lock = require('../util/lock');
var stripJsonComments = require('strip-json-comments');

var MOCK_MATCHES_DELAY_MINUTES = 30; // delay between matches
var COPIES_OF_NON_FEATURED_TOURNAMENT_CREATED_BY_DEFAULT = 1;
var PROGRAMMED_TOURNAMENTS_TIME_ZONE_DIFFERENCE = 60; // tours are defined GMT+1
var MIN_MATCHES_PER_SLATE = 2;
var SUPPORTED_LEAGUES = [ '24','361','21','231','22','6','352','362','331','354','9','259','23','18','38','541','168','1','395','2','5','8' ];

var PROGRAMMED_TOURNAMENTS_SET_TYPES = {
    CUSTOM : 'CUSTOM',
    SINGLE_LEAGUE : 'SINGLE_LEAGUE',
    ALL_LEAGUES : 'ALL_LEAGUES'
};

function init (upcomingTournaments) {

    programTournaments(upcomingTournaments);

    // schedule tournament programmer every day
    var rule = new scheduler.RecurrenceRule();
    rule.hour = 3;
    rule.minute = 0;

    scheduler.scheduleJob(rule, function () {
        db.getUpcomingTournaments(function (err, tournaments) {
            if (err) {
                logger.error('Failed to program tournaments: ' + err);
                return;
            }

            programTournaments(tournaments)

        }, false, false, false, null, null, true, true);
    });
}


function programTournaments (upcomingTournaments) {

    db.getUpcomingCompetitionMatches(SUPPORTED_LEAGUES, function (err, competitions) {
        if (err) return;

        logger.info('Programming upcoming tournaments if necessary.');

        var programmedTournaments = readProgrammedTournamentsFromJSON();
        var tournaments = this;

        // sort matches and find the first one. Also set the competition id to each match
        for (var i = 0; i < competitions.length; i++) {
            var competition = competitions[i];
            var matches = competition.matches;

            for (var m = 0; m < matches.length; m++) {
                matches[m].competitionId = competition.competitionId;
            }

            competitions[i].matches = matches.sort(function (m1, m2) {
                return m1.startDate - m2.startDate;
            })
        }

        var firstMatchDate;
        for (i = 0; i < competitions.length; i++) {
            var competitionFirstMatch = competitions[i].matches[0];

            if (!competitionFirstMatch) continue;

            if (!firstMatchDate) {
                firstMatchDate = competitionFirstMatch.startDate;
            }
            else if (firstMatchDate > competitionFirstMatch.startDate) {
                firstMatchDate = competitionFirstMatch.startDate;
            }
        }

        firstMatchDate = moment(firstMatchDate);

        // create tournaments for the next 7 days of the week
        for (i = 0; i < 7; i++) {
            var date = firstMatchDate.add((i === 0 ? 0 : 1), 'd').toDate();
            programTournamentsForDay(date, competitions, programmedTournaments, tournaments);
        }

    }.bind(upcomingTournaments));
}


function readProgrammedTournamentsFromJSON () {
    var json = fs.readFileSync(constants.PROGRAMMED_TOURNAMENTS_FILE, 'utf8');
    return JSON.parse(stripJsonComments(json));
}


/*
Finds the matches that are contained within the time frame for every programmed tournament, starting on the date passed as a parameter.
 */
function programTournamentsForDay (date, competitions, programmedTournamentsSet, upcomingTournaments) {
    var todayWeekDay = moment().day();
    var timezoneOffset = -(date.getTimezoneOffset() + PROGRAMMED_TOURNAMENTS_TIME_ZONE_DIFFERENCE); // programmed tournaments are defined on GMT + 1
    var tournamentsToBeCreated = [];

    for (var i = 0; i < programmedTournamentsSet.length; i++) {
        var programmedTournamentsEntry = programmedTournamentsSet[i];
        var setType = programmedTournamentsEntry.setType;

        if (!setType || (setType !== PROGRAMMED_TOURNAMENTS_SET_TYPES.CUSTOM && setType !== PROGRAMMED_TOURNAMENTS_SET_TYPES.SINGLE_LEAGUE
                                                    && setType !== PROGRAMMED_TOURNAMENTS_SET_TYPES.ALL_LEAGUES)) {
            logger.error('Skipping programmed set without valid setType');
            continue;
        }

        for (var j = 0; j < programmedTournamentsEntry.tournaments.length; j++) {
            var programmedTournament = programmedTournamentsEntry.tournaments[j];

            // calculate time range for programmed tournament
            var minDate = moment(date);
            var maxDate = moment(date);
            minDate.seconds(0);
            maxDate.seconds(0);

            // start day and end day have priority over "weekDays"
            if (programmedTournament.startDay && programmedTournament.endDay) {
                var startDay = moment(programmedTournament.startDay, 'ddd').day();
                var endDay = moment(programmedTournament.endDay, 'ddd').day();

                if (startDay !== minDate.day()
                    || (startDay < endDay && (todayWeekDay <= endDay && todayWeekDay >= startDay))
                    || (startDay > endDay && (todayWeekDay >= startDay || todayWeekDay <= endDay))) continue;

                var daysDifference = (endDay > startDay) ? (endDay - startDay) : (7 - startDay + endDay);
                maxDate.add(daysDifference, 'd');
            }
            else if (programmedTournament.weekDays) {
                var dateWeekDay = minDate.day();
                var isValidDay = false;

                for (var d = 0; d < programmedTournament.weekDays.length; d++) {
                    if (dateWeekDay === moment(programmedTournament.weekDays[d], 'ddd').day()) {
                        isValidDay = true;
                        break;
                    }
                }
                if (!isValidDay || dateWeekDay === todayWeekDay) continue;
            }

            if (!programmedTournament.isMock) {
                var minStartTime = moment(programmedTournament.minStartTime, 'hh:mm');
                var maxStartTime = moment(programmedTournament.maxStartTime, 'hh:mm');
                minDate.hours(minStartTime.hours());
                maxDate.hours(maxStartTime.hours());
                minDate.minutes(minStartTime.minutes());
                maxDate.minutes(maxStartTime.minutes());
                minDate.add(timezoneOffset, 'm');
                maxDate.add(timezoneOffset, 'm');
            }

            if (!programmedTournament.programmedId) {
                logger.error('Skipping programmed tournament without programmedId: ' + programmedTournament.name);
                continue;
            }
            if (programmedTournament.isMock) {
                logger.error('Skipping MOCK programmed tournament - not supported');
                continue;
            }

            programmedTournament.setType = setType;

            var tournamentMatches = [];
            var tournamentCompetitions = [];
            var teamsToCompetitions = [];

            switch (setType) {
                case PROGRAMMED_TOURNAMENTS_SET_TYPES.ALL_LEAGUES:
                case PROGRAMMED_TOURNAMENTS_SET_TYPES.CUSTOM:
                    // find the matches that are enclosed in the time frame of the programmed tournament
                    for (var k = 0; k < competitions.length; k++) {
                        var competition = competitions[k];
                        var competitionId = competition.competitionId;

                        if (setType !== PROGRAMMED_TOURNAMENTS_SET_TYPES.CUSTOM || programmedTournamentsEntry.competitions.indexOf(competitionId) >= 0) {
                            getMatchesValidForTimeframe(competition, tournamentCompetitions, tournamentMatches, teamsToCompetitions, minDate, maxDate);
                        }
                    }

                    handleProgrammedTournamentCreation(programmedTournament, minDate, maxDate, tournamentCompetitions, tournamentMatches, teamsToCompetitions,
                                                                                        upcomingTournaments, tournamentsToBeCreated);
                    break;

                case PROGRAMMED_TOURNAMENTS_SET_TYPES.SINGLE_LEAGUE:
                    // create a tournament for every league
                    for (k = 0; k < competitions.length; k++) {
                        competition = competitions[k];
                        competitionId = competition.competitionId;

                        tournamentMatches = [];
                        tournamentCompetitions = [];
                        teamsToCompetitions = [];

                        if (setType !== PROGRAMMED_TOURNAMENTS_SET_TYPES.CUSTOM || programmedTournamentsEntry.competitions.indexOf(competitionId) >= 0) {
                            getMatchesValidForTimeframe(competition, tournamentCompetitions, tournamentMatches, teamsToCompetitions, minDate, maxDate);

                            // set name and programmedId specific for the competition
                            var tourCopy = extend({}, programmedTournament);
                            tourCopy.name = tourCopy.name.replace('%s', competition.name);
                            tourCopy.programmedId = tourCopy.programmedId.replace('%s', competition.competitionId);
                            handleProgrammedTournamentCreation(tourCopy, minDate, maxDate, tournamentCompetitions, tournamentMatches, teamsToCompetitions,
                                                                        upcomingTournaments, tournamentsToBeCreated);
                        }
                    }
                    break;
            }
        }
    }

    processTournamentsCreationForDay(tournamentsToBeCreated);
}


function processTournamentsCreationForDay(tournamentsToBeCreated) {

    var allTeamsToCompetitions = [];

    for (var t = 0; t < tournamentsToBeCreated.length; t++) {
        var obj = tournamentsToBeCreated[t];
        var tournament = obj.tournament;
        var isCreationAllowed = true;

        if (tournament.createOnlyIfTournamentIsPresent) {
            var necessaryTournament = tournament.createOnlyIfTournamentIsPresent.replace('%s', obj.competitions[0].competitionId);
            var tourDate = moment(tournament.startDate);
            isCreationAllowed = false;

            for (var w = 0; w < tournamentsToBeCreated.length; w++) {
                if (w === t) continue;

                var otherTournament = tournamentsToBeCreated[w].tournament;
                if (otherTournament.programmedId === necessaryTournament && tourDate.isSame(otherTournament.startDate, 'day')) {
                    isCreationAllowed = true;
                    break;
                }
            }
        }

        if (isCreationAllowed && tournament.setType === PROGRAMMED_TOURNAMENTS_SET_TYPES.ALL_LEAGUES) {
            isCreationAllowed = false;

            // check that the matches come from at least 2 competitions
            var firstCompetitionId;
            for (var m = 0; m < obj.matches.length; m++) {
                var matchCompetition = obj.matches[m].competitionId;

                if (!firstCompetitionId) {
                    firstCompetitionId = matchCompetition;
                }
                else if (matchCompetition !== firstCompetitionId) {
                    isCreationAllowed = true;
                    break;
                }
            }
        }

        if (!isCreationAllowed) {
            tournamentsToBeCreated.splice(t, 1);
            t--;
            continue;
        }

        allTeamsToCompetitions = allTeamsToCompetitions.concat(obj.teamsToCompetitions);
    }

    db.getTeamsByIdsFromMultipleCompetitions(allTeamsToCompetitions, function (err, competitions) {
        if (err) {
            logger.error('Failed to program tournament, couldnt get teams to create slate! ' + err);
            return;
        }

        for (var t = 0; t < tournamentsToBeCreated.length; t++) {
            var obj = tournamentsToBeCreated[t];

            lock.acquire('createProgrammedTournament', function () {

                var obj = this;

                // check if slate exists for the matches of the tournament
                var matchesIds = [];
                for (var i = 0; i < obj.matches.length; i++) {
                    matchesIds.push(obj.matches[i].matchId);
                }


                const gotSlateCallback = function (err, slateDoc) {
                    if (err) {
                        logger.error('Failed to create programmed tournament: ' + err);
                        lock.release('createProgrammedTournament');
                        return;
                    }

                    // create slate if necessary
                    if (!slateDoc) {
                        // set teams to competitions
                        for (var c = 0; c < obj.competitions.length; c++) {
                            var tourCompetition = obj.competitions[c];

                            if (!tourCompetition.matches || tourCompetition.matches.length === 0) continue;

                            // look for the competitions where we get the teams from
                            for (var k = 0; k < competitions.length; k++) {
                                if (competitions[k].competitionId === tourCompetition.competitionId) {
                                    var competition = competitions[k];
                                    break;
                                }
                            }

                            tourCompetition.teams = [];

                            for (var m = 0; m < obj.matches.length; m++) {
                                var match = obj.matches[m];
                                if (match.competitionId === tourCompetition.competitionId) {
                                    tourCompetition.teams.push(dbHelper.findTeamInCompetitionDocument(match.firstTeamId, competition));
                                    tourCompetition.teams.push(dbHelper.findTeamInCompetitionDocument(match.secondTeamId, competition));
                                }
                            }
                        }

                        slateDoc = dbHelper.createDocumentForSlate(obj.competitions, true);

                        if (slateDoc.competitions.length === 0) {
                            logger.verbose('Slate creation aborted, no valid competitions found. (teams or matches missing). Matches ids: ' + matchesIds);
                            lock.release('createProgrammedTournament');
                            return;
                        }

                        var conflictSlate = db.insertSlateFromDocumentAndCheckConflicts(slateDoc, function () {
                            lock.release('createProgrammedTournament');
                        });

                        if (conflictSlate) {
                            slateDoc = conflictSlate;
                            lock.release('createProgrammedTournament');
                        }
                    }
                    else {
                        lock.release('createProgrammedTournament');
                    }

                    var programmedTournament = obj.tournament;

                    var tournament = new models.tournament.Tournament(
                        programmedTournament.name,
                        programmedTournament.summary,
                        programmedTournament.type,
                        programmedTournament.subtype,
                        programmedTournament.flags,
                        programmedTournament.entryFee,
                        programmedTournament.maxEntries ? programmedTournament.maxEntries : -1,
                        programmedTournament.guaranteedPrize,
                        obj.matches[0].startDate,
                        programmedTournament.lineupSize,
                        true,
                        programmedTournament.multiEntries
                    );
                    tournament.slateId = slateDoc._id.toString();
                    tournament.isMock = programmedTournament.isMock;
                    tournament.programmedId = programmedTournament.programmedId;

                    logger.info('Tournament ' + tournament.name + ' scheduled on ' + tournament.startDate);

                    tournamentsController.createTournamentAndScheduleIt(
                        tournament,
                        dbHelper.createSlateFromDoc(slateDoc),
                        null,
                        false,
                        COPIES_OF_NON_FEATURED_TOURNAMENT_CREATED_BY_DEFAULT
                    );
                };

                db.getSlateByMatchesIds(matchesIds, function (err, slateDoc) {

                    lock.run('createProgrammedTournament', gotSlateCallback, err, slateDoc);

                }, true);
            }.bind(obj));
        }
    });
}


function getMatchesValidForTimeframe (competition, tournamentCompetitions, tournamentMatches, teamsToCompetitions, minDate, maxDate) {
    var tourCompetition = extend({}, competition); // extend the object so we can set different matches and teams
    tournamentCompetitions.push(tourCompetition);
    tourCompetition.matches = [];

    for (var m = 0; m < competition.matches.length; m++) {
        var match = competition.matches[m];

        if (match.period !== models.MatchPeriod.PRE_MATCH) continue;

        var matchTime = moment(match.startDate);

        if (matchTime > maxDate) break;
        if (matchTime < minDate) continue;

        tourCompetition.matches.push(match);
        tournamentMatches.push(match);
        teamsToCompetitions.push({ teamId : match.firstTeamId, competitionId : tourCompetition.competitionId });
        teamsToCompetitions.push({ teamId : match.secondTeamId, competitionId : tourCompetition.competitionId });
    }
}


function handleProgrammedTournamentCreation (programmedTournament,
                                             minDate,
                                             maxDate,
                                             tournamentCompetitions,
                                             tournamentMatches,
                                             teamsToCompetitions,
                                             upcomingTournaments,
                                             tournamentsToBeCreated) {

    var competitionsIds = [];
    for (var c = 0; c < tournamentCompetitions.length; c++) {
        competitionsIds.push(tournamentCompetitions[c].competitionId);
    }

    if (tournamentMatches.length < MIN_MATCHES_PER_SLATE) {
        var hasCupMatch = false;
        for (var m = 0; m < tournamentMatches.length; m++) {
            if (models.match.isCupMatch(tournamentMatches[m])) {
                hasCupMatch = true;
                break;
            }
        }

        if (!hasCupMatch) return;
    }

    var shouldSkip = false;

    if (programmedTournament.startDay && programmedTournament.strictStartDay) {
        var startDay = moment(programmedTournament.startDay, 'ddd').day();
        var startDayMatchFound = false;

        for (var m = 0; m < tournamentMatches.length; m++) {
            if (tournamentMatches[m].startDate.getDay() === startDay) {
                startDayMatchFound = true;
                break;
            }
        }

        shouldSkip = !startDayMatchFound;
    }

    if (!shouldSkip) {
        for (var t = 0; t < upcomingTournaments.length; t++) {
            var tour = upcomingTournaments[t];
            var tourStartDate = moment(tour.startDate);

            if (tour.programmedId === programmedTournament.programmedId &&
                ((tourStartDate.isSameOrAfter(minDate) && tourStartDate.isSameOrBefore(maxDate))
                || (programmedTournament.isMock && date.toDateString() === tour.startDate.toDateString()))) {
                shouldSkip = true;
                break;
            }
        }
    }

    if (shouldSkip) return;

    tournamentMatches = tournamentMatches.sort(function (m1, m2) {
        return m1.startDate - m2.startDate;
    });

    tournamentsToBeCreated.push({ tournament : programmedTournament, matches : tournamentMatches, competitions : tournamentCompetitions, teamsToCompetitions : teamsToCompetitions });
}


function createMockProgrammedTournament (date, programmedTournament, competitionIds) {
    // get mock matches and teams from competition
    db.getCompetitionsByIds(competitionIds, true, true, function (err, competitions) {
        if (err) {
            logger.error('Failed to create mock programmed tournament: ' + err);
            return;
        }

        if (!(competitions instanceof Array)) {
            competitions = [competitions];
        }

        var tournamentDate = moment(date);
        var tournamentStartTime = moment(programmedTournament.mockStartTime, 'hh:mm');
        tournamentDate.minutes(tournamentStartTime.minutes());
        tournamentDate.hours(tournamentStartTime.hours());
        tournamentDate.seconds(0);

        if (moment().isAfter(tournamentDate)) return;

        // find the tournament matches and teams
        var tournamentMatches = [];
        var tournamentTeamsIds = []; //TODO also this is probably broken: see teamsToCompetitions

        //TODO fix me
        db.getMockMatches(programmedTournament.mockMatches, function (err, mockCompetitions) {
            if (err) return;

            var competitions = this;

            for (var i = 0; i < competitions.length; i++) {
                var competition = competitions[i];

                for (var j = 0; j < mockCompetitions.length; j++) {
                    if (mockCompetitions[j].competitionId === competition.competitionId) {
                        competition.matches = mockCompetitions[j].matches;

                        for (var m = 0; m < competition.matches.length; m++) {
                            var match = competition.matches[m];
                            match.startDate = moment(tournamentDate).add(MOCK_MATCHES_DELAY_MINUTES * m, 'm').toDate();

                            tournamentMatches.push(match);
                            tournamentTeamsIds[match.firstTeamId] = 1;
                            tournamentTeamsIds[match.secondTeamId] = 1;
                        }

                        break;
                    }
                }
            }

            // now filter out the competition teams
            for (var k = 0; k < competition.teams.length; k++) {
                if (!tournamentTeamsIds[competition.teams[k].teamId]) {
                    competition.teams.splice(k, 1);
                    k--;
                }
            }

            if (tournamentMatches.length === 0) {
                logger.error('No tournament matches to create mock tournament: ' + programmedTournament.name);
                return;
            }

            createProgrammedTournament(programmedTournament, competitions, true, tournamentMatches);

        }.bind(competitions));
    });
}


exports.init = init;