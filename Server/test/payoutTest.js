var calc = require('../calc/payoutCalculator');
var logger = require('../util/logger');
var models = require('../models/index');

var entries = 6;
var entryFee = 0;
var guaranteedPrize = 1000;

//require('../db/Database.js').initDB(function () {
//    require('../db/dbManager').getTournamentById('57519e8325183ca424debdf9', false, true, false, true, function (err, res){
//        calc.calculatePayouts(res);
//    })
//});

var tournament = new models.tournament.Tournament();
tournament.entries = new Array(entries);
tournament.entryFee = entryFee;
tournament.guaranteedPrize = guaranteedPrize;
tournament.type = models.TournamentType.TOURNAMENT;

var res = calc.calculatePayouts(tournament, true);
var s = '';
var sum = 0;

for (var i = 0; i < res.length; i++) {
    sum += res[i];
    s += '\n' + (i + 1) + '. ' + res[i];
}

logger.verbose(s);
logger.verbose('Total prizes: ' + sum + ', entries: ' + (entries * entryFee - (entries * entryFee * 0.05)));