var htmlEscapeMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;'
};

function formatNumber (number) {
    if (!number) return 0;

    var numberFormat = number;
    numberFormat = numberFormat.toString();

    if (numberFormat.indexOf('.') > 0) {
        var decimalNumber = parseFloat(number).toFixed(2);
        if (decimalNumber.substring(decimalNumber.indexOf('.') + 1) !== '00') {
            numberFormat = decimalNumber;
        }
        else {
            numberFormat = decimalNumber.substring(0, decimalNumber.indexOf('.'));
        }
    }

    var rgx = /(\d+)(\d{3})/;
    while (rgx.test(numberFormat.toString())) {
        numberFormat = numberFormat.replace(rgx, '$1' + ',' + '$2');
    }

    return numberFormat;
}


function formatMoney (number) {
    return (number < 0 ? '- ' : '') + '€' + formatNumber(Math.abs(number));
}


function formatPoints (number) {
    return formatNumber(number) + ' pts';
}

function formatPointsShort (number) {
    return formatNumberShort(number) + ' pts';
}


function formatMoneyShort (number) {
    return '€' + formatNumberShort(number);
}


function formatNumberShort (number) {
    if (!number) return 0;

    if (number < 10000) {
        return formatNumber(number);
    }

    if (number >= 1000000) {
        var formattedNumber = number / 1000000;
        var symbol = ' M';
    }
    else {
        formattedNumber = number / 1000;
        symbol = ' K';
    }

    if (Math.round(formattedNumber * 10) % 10 === 0) {
        return Math.round(formattedNumber) + symbol;
    }

    return (formattedNumber).toFixed(1) + symbol;
}


function formatPrize (tour, number) {
    return isTournamentFreePlayMode(tour) ? formatPoints(number) : formatMoney(number);
}


function formatPrizeShort (tour, number) {
    return isTournamentFreePlayMode(tour) ? formatPointsShort(number) : formatMoneyShort(number);
}


function formatPlayerUsage (usage) {
    if (!usage) return '--';

    return Math.round(usage) + '%';
}


function goToContests () {
    window.location.pathname = '/';
    window.location.href = '/contests';
}

function goToMyContests () {
    window.location.pathname = '/';
    window.location.href = '/myContests';
}

function goToContestLobby (tournamentId, entryId) {
    var url = '/contest/lobby?id=' + tournamentId + '&from=' + window.location.pathname.substr(1);

    if (entryId) {
        url += '&entry=' + entryId;
    }

    window.location.pathname = '/';
    window.location.href = url;
}


function goToLogin (title) {
    window.location.href = '/signIn' + (title ? '?title=' + encodeURI(title) : '') + '#login' ;
}


function goToDraftTeam (tournamentId) {
    window.location.href = '/contest/createLineup?contest=' + tournamentId;
}


function formatOrdinal (n) {
    return n + formatOrdinalSuffix(n);
}


function formatOrdinalSuffix (n) {
    var s = ["th","st","nd","rd"];
    var v = n % 100;

    return (s[(v - 20) % 10] || s[v] || s[0]);
}


function setupStupidTable (table) {
    table.stupidtable({
        "timestamp" : function (a, b) {
            return a - b;
        },
        "full_date" : function (a, b) {
            return moment(a, 'ddd DD-MM hh:mm').valueOf() - moment(b, 'ddd DD-MM hh:mm').valueOf();
        },
        "money" : function (a, b) {
            var numberA = a.substring(1).replace(',', '');
            var numberB = b.substring(1).replace(',', '');
            numberA = parseFloat(numberA);
            numberB = parseFloat(numberB);

            return (isNaN(numberA) ? 0 : numberA) - (isNaN(numberB) ? 0 : numberB);
        },
        "money_short" : function (a, b) {
            var numberA = a.substring(1).replace(',', '').toLowerCase();
            var numberB = b.substring(1).replace(',', '').toLowerCase();

            return getValueFromShortNumber(numberA) - getValueFromShortNumber(numberB);
        },
        "entries" : function (a, b) {
            a += '/';
            b += '/';
            var entriesA = a.substring(0, a.indexOf('/'));
            var entriesB = b.substring(0, b.indexOf('/'));

            return parseInt(entriesA) - parseInt(entriesB);
        },
        "percentage" : function (a, b) {
            return parseFloat(a.replace('%', '')) - parseFloat(b.replace('%', ''));
        },
        "formation" : function (a, b) {
            var weights = [];

            for (var i = 0; i < 2; i++) {
                weights[i] = shortPositionOrdinal(i === 0 ? a : b);
            }

            return weights[0] - weights[1];
        },
        "number" : function (a, b) {
            var numberA = a.replace(',', '').toLowerCase();
            var numberB = b.replace(',', '').toLowerCase();

            return getValueFromShortNumber(numberA) - getValueFromShortNumber(numberB);
        }
    });
}


function getValueFromShortNumber (number) {
    if (number.indexOf('k') > 0) {
        var val = parseFloat(number.replace('k', '')) * 1000;
    }
    else if (number.indexOf('m') > 0) {
        val = parseFloat(number.replace('m', '')) * 1000000;
    }
    else {
        val = parseFloat(number);
    }

    return isNaN(val) ? 0 : val;
}


function shortPositionOrdinal (pos) {
    switch (pos) {
        case 'GK': return 1;
        case 'DEF': return 2;
        case 'MID': return 3;
        case 'ATT': return 4;
        default: return 0;
    }
}


function stringToColor (str, seed) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash) + seed;
    }

    var r = (hash >> 0) & 0xFF;
    var g = (hash >> 8) & 0xFF;
    var b = (hash >> 16) & 0xFF;

    // we dont want colors that are too light
    while (r * g * b > (256 * 256 * 256 / (5 / 2))) {
        r = (r * 2) % 256;
        g = (g * 2) % 256;
        b = (b * 2) % 256;
    }

    var colour = '#';

    for (i = 0; i < 3; i++) {
        switch (i) {
            case 0: var value = r; break;
            case 1: value = g; break;
            case 2: value = b; break;
        }
        colour += ('00' + value.toString(16)).substr(-2);
    }
    return colour;
}


function formatDate (str, hasYear) {
    if (!str || str.length === 0) return '';

    var date = new Date(str);
    if (date == null) {
        return '';
    }
    else {
        var year = date.getFullYear();
        var month = (1 + date.getMonth()).toString();
        month = month.length > 1 ? month : '0' + month;
        var day = date.getDate().toString();
        day = day.length > 1 ? day : '0' + day;
        if (hasYear) {
            return year + '-' + month + '-' + day;
        }
        else {
            return month + '-' + day;
        }
    }
}


function shortPlayerName (s) {
    if (!s || s.length === 0) return null;

    var divInd = s.indexOf(' ');

    var firstName = s.substring(0, 1);
    var lastName = s.substring(divInd + 1, s.length);

    return firstName.toUpperCase() + '. ' + lastName;
}


// returns message if password is not valid
function checkPasswordValidity (password, confirmPassword) {
    var errorMsg;

    if (password.length < 8) {
        errorMsg = 'The password must be at least 8 characters';
    }
    //else if (password.toLowerCase() == password) {
    //    errorMsg = 'The password must contain at least one uppercase character';
    //}
    else if (!/[0-9]/.test(password)) {
        errorMsg = 'The password must contain at least one number';
    }
    //else if (!/[#$%&'()*+,-./:;<=>?@[\]^_`{|}~]/.test(password)) {
    //    errorMsg = 'The password must contain at least one special character';
    //}

    // check if passwords match
    if (password !== confirmPassword) {
        errorMsg = 'Password and confirm password must match'
    }

    return errorMsg;
}


function escapeHtml (string) {
    return String(string).replace(/[&<>"'\/]/g, function (s) {
        return htmlEscapeMap[s];
    });
}


function isLatinString (string) {
    return /^[0-9a-zA-Z0-9, ()-]+/.test(string);
}


function isValidEmail (email) {
    return /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/.test(email);
}


function isDateInDaylightSavingTime (date) {
    var jan = new Date(date.getFullYear(), 0, 1);
    var jul = new Date(date.getFullYear(), 6, 1);
    var stdDiff = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());

    return date.getTimezoneOffset() !== stdDiff;
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


function checkCookie () {
    var cookieEnabled = (navigator.cookieEnabled) ? true : false;
    if (typeof navigator.cookieEnabled == "undefined" && !cookieEnabled){
        document.cookie = "testcookie";
        cookieEnabled = (document.cookie.indexOf("testcookie") != -1);
        delete document.cookie;
    }

    return (cookieEnabled) ? true : false;
}


function playersIdsStringContainsPlayer (playersIds, player) {
    return (playersIds.search(new RegExp("," + player + ',|^' + player + ',|,' + player + '$', 'g')) >= 0);
}


function createErrorDialog (title, msg, buttonText, buttonHandler) {
    var errorDialog = $('.errorDialog');

    var dialogTitle = errorDialog.find('.dialogTitle');
    dialogTitle.text(title);

    var dialogMessage = errorDialog.find('.dialogMessage');
    dialogMessage.text(msg);

    buttonText = buttonText || 'CLOSE';
    var dialogActionButton = errorDialog.find('.dialogActionButton');
    dialogActionButton.text(buttonText);

    errorDialog
        .dialog({
            dialogClass: 'noTitleStuff fixed-dialog',
            resizable: false,
            modal: true,
            autoOpen: true,
            draggable: false,
            open: function(e, ui) {
                // bind close
                $('.errorDialog').unbind().bind('click', function(e) {
                    e.stopPropagation();
                });

                $('.ui-dialog.fixed-dialog, .dialogCloseButton').unbind().bind('click', function() {
                    $('.errorDialog').dialog('close');
                });

                $('.dialogActionButton').unbind().bind('click', function() {
                    $('.errorDialog').dialog('close');

                    if (buttonHandler) {
                        buttonHandler();
                    }
                });
            }
        });
}


function createWarningDialog (title, msg, buttonText, buttonHandler, secondButtonText, secondButtonHandler) {
    var warningDialog = $('.warningDialog');

    var dialogTitle = warningDialog.find('.dialogTitle');
    dialogTitle.text(title);

    var dialogMessage = warningDialog.find('.dialogMessage');
    dialogMessage.text(msg);

    buttonText = buttonText || 'CLOSE';
    var dialogActionButton = warningDialog.find('#mainWarningButton');
    dialogActionButton.text(buttonText);

    var secondaryActionButton = warningDialog.find('#secondaryWarningButton');
    if (secondButtonText) {
        secondaryActionButton.text(secondButtonText);
    }
    else {
        secondaryActionButton.hide();
    }

    warningDialog
        .dialog({
            dialogClass: 'noTitleStuff fixed-dialog',
            resizable: false,
            modal: true,
            autoOpen: true,
            draggable: false,
            open: function(e, ui) {
                // bind close
                $('.warningDialog').unbind().bind('click', function(e) {
                    e.stopPropagation();
                });

                $('.ui-dialog.fixed-dialog, .dialogCloseButton').unbind().bind('click', function() {
                    $('.warningDialog').dialog('close');
                });

                dialogActionButton.unbind().bind('click', function() {
                    $('.warningDialog').dialog('close');

                    if (buttonHandler) {
                        buttonHandler();
                    }
                });

                if (secondButtonText) {
                    secondaryActionButton.unbind().bind('click', function() {
                        $('.warningDialog').dialog('close');

                        if (secondButtonHandler) {
                            secondButtonHandler();
                        }
                    });
                }
            }
        });
}


function createGenericDialog (title, msg, buttonText, buttonHandler, secondButtonText, secondButtonHandler) {
    var genericDialog = $('.genericDialog');

    var dialogTitle = genericDialog.find('.dialogTitle');
    dialogTitle.text(title);

    var dialogMessage = genericDialog.find('.dialogMessage');
    dialogMessage.text(msg);

    buttonText = buttonText || 'CLOSE';
    var dialogActionButton = genericDialog.find('#genericDialogButton');
    dialogActionButton.text(buttonText);

    var secondaryActionButton = genericDialog.find('#secondaryGenericDialogButton');
    if (secondButtonText) {
        secondaryActionButton.text(secondButtonText);
    }
    else {
        secondaryActionButton.hide();
    }

    genericDialog
        .dialog({
            dialogClass: 'noTitleStuff fixed-dialog',
            resizable: false,
            modal: true,
            autoOpen: true,
            draggable: false,
            open: function(e, ui) {
                // bind close
                $('.genericDialog').unbind().bind('click', function(e) {
                    e.stopPropagation();
                });

                $('.ui-dialog.fixed-dialog, .dialogCloseButton').unbind().bind('click', function() {
                    $('.genericDialog').dialog('close');
                });

                dialogActionButton.unbind().bind('click', function() {
                    $('.genericDialog').dialog('close');

                    if (buttonHandler) {
                        buttonHandler();
                    }
                });

                if (secondButtonText) {
                    secondaryActionButton.unbind().bind('click', function() {
                        $('.genericDialog').dialog('close');

                        if (secondButtonHandler) {
                            secondButtonHandler();
                        }
                    });
                }
            }
        });
}


function createTermsAndConditionsDialog (msg, termsAndConditions, acceptCallback, declineCallback) {
    var dialog = $('#termsAndConditionsDialog');

    dialog.find('.dialogTitle').text('Terms and Conditions v' + termsAndConditions.version);
    if (msg) {
        dialog.find('.dialogMessage').text(msg);
    }
    dialog.find('#termsAndConditionsDialogContent').text(termsAndConditions.content);

    dialog
        .dialog({
            dialogClass: 'noTitleStuff fixed-dialog',
            resizable: false,
            modal: true,
            autoOpen: true,
            draggable: false,
            open: function(e, ui) {
                // bind close
                $('#termsAndConditionsDialog').unbind().bind('click', function(e) {
                    e.stopPropagation();
                });

                $('.ui-dialog.fixed-dialog, .dialogCloseButton').unbind().bind('click', function() {
                    $('#termsAndConditionsDialog').dialog('close');
                });

                $('#termsAndConditionsDialogAccept').unbind().bind('click', function() {
                    $('#termsAndConditionsDialog').dialog('close');

                    acceptCallback(termsAndConditions);
                });

                $('#termsAndConditionsDialogDecline').unbind().bind('click', function() {
                    $('#termsAndConditionsDialog').dialog('close');

                    if (declineCallback) {
                        declineCallback(termsAndConditions);
                    }
                });
            }
        });
}


function createGameRulesUpdatesDialog (gameRulesUpdates, callback) {

    var dialog = $('#gameRulesUpdatesDialog');
    var contentList = dialog.find('#gameRulesUpdatesListBody').text('');

    for (var i = 0; i < gameRulesUpdates.length; i++) {
        // generate item of the list
        var gameRule = gameRulesUpdates[i];

        var updateDate = moment(gameRule.date);

        var html = '<div class="gameRuleItem">';
        html += '<h2 class="gameRuleItemSubtitle">Version ' + gameRule.version + ' - ' + updateDate.format("MMM DD 'YY") + '</h2>';
        html += '<p class="gameRuleItemContent">' + gameRule.message + '</p>';
        html += '</div>';

        contentList.append(html);
    }

    dialog
        .dialog({
            dialogClass: 'noTitleStuff fixed-dialog',
            resizable: false,
            modal: true,
            autoOpen: true,
            draggable: false,
            open: function(e, ui) {
                // bind close
                $('#gameRulesUpdatesDialog').unbind().bind('click', function(e) {
                    e.stopPropagation();
                });

                $('.ui-dialog.fixed-dialog, .dialogCloseButton').unbind().bind('click', function() {
                    $('#gameRulesUpdatesDialog').dialog('close');
                });

                dialogActionButton.unbind().bind('click', function() {
                    $('#gameRulesUpdatesDialog').dialog('close');

                    if (callback) {
                        callback();
                    }
                });
            }
        });
}