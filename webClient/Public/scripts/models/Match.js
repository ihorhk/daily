function matchPeriodToString (match) {
    if (!match.period) return '';

    switch (match.period.toLowerCase()) {
        case 'prematch':
            return 'Pre-match';
        case 'firsthalf':
            return '1st Half';
        case 'secondhalf':
            return '2nd Half';
        case 'halftime':
            return 'Half-time';
        case 'extrafirsthalf':
            return 'Extra First Half';
        case 'extrasecondhalf':
            return 'Extra Second Half';
        case 'extrahalftime':
            return 'Extra Half-time';
        case 'shootout':
            return 'Penalty shoot-out';
        case 'fulltime':
            return 'Finished';
        case 'fulltime90':
            return 'Waiting for extra time';
        case 'fulltimepens':
            return 'Waiting for penalties';
        case 'void':
        case 'abandoned':
            return 'Cancelled';
        case 'postponed':
            return 'Postponed';
        default:
            return '';
    }
}


function matchIsComing (match) {
    return match.period.toLowerCase() === 'prematch';
}


function matchIsInProgress (match) {
    return match.period.toLowerCase() !== 'prematch' && !matchIsFinished(match);
}


function matchIsFinished (match) {
    return match.period.toLowerCase() === 'fulltime' || matchIsCancelledBeforeStart(match) || matchIsAbandoned(match);
}


function matchIsCancelledBeforeStart (match) {
    var value = (match.resultType || match.period).toLowerCase();

    return value === 'postponed' || value === 'void';
}


function matchIsAbandoned (match) {
    return (match.resultType || match.period).toLowerCase() === 'abandoned';
}


function parseChartDataFromMatch (match) {

    if (match.hasOwnProperty('lastActions')) {
        if (!match.salary) return null;

        var lastActions = match.lastActions;
        var actions = lastActions.actions;
        var points = parseInt(lastActions.pts);
        
        var time;

        for (var i = 0; i < actions.length; i++) {
            var action = parseAction(actions[i]);
            if (!action) continue;

            if (action.name == 'MP') {
                time = action.count;
                break;
            }
        }

        var date = formatDate(match.matchStartDate, false);
        var performance = Math.round(points / time);

        var salary = parseInt(match.salary);

        return {
            date : date,
            salary : salary,
            points : points,
            time: time,
            performance: performance
        }
    }
    else {
        return null;
    }
}