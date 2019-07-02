var positions = require('../models/enums/PlayerPosition.js');
var actions = require('../models/enums/Action.js');

var test = [];
test[positions.GOALKEEPER] = 0.5;
test['defender'] = 1;
test['attacker'] = 3;
test['wing'] = 5;

var nano = process.hrtime()[1];
var points = test[positions.PlayerPosition.GOALKEEPER];
var time = (process.hrtime()[1] - nano);

console.log('points: '+ points + ' time: ' + time);

//for (var i = 0; i < actions.actions.length; i++) {
//    console.log('action: '+actions.actions[i].name)
//}

for (var property in actions) {
    console.log('property')
}