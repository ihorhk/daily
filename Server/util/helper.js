const constants = require('./constants.js');
const models = require('../models/index.js');
const db = require('../db/dbManager.js');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const logger = require('./logger');
const https = require('https');
const http = require('http');
const fs = require('fs');


function setCharAt (str,index,chr) {
    if (index > str.length-1) {
        return str;
    }

    return str.substr(0, index) + chr + str.substr(index + 1);
}


function objectBinarySearch(items, value, field) {

    var startIndex  = 0,
        stopIndex   = items.length - 1,
        middle      = Math.floor((stopIndex + startIndex)/2);

    while(items[middle][field] != value && startIndex < stopIndex){

        //adjust search area
        if (value < items[middle][field]){
            stopIndex = middle - 1;
        } else if (value > items[middle][field]){
            startIndex = middle + 1;
        }

        //recalculate middle
        middle = Math.floor((stopIndex + startIndex)/2);
    }

    //make sure it's the right value
    return (items[middle][field] != value) ? -1 : middle;
}


/**
 * @param arr the array to be sorted
 * @param order a positive value if the sorting should be ascending, or negative if it should be descending
 */
function sortIntArray (arr, order) {
    var sign = order > 0 ? 1 : -1;

    return arr.sort(
        function (i1, i2) {
            return (i1 - i2) * sign;
        }
    );
}


function roundNumber (number, precision) {
    return Math.round(number / precision) * precision;
}


// returns error message if it's not valid
function checkPasswordValidity (password) {
    if (!password || password.length < 8) {
        return 'The password must be at least 8 characters';
    }
    if (!/[0-9]/.test(password)) {
        return 'The password must contain at least one number';
    }
}


function generateToken (callback) {
    crypto.randomBytes(16, function(err, buffer) {
        callback(buffer.toString('hex'));
    });
}


function isLatinString (string) {
    return /^[0-9a-zA-Z0-9, ()-]+/.test(string);
}


function arraysMatch (first, second) {
    if (first.length !== second.length) return false;

    for (var i = 0; i < first.length; i++) {
        if (second.indexOf(first[i]) < 0) return false;
    }

    return true;
}


function formatMoney (number) {
    return '€' + formatNumber(number);
}


function formatNumber (number) {
    if (!number) return 0;

    var numberFormat = number;
    numberFormat = numberFormat.toString();

    if (numberFormat.indexOf('.') > 0) {
        var decimalNumber = parseFloat(number).toFixed(2);
        if (decimalNumber.substring(decimalNumber.indexOf('.') + 1) !== '00') {
            return decimalNumber;
        }

        numberFormat = decimalNumber.substring(0, decimalNumber.indexOf('.'));
    }

    var rgx = /(\d+)(\d{3})/;
    while (rgx.test(numberFormat)) {
        numberFormat = numberFormat.replace(rgx, '$1' + ',' + '$2');
    }

    return numberFormat;
}


function httpGet (host, path, onResult) {
    var options = { host : host, path : path };
    var prot = options.port == 443 ? https : http;
    var req = prot.request(options, function(res) {
        var output = '';
        res.setEncoding('utf8');

        res.on('data', function (chunk) {
            output += chunk;
        });

        res.on('end', function() {
            onResult(res.statusCode, output);
        });
    });

    req.end();
}


function getCurrentSeasonId () {
    if (!currentSeasonId) {
        logger.emerg('Season id is not set!');
        return;
    }

    return currentSeasonId;
}


function setCurrentSeasonId (seasonId) {
    currentSeasonId = seasonId;
}


function setTermsAndConditions (newTerms) {
    termsAndConditions = newTerms;
}


function getTermsAndConditions () {
    if (!termsAndConditions) {
        logger.emerg('Terms and conditions are not set!');
        return;
    }

    return termsAndConditions;
}


function setGameRules (newRules) {
    gameRules = newRules;
}


function getGameRules () {
    if (!gameRules) {
        logger.emerg('Game Rules not set!');
        return;
    }

    return gameRules;
}


function convertAssociativeArrayToNormalArray (array) {
    var res = [];

    for (var p in array) {
        res.push(array[p]);
    }

    return res;
}


function getDebugIp () {
    return constants.IS_RUNNING_LOCAL ? '127.0.0.1' : constants.SERVER_IP;
}


function getDebugAddress () {
    return getDebugIp() + ':' + constants.SERVER_PORT;
}


function makeAccentsPlain (s) {
    var r = s.toLowerCase();
    r = r.replace(new RegExp("\\s", 'g'),"");
    r = r.replace(new RegExp("[àáâãäå]", 'g'),"a");
    r = r.replace(new RegExp("æ", 'g'),"ae");
    r = r.replace(new RegExp("ç", 'g'),"c");
    r = r.replace(new RegExp("[èéêë]", 'g'),"e");
    r = r.replace(new RegExp("[ìíîï]", 'g'),"i");
    r = r.replace(new RegExp("ñ", 'g'),"n");
    r = r.replace(new RegExp("[òóôõö]", 'g'),"o");
    r = r.replace(new RegExp("œ", 'g'),"oe");
    r = r.replace(new RegExp("[ùúûü]", 'g'),"u");
    r = r.replace(new RegExp("[ýÿ]", 'g'),"y");
    r = r.replace(new RegExp("\\W", 'g'),"");

    return r;
}


function indexOfPlayerInPlayersIdsString (playersIds, player) {
    return playersIds.search(new RegExp("," + player + ',|^' + player + ',|^' + player + '%|,' + player + '%', 'g'));
}


// compare fn should return 0, 1 or -1 and accept two parameters
function insertElementInSortedArray (element, compareFn, array, start, end) {
    if (array.length === 0) {
        array.push(element);
        return;
    }

    var ind = whereShouldWePlaceElementInSortedArray(element, compareFn, array, start, end);
    array.splice(ind, 0, element);
}


function whereShouldWePlaceElementInSortedArray (element, compareFn, array, start, end) {
    start = start || 0;
    end = end || array.length;
    var pivot = (end + start) >>> 1; // bitwise, unsigned right shift: a magic way to divide by 2

    var c = compareFn(element, array[pivot]);

    if (end - start <= 1) return c == -1 ? pivot : pivot + 1;

    switch (c) {
        case -1: return whereShouldWePlaceElementInSortedArray(element, compareFn, array, start, pivot);
        case 0: return pivot;
        case 1: return whereShouldWePlaceElementInSortedArray(element, compareFn, array, pivot, end);
    }
}


function generateHashCodeForString (string) {
    var hash = 0, i, chr, len;
    if (string.length === 0) return hash;
    for (i = 0, len = string.length; i < len; i++) {
        chr   = string.charCodeAt(i);
        hash  = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}


/**
 * Randomize array element order in-place.
 * Using Durstenfeld shuffle algorithm.
 */
function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}


function isDateInDaylightSavingTime (date) {
    var jan = new Date(date.getFullYear(), 0, 1);
    var jul = new Date(date.getFullYear(), 6, 1);
    var stdDiff = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());

    return date.getTimezoneOffset() !== stdDiff;
}


// mongo db throws error if object id is not hex of 12 or 24 chars
function isObjectIdValid (objectId) {
    var rgx = objectId.match(/[0-9abcdef]+/);
    if (rgx && rgx.length > 0) {
        return rgx[0].length === 12 || rgx[0].length === 24;
    }

    return false;
}


function parseBoolean (o) {
    if (!o) return undefined;

    if (o === 'false' || o === false) return false;
    else if (o === 'true' || o === true) return true;

    return undefined;
}


exports.setCharAt = setCharAt;
exports.binarySearch = objectBinarySearch;
exports.sortIntArray = sortIntArray;
exports.roundNumber = roundNumber;
exports.checkPasswordValidity = checkPasswordValidity;
exports.generateToken = generateToken;
exports.isLatinString = isLatinString;
exports.arraysMatch = arraysMatch;
exports.formatMoney = formatMoney;
exports.formatNumber = formatNumber;
exports.httpGet = httpGet;
exports.getCurrentSeasonId = getCurrentSeasonId;
exports.setCurrentSeasonId = setCurrentSeasonId;
exports.convertAssociativeArrayToNormalArray = convertAssociativeArrayToNormalArray;
exports.generateHashCodeForString = generateHashCodeForString;
exports.getDebugIp = getDebugIp;
exports.getDebugAddress = getDebugAddress;
exports.makeAccentsPlain = makeAccentsPlain;
exports.indexOfPlayerInPlayersIdsString = indexOfPlayerInPlayersIdsString;
exports.insertElementInSortedArray = insertElementInSortedArray;
exports.shuffleArray = shuffleArray;
exports.isDateInDaylightSavingTime = isDateInDaylightSavingTime;
exports.setTermsAndConditions = setTermsAndConditions;
exports.getTermsAndConditions = getTermsAndConditions;
exports.getGameRules = getGameRules;
exports.setGameRules = setGameRules;
exports.isObjectIdValid = isObjectIdValid;
exports.parseBoolean = parseBoolean;