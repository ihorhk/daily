var salaryManager = require('../calc/salaryCalculator.js');
var db = require('../db/dbManager.js');
var logger = require('../util/logger.js');

var TEST_SLATES = false;


require('../db/Database.js').initDB(function () {

    // calculate the salaries for the slates
    if (TEST_SLATES) {
        // to test the salary calculation mechanism, we get all the competitions and for each one of them we create a fake
        // slate containing all the teams from the competition
        db.getSlates(function (err, res) {
            if (err) {
                logger.error('Something went wrong while getting all the slates from DB');
                return;
            }

            for (var i = 0; i < res.length; i++) {
                salaryManager.calculateSalaryForSlate(res[i]); //TODO this function has been refactored but not fixed here
            }
        });
    }
    else { // or for all the teams of all competitions
        db.getAllCompetitions(function (err, res) {
            if (err) {
                logger.error('Something went wrong while getting all the competitions from DB');
                return;
            }

            for (var i = 0; i < res.length; i++) {
                salaryManager.testCalculateSalary(res[i].competitionId);
            }
        });
    }
});