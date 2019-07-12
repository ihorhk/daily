var models = require('./index.js');


var PlayerAction = function (action, count, totalPoints) {
    this.action = action;
    this.count = count;
    this.totalPoints = ((totalPoints === undefined || totalPoints === null) ? NaN : totalPoints);
};


PlayerAction.prototype.calculatePointsForPosition = function (position) {
    // calculate points based on player position
    var actionValue = this.action.values[position];
    this.totalPoints = this.count * actionValue;

    return this.totalPoints;
};


function mergeActions (actions1, actions2) {
    var res = [];

    // since actions are stored in the array in the same way, using the index defined by each Action, we can just loop through them and sum them
    for (var i = 0; i < actions1.length; i++) {
        var action1 = actions1[i];
        var action2 = actions2[i];

        if (!action1) {
            if (action2) {
                res[i] = action2;
            }
        }
        else {
            if (!action2) {
                res[i] = action1;
            }
            else {
                res[i] = new PlayerAction(action1.action, action1.count + action2.count, action1.totalPoints + action2.totalPoints);
            }
        }
    }

    return res;
}


function differenceBetweenActions (actions1, actions2) {
    const diff = [];

    for (var index in actions1) {
        var action = actions1[index];
        var action2 = actions2[index];

        if (action2) {
            var countDiff = action.count - action2.count;
            if (countDiff !== 0) {
                diff.push(new models.playerAction.PlayerAction(action.action, action.count - action2.count, action.totalPoints - action2.totalPoints));
            }
        }
        else {
            diff.push(action);
        }
    }

    // look for actions that have been removed
    for (index in actions2) {
        action2 = actions2[index];
        var action1 = actions1[index];

        if (!action1) {
            diff.push(new models.playerAction.PlayerAction(action2.action, -action2.count, -action2.totalPoints));
        }
    }

    return diff;
}


// see @convertActionsToString
function parseActions (string) {
    if (!string || string === null) return;

    var res = [];

    var actions = string.substring(0, string.length - 1).split(';');

    for (var i = 0; i < actions.length; i++) {
        var actionStr = actions[i];
        var parStart = actionStr.indexOf('(');
        var parEnd = actionStr.indexOf(')');
        var divIndex = actionStr.indexOf(',');

        var action = models.Action[actionStr.substring(0, parStart)];
        var count = parseInt(actionStr.substring(parStart + 2, divIndex));
        var totalPoints = parseInt(actionStr.substring(divIndex + 1, parEnd));

        res[action.index] = new models.playerAction.PlayerAction(
            action,
            isNaN(count) ? 0 : count,
            totalPoints
        );
    }

    return res;
}


// the resulting string will be in this format: <action_id1>(x<action_count>;<action_total_points>);<action_id2>(...);<action_id3>(...)
function convertActionsToString (actions) {
    if (actions.length === 0) return null;

    var s = '';

    for (var actionIndex in actions) {
        var action = actions[actionIndex];
        s += action.action.id + '(x' + action.count + ',' + action.totalPoints + ');';
    }

    return s;
}


function countPointsFromActions (actions) {
    var count = 0;

    for (var i = 0; i < actions.length; i++) {
        var action = actions[i];

        if (action) {
            count += action.totalPoints;
        }
    }

    return count;
}


exports.PlayerAction = PlayerAction;
exports.mergeAndSumActions = mergeActions;
exports.differenceBetweenActions = differenceBetweenActions;
exports.parseActions = parseActions;
exports.convertActionsToString = convertActionsToString;
exports.countPointsFromActions = countPointsFromActions;