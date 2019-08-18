var fs = require('fs');
var logger = require('../util/logger.js');
var nodeExpat = require('node-expat');
var models = require('../models/index.js');
var helper = require('../util/helper.js');
var constants = require('../util/constants.js');
var moment = require('moment');


var FeedParser = function () {
    this.xmlParser = new nodeExpat.Parser('UTF-8');
    this.feedFormat = null;
    this.parentElements = [];
    this.currentElement = null;
    this.parentElementNames = [];
    this.currentElementName = null;
    this.fieldToBeAssigned = null;
    this.openTags = 0;
    this.shouldParseInt = false;
    this.shouldParseDate = false;
    this.shouldParseStat = false;
    this.shouldAddStatToParent = false;
    this.isSeasonIdOld = false;
};


FeedParser.prototype.parseFeed = function (file, callback) {
    this.file = file;
    this.callback = callback;
    if (constants.GLOBAL_DEBUG) this.parsingStartTime = Date.now();

    this.xmlParser.on('comment', function (comment) {
        if (comment.indexOf('::F9') > -1) {
            this.feedFormat = constants.FEED_FORMAT_F9;
            this.initF9Parsing();
        }
        else if (comment.indexOf('::F1') > -1) {
            this.feedFormat = constants.FEED_FORMAT_F1;
            this.initF1Parsing();
        }
        else if (comment.indexOf('::F40') > -1) {
            this.feedFormat = constants.FEED_FORMAT_F40;
            this.initF40Parsing();
        }
    }.bind(this));


    this.xmlParser.on('startElement', function (elementName, attrs) {
        if (!this.feedFormat) {
            this.xmlParser.destroy();
            logger.verbose('Feed format not recognized, ignoring the file.');
            this.parsingCompleted(this.callback, null, true);
            return;
        }

        if (this.isSeasonIdOld) {
            this.xmlParser.destroy();
            logger.verbose('Feed seasonId is old, ignoring the file');
            this.parsingCompleted(this.callback, null, true);
            return;
        }

        this.shouldAddElement = false;

        switch (this.feedFormat) {
            case constants.FEED_FORMAT_F9:
                this.handleF9Element(elementName, attrs);
                break;

            case constants.FEED_FORMAT_F1:
                this.handleF1Element(elementName, attrs);
                break;

            case constants.FEED_FORMAT_F40:
                this.handleF40Element(elementName, attrs);
                break;
        }

        if (this.shouldAddElement) {
            this.currentElementName = elementName;
            this.parentElements.push(this.currentElement);
            this.parentElementNames.push(elementName);
        }

        this.openTags++;

    }.bind(this));


    this.xmlParser.on('text', function (value) {
        if (!value || value.length === 0) return;

        if (this.fieldToBeAssigned) {
            if (this.shouldParseDate) {
                value = this.parseDate(value);
                this.shouldParseDate = false;
            }
            else if (this.shouldParseInt) {
                value = parseInt(value);
                this.shouldParseInt = false;
            }

            if (this.fieldToBeAssigned[0] === this.fieldToBeAssigned[0].toUpperCase()) {
                this.fieldToBeAssigned = helper.setCharAt(this.fieldToBeAssigned, 0, this.fieldToBeAssigned[0].toLowerCase());
            }

            if (this.shouldParseStat) {
                if (this.shouldAddStatToParent) {
                    if (this.fieldToBeAssigned === 'jersey_num') {
                        this.currentElement.jerseyNum = value;
                    }
                    this.currentElement.stats.set(this.fieldToBeAssigned, value);
                    this.shouldAddStatToParent = false;
                }
                else {
                    this.currentElement.set(this.fieldToBeAssigned, value);
                }

                this.shouldParseStat = false;
            }
            else {
                this.currentElement[this.fieldToBeAssigned] = value;
            }

            this.fieldToBeAssigned = null;
        }
    }.bind(this));


    this.xmlParser.on('endElement', function (element) {
        if (element === this.currentElementName) {

            var oldElement = this.parentElements.pop();
            this.parentElementNames.pop();

            if (this.parentElements.length === 0) {
                this.currentElement = null;
                this.currentElementName = null;
            }
            else {
                this.currentElement = this.parentElements[this.parentElements.length - 1];
                this.currentElementName = this.parentElementNames[this.parentElementNames.length - 1];

                if (this.feedFormat === constants.FEED_FORMAT_F9) {
                    if (element === 'MatchPlayer') {
                        var matchPlayers = this.currentElement.matchPlayers;
                        matchPlayers[matchPlayers.length - 1].formationPlace = oldElement.get('formation_place');
                    }
                }
            }
        }

        this.openTags--;
        if (this.openTags === 0) {
            this.parsingCompleted(callback, null);
        }
    }.bind(this));


    this.xmlParser.on('error', function (error) {
        logger.error('Parsing error -> '+error);

        this.parsingCompleted(callback, error);
    }.bind(this));


    fs.readFile(file, function (err, result) {
        if (err) {
            logger.error('Error while reading file '+file+': '+err);
        }
        else{
            this.xmlParser.parse(result);
        }
    }.bind(this));
};


FeedParser.prototype.initF1Parsing = function () {
    this.competition = new models.competition.Competition();
    this.competition.teams = [];
    this.matches = this.competition.matches;
};


FeedParser.prototype.initF9Parsing = function () {
    this.competition = new models.competition.Competition();
    this.firstTeam = new models.team.Team();
    this.secondTeam = new models.team.Team();
    this.firstTeamData = new models.teamData.TeamData(this.firstTeam);
    this.secondTeamData = new models.teamData.TeamData(this.secondTeam);
    this.matchOfficial = new models.matchOfficial.MatchOfficial();
    this.match = new models.match.Match(this.competition, [this.firstTeamData, this.secondTeamData]);
    this.match.matchOfficial = this.matchOfficial;
    this.venue = new models.venue.Venue();
    this.currentTeam = null;
};


FeedParser.prototype.initF40Parsing = function () {
    this.competition = new models.competition.Competition();
    this.competition.teams = [];
    this.competition.playersTransfers = [];
    this.currentTeam = null;
    this.shouldParseManager = false;
};

FeedParser.prototype.handleF1Element = function (elementName, attrs) {
    if (elementName === 'MatchData') {
        this.match = new models.match.Match(this.competition);
        this.match.timeStamp = new Date(attrs.last_modified);
        this.match.uID = this.parseuIDfromString(attrs.uID);
        this.match.seasonName = this.seasonName;
        this.match.seasonId = this.seasonId;

        this.checkSeasonIdValidity(this.seasonId);

        this.matches[this.match.uID] = this.match;

        this.currentElement = this.match;
        this.shouldAddElement = true;
    }
    else if (elementName === 'SoccerDocument') {
        if (attrs.Type.indexOf('RESULTS') < 0) {
            this.xmlParser.destroy();
            this.parsingCompleted(this.callback, 'Not parsing the F1 file because it\'s not a results feed.');
            return;
        }

        this.competition.name = attrs.competition_name;
        this.competition.uID = attrs.competition_id;
        this.seasonName = attrs.season_name;
        this.seasonId = attrs.season_id;
    }
    else if (this.currentElementName === 'MatchData') {

        switch (elementName) {
            case 'MatchInfo':
                this.currentElement.matchDay = parseInt(attrs.MatchDay);
                this.currentElement.matchType = attrs.MatchType;
                this.currentElement.period = attrs.Period;

                if (attrs.MatchWinner) {
                    var teamId = this.parseuIDfromString(attrs.MatchWinner);
                    this.currentElement.winner = this.findOrCreateTeam(teamId, this.competition.teams);
                }

                var venue = new models.venue.Venue();
                venue.uID = attrs.Venue_id;
                this.currentElement.venue = venue;

                break;

            case 'Date':
                this.fieldToBeAssigned = elementName;
                this.shouldParseDate = true;
                break;

            case 'Stat':
                var type = attrs.Type;
                var shouldAddVenue = false;

                if (type === 'Venue') {
                    this.fieldToBeAssigned = 'name';
                    shouldAddVenue = true;
                }
                else if (type === 'City') {
                    this.fieldToBeAssigned = 'city';
                    shouldAddVenue = true;
                }

                if (shouldAddVenue) {
                    this.currentElement = this.match.venue;
                    this.shouldAddElement = true;
                }
                break;

            case 'TeamData':
                teamId = this.parseuIDfromString(attrs.TeamRef);
                var teamData = (this.match.teamsData[0].score < 0) ? this.match.teamsData[0] : this.match.teamsData[1];
                teamData.team = this.findOrCreateTeam(teamId, this.competition.teams);

                teamData.side = attrs.Side;
                teamData.score = parseInt(attrs.Score);
                teamData.team.uID = teamId;

                break;
        }
    }
    else if (elementName === 'Team') {
        teamId = this.parseuIDfromString(attrs.uID);
        this.currentElement = this.findOrCreateTeam(teamId, this.competition.teams);
        this.shouldAddElement = true;
    }
    else if (this.currentElementName === 'Team') {
        this.fieldToBeAssigned = elementName;
    }
};


FeedParser.prototype.handleF9Element = function (elementName, attrs) {
    if (elementName === 'SoccerDocument') {
        if (this.match.uID) {
            this.xmlParser.destroy();
            this.parsingCompleted(this.callback, null);
            return;
        }

        this.match.uID = this.parseuIDfromString(attrs.uID);
    }
    else if (elementName === 'Competition') {
        this.currentElement = this.competition;
        this.shouldAddElement = true;
        this.competition.uID = this.parseuIDfromString(attrs.uID);
    }
    else if (elementName === 'MatchData') {
        this.currentElement = this.match;
        this.shouldAddElement = true;

        this.checkSeasonIdValidity(this.match.seasonId);
    }
    else if (elementName === 'Team') {
        this.currentElement = (this.parseuIDfromString(attrs.uID) === this.firstTeam.uID) ? this.firstTeam : this.secondTeam;
        this.shouldAddElement = true;

        this.currentTeam = this.currentElement;
    }
    else if (elementName === 'Venue') {
        this.venue.uID = this.parseuIDfromString(attrs.uID);
        this.currentElement = this.venue;
        this.shouldAddElement = true;
        this.match.venue = this.venue;
    }
    else if (elementName === 'PreviousMatch') {
        this.match.previousMatchId = this.parseuIDfromString(attrs.MatchRef);
    }
    else if (elementName === 'TeamData') {
        this.currentElement = this.firstTeam.uID ? this.secondTeamData : this.firstTeamData;
        this.shouldAddElement = true;

        this.currentElement.score = attrs.Score;
        this.currentElement.side = attrs.Side;
        this.currentElement.shootOutScore = attrs.ShootOutScore;
        this.currentElement.team.uID = this.parseuIDfromString(attrs.TeamRef);
        this.currentTeam = this.currentElement.team;
    }
    else if (this.currentElement === this.competition) {
        if (elementName === 'Country' || elementName === 'Name') {
            this.fieldToBeAssigned = elementName;
        }
        else if (elementName === 'Stat') {
            var shouldPopCompetition = false;

            switch (attrs.Type) {
                case 'season_name':
                    shouldPopCompetition = true;
                    this.fieldToBeAssigned = 'seasonName';
                    break;

                case 'matchday':
                    shouldPopCompetition = true;
                    this.shouldParseInt = true;
                    this.fieldToBeAssigned = 'matchday';
                    break;

                case 'season_id':
                    shouldPopCompetition = true;
                    this.fieldToBeAssigned = 'seasonId';
                    break;
            }

            if (shouldPopCompetition) {
                this.currentElement = this.match;
                this.currentElementName = 'Match';
                this.parentElements.pop();
                this.parentElementNames.pop();
            }
        }
        else if (elementName === 'Round') {
            this.currentElement = this.match;
            this.shouldAddElement = true;
        }
    }
    else if (this.currentElement === this.match) {

        switch (elementName) {
            case 'Stat':
                var type = attrs.Type;
                if (type === 'match_time' || type === 'first_half_time' || type === 'second_half_time') {
                    this.fieldToBeAssigned = type;
                    this.shouldParseInt = true;
                }
                else if (type === 'matchday') {
                    this.fieldToBeAssigned = 'matchDay';
                }
                else if (type === 'season_name') {
                    this.fieldToBeAssigned = 'seasonName';
                }
                break;

            case 'Result':
                this.match.resultType = attrs.Type;
                this.match.winner = attrs.Winner;

                // delay
                if (attrs.Type === 'Delayed' && attrs.Minutes) {
                    var delay = parseInt(attrs.Minutes);
                    this.match.date = new Date(this.match.date.getTime() + (delay * 60 * 1000));
                }
                break;

            case 'Date':
                this.fieldToBeAssigned = elementName;
                this.shouldParseDate = true;
                break;

            case 'Attendance':
                this.fieldToBeAssigned = elementName;
                this.shouldParseInt = true;
                break;

            case 'MatchInfo':
                this.currentElement.matchType = attrs.MatchType;
                this.currentElement.period = attrs.Period;
                this.currentElement.timeStamp = this.parseDate(attrs.TimeStamp);
                this.currentElement.weather = attrs.Weather;
                break;

            case 'MatchOfficial':
                this.currentElement = this.matchOfficial;
                this.shouldAddElement = true;

                this.currentElement.uID = this.parseuIDfromString(attrs.uID);
                break;

            case 'Name':
                this.fieldToBeAssigned = 'roundName';
                break;

            case 'RoundNumber':
                this.fieldToBeAssigned = 'roundNumber';
                this.shouldParseInt = true;
                break;

            case 'Pool':
                this.fieldToBeAssigned = 'roundPool';
                this.shouldParseInt = true;
                break;
        }
    }
    else if (this.currentElement === this.matchOfficial) {
        if (elementName === 'First' || elementName === 'Last') {
            this.fieldToBeAssigned = elementName;
        }
    }
    else if (this.currentElement === this.venue) {
        if (elementName === 'Name' || elementName === 'Country') {
            this.fieldToBeAssigned = elementName;
        }
    }
    else {
        switch (this.currentElementName) {
            case 'MatchPlayer':
                if (elementName === 'Stat') {
                    this.fieldToBeAssigned = attrs.Type;
                    this.shouldParseInt = true;
                    this.shouldParseStat = true;
                }
                break;

            case 'TeamData':
                switch (elementName) {
                    case 'MatchPlayer':
                        var subposition = attrs.SubPosition;
                        if (subposition && subposition === 'Forward') {
                            subposition = models.PlayerPosition.STRIKER;
                        }

                        var matchPlayer = new models.matchPlayer.MatchPlayer(
                            this.findOrCreatePlayer(this.parseuIDfromString(attrs.PlayerRef), this.currentTeam),
                            attrs.Position,
                            subposition,
                            attrs.ShirtNumber,
                            attrs.Captain ? true : false
                        );

                        if (subposition) {
                            matchPlayer.player.position = subposition;
                        }
                        else {
                            if (matchPlayer.position === models.PlayerPosition.SUBSTITUTE) {
                                matchPlayer.player.position = null;
                            }
                            else {
                                matchPlayer.player.position = matchPlayer.position;
                            }
                        }

                        this.currentElement.matchPlayers.push(matchPlayer);

                        this.currentElement = matchPlayer.stats;
                        this.shouldAddElement = true;
                        break;

                    case 'Stat':
                        if (attrs.Type === 'formation_used' || attrs.Type === 'goals_conceded') {
                            this.fieldToBeAssigned = attrs.Type;
                            this.shouldParseInt = true;
                        }
                        break;

                    case 'Booking':
                        var booking = new models.booking.Booking(
                            this.findOrCreatePlayer(this.parseuIDfromString(attrs.PlayerRef), this.currentTeam),
                            attrs.Card,
                            attrs.CardType === 'StraightRed',
                            attrs.Period,
                            attrs.Reason,
                            parseInt(attrs.Time),
                            attrs.EventID);
                        this.currentElement.bookings.push(booking);
                        break;

                    case 'Goal':
                        var goalType = attrs.Type;
                        var teamOfPlayerScoring = (goalType === models.goal.Type.OWN) ?
                            ((this.currentTeam.uID === this.firstTeam.uID) ? this.secondTeam : this.firstTeam)
                            : this.currentTeam;


                        var goal = new models.goal.Goal(
                            this.findOrCreatePlayer(this.parseuIDfromString(attrs.PlayerRef), teamOfPlayerScoring),
                            attrs.EventID,
                            attrs.Period,
                            parseInt(attrs.Time),
                            this.parseDate(attrs.TimeStamp),
                            attrs.Type);

                        this.currentElement.goals.push(goal);

                        this.currentElement = goal;
                        this.shouldAddElement = true;
                        break;

                    case 'MissedPenalty':
                        var missedPenalty = new models.missedPenalty.MissedPenalty(
                            this.findOrCreatePlayer(this.parseuIDfromString(attrs.PlayerRef), this.currentTeam),
                            attrs.EventID,
                            attrs.Period
                        );

                        if (attrs.Time) {
                            missedPenalty.minute = parseInt(attrs.Time);
                        }

                        this.currentElement.missedPenalties.push(missedPenalty);

                        this.currentElement = missedPenalty;
                        this.shouldAddElement = true;
                        break;

                    case 'Substitution':
                        var period = attrs.Period;

                        switch (period) {
                            case '1':
                                period = models.MatchPeriod.FIRST_HALF;
                                break;
                            case '2':
                                period = models.MatchPeriod.SECOND_HALF;
                                break;
                            case '3':
                                period = models.MatchPeriod.EXTRA_FIRST_HALF;
                                break;
                            case '4':
                                period = models.MatchPeriod.EXTRA_SECOND_HALF;
                                break;
                        }

                        var subPosition = attrs.SubstitutePosition;

                        switch (subPosition) {
                            case '1':
                                subPosition = models.PlayerPosition.GOALKEEPER;
                                break;
                            case '2':
                                subPosition = models.PlayerPosition.DEFENDER;
                                break;
                            case '3':
                                subPosition = models.PlayerPosition.DEFENDER;
                                break;
                            case '4':
                                subPosition = models.PlayerPosition.STRIKER;
                                break;
                        }

                        var substitution = new models.substitution.Substitution(
                            attrs.EventID,
                            period,
                            attrs.Reason,
                            this.findOrCreatePlayer(this.parseuIDfromString(attrs.SubOff), this.currentTeam),
                            subPosition,
                            parseInt(attrs.Time)
                        );

                        if (attrs.SubOn) {
                            substitution.subOn = this.findOrCreatePlayer(this.parseuIDfromString(attrs.SubOn), this.currentTeam);
                        }
                        else if (attrs.Retired) {
                            substitution.hasRetired = true;
                        }

                        this.currentElement.substitutions.push(substitution);
                        break;

                    case 'PenaltyShot':
                        var penaltyShot = new models.penalty.PenaltyShot(
                            attrs.EventID,
                            attrs.Outcome,
                            this.findOrCreatePlayer(this.parseuIDfromString(attrs.PlayerRef), this.currentTeam),
                            this.parseDate(attrs.TimeStamp)
                        );

                        this.currentElement.penaltyShots.push(penaltyShot);
                        break;
                }
                break;

            case 'Goal':
                if (elementName === 'Assist') {
                    this.currentElement.assist = this.findOrCreatePlayer(this.parseuIDfromString(attrs.PlayerRef), this.currentTeam);
                }
                else if (elementName === 'SecondAssist') {
                    this.currentElement.secondAssist = this.findOrCreatePlayer(this.parseuIDfromString(attrs.PlayerRef), this.currentTeam);
                }
                break;

            case 'Team':
                if (elementName === 'Player') {
                    this.currentElement = this.findOrCreatePlayer(this.parseuIDfromString(attrs.uID), this.currentTeam);
                    this.shouldAddElement = true;
                }
                else if (elementName === 'Country' || elementName === 'Name') {
                    this.fieldToBeAssigned = elementName;
                }
                else if (elementName === 'TeamOfficial') {
                    this.shouldAddElement = true;
                }
                break;

            case 'Player':
                if (elementName === 'First' || elementName === 'Last' || elementName === 'Known') {
                    this.fieldToBeAssigned = elementName;
                }
                break;

            case 'TeamOfficial':
                if (elementName === 'First') {
                    this.fieldToBeAssigned = 'teamManagerFirstName';
                }
                else if (elementName === 'Last') {
                    this.fieldToBeAssigned = 'teamManagerLastName';
                }
                break;
        }
    }
};


// the result of the parsing of a F40 feed is an array object containing all the parsed teams
FeedParser.prototype.handleF40Element = function (elementName, attrs) {
    if (this.currentElementName === 'Team') {
        if (elementName === 'Player') {
            var player = new models.player.Player(this.parseuIDfromString(attrs.uID));
            player.stats = new models.stats.Stats();
            player.team = this.currentTeam;

            this.currentElement = player;
            this.shouldAddElement = true;

            this.currentTeam.players.push(player);
        }
        else if (elementName === 'Name' && !this.currentElement.name) {
            this.fieldToBeAssigned = elementName;
        }
        else if (elementName === 'Founded') {
            this.fieldToBeAssigned = elementName;
            this.shouldParseInt = true;
        }
        else if (elementName === 'TeamOfficial') {
            this.shouldParseManager = (this.currentElement.teamManagerFirstName === null && attrs.Type === 'Manager');
        }
        else if (elementName === 'First' && this.shouldParseManager === true) {
            this.fieldToBeAssigned = 'teamManagerFirstName';
        }
        else if (elementName === 'Last' && this.shouldParseManager === true) {
            this.fieldToBeAssigned = 'teamManagerLastName';
        }
    }
    else if (this.currentElementName === 'Player') {
        var playerTransfer;
        if (this.currentElement instanceof models.playerTransfer.PlayerTransfer) {
            playerTransfer = this.currentElement;

            this.currentElement = playerTransfer.player;
        }
        else if (this.parentElements[this.parentElements.length - 1] instanceof models.playerTransfer.PlayerTransfer) {
            playerTransfer = this.parentElements[this.parentElements.length - 1];
        }

        if (elementName === 'Stat') {
            switch (attrs.Type) {
                case 'first_name':
                    this.fieldToBeAssigned = 'first';
                    break;

                case 'last_name':
                    this.fieldToBeAssigned = 'last';
                    break;

                case 'known_name':
                    this.fieldToBeAssigned = 'known';
                    break;

                case 'join_date':
                    if (playerTransfer) {
                        this.currentElement = playerTransfer;
                        this.fieldToBeAssigned = 'joinDate';
                        this.shouldParseDate = true;
                        break;
                    }

                case 'leave_date':
                    if (playerTransfer) {
                        this.currentElement = playerTransfer;
                        this.fieldToBeAssigned = 'leaveDate';
                        this.shouldParseDate = true;
                        break;
                    }

                case 'new_team':
                    if (playerTransfer) {
                        this.currentElement = playerTransfer;
                        this.fieldToBeAssigned = 'newTeamName';
                        break;
                    }

                default:
                    this.fieldToBeAssigned = attrs.Type;
                    this.shouldAddStatToParent = true;
                    this.shouldParseStat = true;
            }
        }
        else if (elementName === 'Position') {
            this.fieldToBeAssigned = elementName;
        }
    }
    else if (this.currentElementName === 'PlayerChanges') {
        if (elementName === 'Player') {
            var playerId = this.parseuIDfromString(attrs.uID);
            player = this.currentTeam.findPlayer(playerId);
            if (!player) {
                player = new models.player.Player(playerId);
                player.stats = new models.stats.Stats();
            }

            this.currentElement = new models.playerTransfer.PlayerTransfer(player, attrs.isLoan == 1, this.currentTeam);
            this.shouldAddElement = true;

            this.competition.playersTransfers.push(this.currentElement);
        }
        else if (elementName === 'Team') {
            this.currentTeam = this.competition.teams[this.parseuIDfromString(attrs.uID)];
        }
    }
    else {
        switch (elementName) {
            case 'Team':
                var team = new models.team.Team(this.parseuIDfromString(attrs.uID));
                team.country = attrs.country;
                team.name = attrs.official_club_name;
                team.regionName = attrs.region_name;
                this.competition.teams[team.uID] = team;

                this.currentElement = team;
                this.shouldAddElement = true;
                this.shouldParseManager = false;

                this.currentTeam = team;

                break;

            case 'SoccerDocument':
                if (attrs.Type.indexOf('SQUADS') < 0) {
                    this.xmlParser.destroy();
                    this.parsingCompleted(this.callback, 'Not parsing the F40 file because it\'s not a RESULTS this.');
                    return;
                }

                this.competition.name = attrs.competition_name;
                this.competition.uID = attrs.competition_id;
                this.seasonName = attrs.season_name;

                this.checkSeasonIdValidity(attrs.season_id);

                break;

            case 'PlayerChanges':
                this.competition.playersTransfers = [];
                this.currentElement = this.competition.playersTransfers;
                this.shouldAddElement = true;

                break;
        }
    }
};


FeedParser.prototype.parsingCompleted = function (callback, err, isAborted) {
    if (isAborted) return;

    var res = null;

    switch (this.feedFormat) {
        case constants.FEED_FORMAT_F1:
            res = this.competition;
            break;

        case constants.FEED_FORMAT_F9:
            res = this.match;

            if (res && res.winner) {
                res.winner = (res.winner === res.teamsData[0].team.uID) ? res.teamsData[0].team : res.teamsData[1].team;
            }

            break;

        case constants.FEED_FORMAT_F40:
            res = this.competition;
            break;
    }

    if (err) {
        callback(this.feedFormat, res, err);
        return;
    }

    callback(this.feedFormat, res, err);
};


// replace the leading chars that are not digits with nothing
FeedParser.prototype.parseuIDfromString = function (string) {
    return string.replace( /^\D+/g, '');
};


FeedParser.prototype.findOrCreatePlayer = function (uID, team) {
    var player = team.findPlayer(uID);
    if (!player) {
        player = new models.player.Player(uID);
        player.team = team;
        team.players.push(player);
    }

    return player;
};


FeedParser.prototype.findOrCreateTeam = function (uID, teams) {
    var team = teams[uID];
    if (!team) {
        team = new models.team.Team(uID);
        teams[uID] = team;
    }

    return team;
};


FeedParser.prototype.calculatePointsForEveryPlayer = function (match, positionsForPlayers) {
    var actions = models.Action;
    var isMatchFinished = match.isFinished();

    for (var i = 0; i < match.teamsData.length; i++) {
        var teamData = match.teamsData[i];
        var players = teamData.matchPlayers;

        if (!players || players.length === 0) continue;

        for (var j = 0; j < players.length; j++) {
            var player = players[j];
            var position = positionsForPlayers[player.player.uID];
            player.stats.set('mins_played', match.manageGameStatusForPlayerAndCalculateMinutesPlayed(player, teamData, isMatchFinished));
            Object.keys(actions).forEach( function (key) {
                player.calculateActionAndIncreasePoints(actions[key], position, teamData, isMatchFinished);
            });
        }
    }
};


FeedParser.prototype.checkSeasonIdValidity  = function (seasonId) {
    if (seasonId) {
        this.isSeasonIdOld = (parseInt(helper.getCurrentSeasonId()) > parseInt(seasonId));
    }
};


FeedParser.prototype.parseDate = function (str) {
    var date = moment(str);
    if (date.isDST() && !moment().isDST()) {
        date.hours(date.hours() - 1);
    }
    return date.toDate();
};


exports.FeedParser = FeedParser;