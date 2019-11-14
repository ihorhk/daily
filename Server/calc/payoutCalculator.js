var logger = require('../util/logger');
var Tournament = require('../models/Tournament');
var TournamentType = require('../models/enums/TournamentType').Type;
var TournamentSubtype = require('../models/enums/TournamentType').Subtype;
var helper = require('../util/helper');

var TOP_9_PRIZES_MIN_PRIZES_PERCENTAGE = 30;

var TOP_POSITIONS_Y_MAX;
var TEN_PERCENT_Y_MAX;
var LAST_POSITIONS_Y_MAX;
var LAST_POSITIONS_Y_MIN;

var TOP_POSITIONS_RANGE = 9;
var TEN_PERCENT_RANGE = 0.9;
var LAST_POSITIONS_RANGE = 0.075;


/**
 * @param tournament
 * @param fixedEntries[optional] - if true, the payout is calculated for the number of entries registered to the tournament
 * @param forceRecalculation[optional] - if true, the calculation of the payouts is done in any case. Normally its skipped if the prize hasn't changed from last calculation
 * @returns an array containing the payouts, or null if the payouts hasn't changed since last calculation (if any)
 */
function calculatePayouts (tournament, fixedEntries, forceRecalculation) {
    // calculate entries and total prize
    if (tournament.type === TournamentType.HEAD_TO_HEAD) {
        var entries = 2;
    }
    else {
        entries = Math.max(tournament.entriesCount, 0);
        if (!entries) {
            entries = tournament.entries ? tournament.entries.length : 0;
        }
    }

    var entryFee = parseFloat(tournament.entryFee);
    var rake = tournament.rake;
    var entryFeeNoRake = entryFee - rake;
    var totalPrize = calculateTotalPrize(entries, entryFee, rake);
    var calculationTotalPrize = totalPrize;
    var shouldSetTotalPrizeFromPayouts = true;

    // for guaranteed contests, calculate the payouts based on the number of entries summing up to the guaranteed prize
    if (tournament.guaranteedPrize > 0) {
        if (tournament.guaranteedPrize > totalPrize) {
            if (!fixedEntries) {
                if (!tournament.maxEntries || tournament.maxEntries > 100  || tournament.maxEntries <= 0) {
                    entries = 25;
                }
                else {
                    if (tournament.entryFee === 0) {
                        entries = tournament.maxEntries;
                    }
                    else {
                        entries = Math.round(tournament.guaranteedPrize / entryFeeNoRake);
                    }
                }
            }

            if (tournament.maxEntries && tournament.maxEntries > 0 && entries > tournament.maxEntries) {
                entries = tournament.maxEntries;
            }

            tournament.totalPrize = tournament.guaranteedPrize;
            calculationTotalPrize = tournament.guaranteedPrize;
            shouldSetTotalPrizeFromPayouts = false;
        }
    }
    // otherwise, for non guaranteed contests the payouts are calculated based on the number of max entries, or if its started, on the actual number of entries
    else if (!fixedEntries && !tournament.isActive) {
        if (tournament.maxEntries && tournament.maxEntries > 0 && tournament.maxEntries < 100) {
            calculationTotalPrize = tournament.maxEntries * entryFeeNoRake;
            entries = tournament.maxEntries;
        }
        else {
            calculationTotalPrize = 25 * entryFeeNoRake;
            entries = 25;
        }

        shouldSetTotalPrizeFromPayouts = false;
        tournament.totalPrize = totalPrize;
    }

    // prize is the same as last calculation, skip recalculation
    if (tournament.entryFee > 0 && !forceRecalculation && (tournament.payoutsEntriesNumber === entries)) {
        return null;
    }

    tournament.payoutsEntriesNumber = entries;

    if (entries === 0 && calculationTotalPrize === 0) {
        tournament.totalPrize = 0;
        tournament.payouts = [];

        return tournament.payouts;
    }

    switch (tournament.type) {
        case TournamentType.DOUBLE_UP:
            var payouts = calculatePayoutsForDoubleUp(entryFee, calculationTotalPrize);
            break;

        case TournamentType.FIFTY_FIFTY:
            payouts = calculatePayoutsForFiftyFifty(entries, calculationTotalPrize);
            break;

        case TournamentType.MULTIPLIER:
            payouts = calculatePayoutsForMultiplier(entryFee, calculationTotalPrize, tournament.subtype);
            break;

        default:
            payouts = calculatePayoutsForNormalTournament(entries, entryFee, calculationTotalPrize);
            break;
    }

    var payoutsSum = sortPayoutsAndCalculateSum(payouts);

    if (shouldSetTotalPrizeFromPayouts) {
        tournament.totalPrize = payoutsSum;
    }
    tournament.payouts = payouts;

    return payouts;
}


function calculatePayoutsForNormalTournament (entries, entryFee, totalPrize) {
    var payouts = [];
    var moneyPositionsPerc = entries < 20 ? (entries < 10 ? 0.3 : 0.25) : 0.2;
    var moneyPositions = Math.max(1, Math.round(entries * moneyPositionsPerc)); // min 1 position itm
    var topPositions;
    if (moneyPositions < 10) {
        topPositions = moneyPositions;
    }
    else {
        topPositions = Math.min(9, Math.round(moneyPositions / 3));
    }
    var tenPercentPositions = moneyPositions > 250 ? Math.round(moneyPositions / 10) : moneyPositions;

    // init the values of the functions that define how the prizes are smoothed out
    initFunctionsValues(moneyPositions);

    logger.verbose('Calculating payout for ' + entries + ' entries for $' + entryFee + '. Total Prize: ' + totalPrize + '. In the money: ' + moneyPositions);

    var sumY = 0;
    var m = [];

    for (var x = 0; x < moneyPositions; x++) {
        if (x < topPositions) {
            var y = topPositionsFunction(x);
        }
        else if (x < tenPercentPositions) {
            var posPerc = (x - topPositions) * TEN_PERCENT_RANGE / (tenPercentPositions - topPositions);
            y = tenPercentPositionsFunction(posPerc);
        }
        else {
            posPerc = (x - tenPercentPositions) * LAST_POSITIONS_RANGE / (moneyPositions - tenPercentPositions);
            y = cheapPositionsFunction(posPerc);
        }

        sumY += y;
        m[x] = y;
    }

    if (m.length > 10) {
        // check that the sum of the first nine positions is at least equal to TOP_9_PRIZES_MIN_PRIZES_PERCENTAGE of the total
        var sumTop9 = 0;

        for (x = 0; x < 10; x++) {
            sumTop9 += m[x];

            if (x == 9) {
                var minSum = TOP_9_PRIZES_MIN_PRIZES_PERCENTAGE * sumY / 100;

                if (minSum > sumTop9) {
                    var diff = minSum / sumTop9;

                    // pump up the values
                    for (var i = 0; i < 10; i++) {
                        var oldValue = m[i];
                        var newValue = oldValue * diff;

                        m[i] = newValue;
                        sumY += (newValue - oldValue);
                    }
                }
            }
        }
    }

    var shouldBeautify = (moneyPositions > 2);

    var remainder = 0;
    for (x = m.length - 1; x >= 0; x--) {
        var payout = (m[x] * 100 / sumY) * totalPrize / 100;

        if (shouldBeautify) {
            if (payout < 1) {
                var div = 0.1; // multiply instead of dividing
            }
            else {
                // if number has 3 digits divide by 50, if it has 5 divide by 5000 etc.
                div = 5 * Math.pow(10, Math.ceil(Math.log(payout + 1) / Math.LN10) - 2);
            }

            // Calculate beautified by rounding up to the amount calculated.
            // If the difference with the actual payout is more than +-10%, use a smaller rounding factor
            var beauty = Math.round(payout / div) * div;
            var payoutDiff = Math.abs(payout - beauty) * 100 / payout;
            if (payoutDiff >= 10) {
                div /= 2;
                beauty = Math.round(payout / div) * div;
            }

            var consumableRemainder = (x < m.length / 5) ? remainder / 10 : remainder / 25;
            consumableRemainder = Math.min(consumableRemainder, beauty / div / 8);

            if (remainder - consumableRemainder > 0) {
                var beautyConsumingRemainder = Math.round((payout + consumableRemainder) / div) * div;

                if (beauty !== beautyConsumingRemainder) {
                    beauty = beautyConsumingRemainder;
                }
            }

            remainder += (payout - beauty);
            payouts[x] = beauty;
        }
        else {
            if (payout > 10) {
                payout = Math.round(payout);
            }
            payouts[x] = payout;
        }
    }

    adjustPayoutsWithRemainder(payouts, entryFee, remainder);

    return payouts;
}


function calculatePayoutsForDoubleUp (entryFee, totalPrize) {
    var prize = entryFee * 2;
    var moneyPositions = Math.floor(totalPrize / prize);
    var payouts = [];
    var rem = totalPrize;

    for (var i = 0; i < moneyPositions; i++) {
        payouts.push(prize);
        rem -= prize;
    }

    if (rem > 0) {
        payouts.push(helper.roundNumber(rem, 0.01));
    }

    return payouts;
}


function calculatePayoutsForFiftyFifty (entries, totalPrize) {
    var moneyPositions = Math.floor(entries / 2);
    var prize = totalPrize / moneyPositions;
    var payouts = [];

    for (var i = 0; i < moneyPositions; i++) {
        payouts.push(prize);
    }

    return payouts;
}


function calculatePayoutsForMultiplier (entryFee, totalPrize, subtype) {
    if (!subtype) {
        logger.error('Failed to calculate payouts, no subtype provided for MULTIPLIER');
        return;
    }

    switch (subtype) {
        case TournamentSubtype.MULTIPLIER_FIVE:
            var multiplier = 5;
            break;

        case TournamentSubtype.MULTIPLIER_TEN:
            multiplier = 10;
            break;

        default:
            logger.error('Failed to calculate payouts, no valid subtype provided for MULTIPLIER: ' + subtype);
            return;
    }

    var prize = entryFee * multiplier;
    var moneyPositions = Math.floor(totalPrize / prize);

    var payouts = [];

    for (var i = 0; i < moneyPositions; i++) {
        payouts.push(prize);
    }

    var remainder = totalPrize - (prize * moneyPositions);
    if (remainder > 0) {
        payouts.push(remainder);
    }

    return payouts;
}


function topPositionsFunction (x) {
    // the parametric function from which the following is derived is -> { x = 10 * cos(t)^2.5 + 1, y = 9 * sin(t)^5.5 + 1 }, { t -> Pi }
    return (TOP_POSITIONS_RANGE * Math.pow(
            Math.sin(
                Math.acos(
                    0.415244 * Math.pow(x, 2/5)
                )
            ),
            5.5
        ) + TEN_PERCENT_Y_MAX);
}


function tenPercentPositionsFunction (x) {
    return TEN_PERCENT_RANGE * Math.pow(
            Math.sin(
                Math.acos(
                    1.04304 * Math.pow(x, 2/5)
                )
            ),
            5.5
        ) + LAST_POSITIONS_Y_MAX;
}


function cheapPositionsFunction (x) {
    return LAST_POSITIONS_RANGE * Math.pow(
            Math.sin(
                Math.acos(
                    2.81822 * Math.pow(x, 2/5)
                )
            ),
            5.5
        ) + LAST_POSITIONS_Y_MIN;
}


function calculateTotalPrize (entries, entryFee, rake) {
    return entries * (entryFee - rake);
}

function adjustPayoutsWithRemainder (payouts, entryFee, remainder) {
    var itsJustAFewCents = (entryFee < 1);

    if (remainder < 0) {
        var absRemainder = Math.abs(remainder);

        for (var i = payouts.length - 1; i >= 0; i--) {
            if (!itsJustAFewCents && Math.round(absRemainder) === 0) return;

            var payout = payouts[i];

            if (absRemainder > payout) {
                payouts.splice(i, 1);
                absRemainder -= payout;
            }
            else if ((payout - absRemainder) > entryFee) {
                if (itsJustAFewCents) {
                    payouts[i] = (Math.round((payout - absRemainder) * 10) / 10);
                }
                else {
                    payouts[i] = Math.round(payout - absRemainder);
                }
                return;
            }
            else if (payout > entryFee) {
                var diff = payout - entryFee;
                if (!itsJustAFewCents) {
                    diff = Math.round(diff);
                }

                if (absRemainder > diff) {
                    payouts[i] = payout - diff;
                    absRemainder -= diff;
                }
            }
        }
    }
    else {
        var lastPayout = payouts[payouts.length - 1];

        while (remainder > entryFee) {
            // add positions
            if (remainder > lastPayout) {
                payouts.push(lastPayout);
                remainder -= lastPayout;
            }
            else {
                remainder = helper.roundNumber(remainder, 0.01);
                if (remainder > 0) {
                    payouts.push(remainder);
                    remainder = 0;
                }
            }
        }

        if (remainder !== 0) {
            // take amounts from the last positions until their sum + remainder is at least an entry fee
            for (i = payouts.length - 1; i >= 0; i--) {
                payout = payouts[i];
                diff = Math.round(entryFee - remainder);
                if (payout - diff > entryFee) {
                    payouts[i] = payout - diff;
                    payouts.push(entryFee);
                    return;
                }
                else {
                    var payoutDiff = payout - entryFee;
                    remainder += payoutDiff;
                    payouts[i] = entryFee;
                }
            }
        }
    }
}


// checks that the payouts are sorted and returns sum
function sortPayoutsAndCalculateSum (payouts) {
    var shouldSort = false;
    var sum = 0;

    for (var i = payouts.length - 1; i >= 0; i--) {
        if (i > 0 && !shouldSort && payouts[i - 1] < payouts[i]) {
            shouldSort = true;
        }

        sum += payouts[i];
    }

    if (shouldSort) {
        payouts.sort(function (p1, p2) {
            return parseInt(p2) - parseInt(p1);
        });
    }

    return sum;
}


function initFunctionsValues (moneyPositions) {
    if (moneyPositions <= 40) {
        TOP_POSITIONS_Y_MAX = 8;
        TEN_PERCENT_Y_MAX = 2;
        LAST_POSITIONS_Y_MAX = 1.1;
    }
    else if (moneyPositions <= 75) {
        TOP_POSITIONS_Y_MAX = 8;
        TEN_PERCENT_Y_MAX = 1.2;
        LAST_POSITIONS_Y_MAX = 0.3;
    }
    else if (moneyPositions <= 200) {
        TOP_POSITIONS_Y_MAX = 8;
        TEN_PERCENT_Y_MAX = 1.1;
        LAST_POSITIONS_Y_MAX = 0.2;
        LAST_POSITIONS_Y_MIN = 0.13;
    }
    else if (moneyPositions <= 500) {
        TOP_POSITIONS_Y_MAX = 9;
        TEN_PERCENT_Y_MAX = 1.05;
        LAST_POSITIONS_Y_MAX = 0.15;
        LAST_POSITIONS_Y_MIN = 0.08;
    }
    else {
        TOP_POSITIONS_Y_MAX = 10;
        TEN_PERCENT_Y_MAX = 1.05;
        LAST_POSITIONS_Y_MAX = 0.15;
        LAST_POSITIONS_Y_MIN = 0.035;
    }
}


exports.calculatePayouts = calculatePayouts;
exports.calculateTotalPrize = calculateTotalPrize;