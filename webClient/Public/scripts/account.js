const FAST_PAY_URL = 'https://www.apsp.biz/pay/FP5A/checkout.aspx';
const PAYMENT_OPTIONS_WITH_THIRD_STEP = ['QIWI', 'GIROPAY', 'BANKTRANSFER'];

var selectedOption;
var selectedOptionPanel;
var user;
var withdrawAmount;
var depositAmount;
var purplePaySupportedBankCodes;
var selectedPaymentMethodDeposit;
var selectedPaymentMethodWithdrawals;

var balanceUpdates;

var transactionHistory;


$ (function () {
    $.ajax({
        type : 'GET',
        dataType : 'JSON',
        url : '/api/getUserDetails',
        statusCode : {
            200 : function (res) {
                user = res;
                setupAccountInformation(user);

                initUI();
            },
            401 : function () {
                goToLogin();
            },
            501 : function (err) {
                createErrorDialog('User details', err.responseText);
            }
        }
    });
});


function initUI() {
    var panelTitle = $('#panelTitle');

    var accountInfoOption = $('#accountInfoOption');
    accountInfoOption.click(function () {
        panelTitle.text('Account Information');
        if (optionSelected(this, $('#accountInfoContainer'))) {
            if (user) {
                setupAccountInformation(user);
            }
            window.location = '/account#info';
        }
    });

    var depositOption = $('#depositOption');
    depositOption.click(function () {
        panelTitle.text('Deposit');
        if (optionSelected(this, $('#depositContainer'))) {
            loadAvailablePaymentMethods(TRANSACTION_TYPES.DEPOSIT);
            window.location = '/account#deposit';
        }
    });

    var withdrawOption = $('#withdrawOption');
    withdrawOption.click(function () {
        panelTitle.text('Withdraw');
        if (optionSelected(this, $('#withdrawalContainer'))) {
            loadAvailablePaymentMethods(TRANSACTION_TYPES.WITHDRAWAL);
            window.location = '/account#withdraw';
        }
    });

    var transactionHistoryOption = $('#transactionHistoryOption');
    transactionHistoryOption.click(function () {
        panelTitle.text('Transaction History');
        if (optionSelected(this, $('#transactionHistoryContainer'))) {
            loadTransactionHistory();
            window.location = '/account#transactionHistory';
        }
    });

    var balanceHistoryOption = $('#balanceHistoryOption');
    balanceHistoryOption.click(function () {
        panelTitle.text('Balance History');
        if (optionSelected(this, $('#balanceHistoryContainer'))) {
            loadBalanceHistory();
            window.location = '/account#balanceHistory';
        }
    });

    var settingsOption = $('#settingsOption');
    settingsOption.click(function () {
        panelTitle.text('Settings');
        if (optionSelected(this, $('#settingsContainer'))) {
            
            window.location = '/account#settings';
        }
    });

    var hash = window.location.hash;
    switch (hash) {
        case '#deposit':
            depositOption.click();
            break;
        case '#withdraw':
            withdrawOption.click();
            break;
        case '#transactionHistory':
            transactionHistoryOption.click();
            break;
        case '#balanceHistory':
            balanceHistoryOption.click();
            break;
        case '#settings':
            settingsOption.click();
            break;
        default:
            accountInfoOption.click();
    }

    setupTransactionsForms();
    setupTransactionHistoryTable();
    setupBalanceHistoryTable();
    setupSettings();
}


function optionSelected (option, optionPanel) {
    if (selectedOptionPanel && selectedOptionPanel[0] == optionPanel[0]) return false;

    if (selectedOption) {
        selectedOptionPanel.hide();
        selectedOption.removeAttr('selected');
    }

    optionPanel.show();
    selectedOptionPanel = optionPanel;

    selectedOption = $(option);
    selectedOption.attr('selected', true);

    return true;
}


function setupAccountInformation (user) {
    $('#balanceText').text(formatMoney(user.balance));
    $('#freePlayBalanceText').text(formatPoints(user.freeMoneyBalance));
    $('#usernameText').text(user.username);
    $('#registrationDateText').text(moment(user.registrationDate).format('MM / DD / YYYY'));
    $('#firstNameText').text(user.firstName);
    $('#lastNameText').text(user.lastName);
    $('#birthDateText').text(moment(user.birthDate).format('MM / DD / YYYY'));
    $('#emailText').text(user.email);
    $('#countryText').text(getCountryNameFromISO(user.country));
    $('#cityText').text(user.city);
    $('#zipCodeText').text(user.zipCode);
    $('#streetText').text(user.street  + ', ' + user.streetNum);

    $('#accountInfoDepositButton').click(function () {
        $('#depositOption').click();
    });

    $('#passwordResetButton').click(function () {
        sendPasswordResetRequest();
    });

    if (isUserInFreePlayMode(user)) {
        $('#freePlayModeButton').addClass('selected');
    }
    else {
        $('#realMoneyModeButton').addClass('selected');
    }

    $('.playModeFilterButton').on('click', function () {
        if ($(this).hasClass('selected')) return;
        $(this).addClass('selected');

        var playMode = (this.id === 'freePlayModeButton') ? PLAY_MODE.FREE : PLAY_MODE.REAL;
        sendSetPlayModeRequest(playMode);

        $('#playModeProgress').show();
    });

    var editInfoBtn = $('#editInfoButton');
    if (user.isIdVerified) {
        editInfoBtn.hide();
    }
    else {
        editInfoBtn.click(function () {
            //TODO
        });
    }

    $('#changeEmailButton').click(function () {
        //TODO
    });

    $('#editResidenceButton').click(function () {
       //TODO
    });
}

function sendPasswordResetRequest () {
    $('#resetPasswordProgress').show();
    $('#passwordResetButton span').hide();
    $.ajax({
        type : 'POST',
        dataType : 'JSON',
        data : { emailOrUsername : getLoggedInUsername() },
        url : '/api/requestPasswordReset',
        statusCode : {
            200 : function () {
                createGenericDialog("Password Reset", "An email has been sent to the address related to your account to reset password.", "OK");
            },
            400 : function () {
                createWarningDialog("Server Error", "Unknown error occurred!", "Close");
            },
            404 : function () {
                createWarningDialog("Server Error", "Unknown error occurred!", "Close");
            },
            501 : function (err) {
                createWarningDialog("Password Reset Failed", "Something has gone wrong on the server. Please contact our support for details.", "Close");
            }
        }
    })
    .always(function(){
        $('#resetPasswordProgress').hide();
        $('#passwordResetButton span').show();
    });
}


function setupTransactionsForms () {
    const onAmountInput = function (e) {
        var field = $(e.target);
        var val = field.val();
        val = val.replace(/[,€]/g, '');

        var decimalIndex = val.indexOf('.');
        if (decimalIndex >= 0) {
            if (val.match(/\./g).length === 1) {
                var decimals = val.substring(decimalIndex, decimalIndex + 3);
            }
            else {
                decimals = val.substring(decimalIndex, val.length - 1);
            }
            val = val.substring(0, decimalIndex);
        }
        val = parseFloat(val);

        field.val(formatMoney(val) + (decimals ? decimals : ''));
    };

    $('#depositAmount').on('input', onAmountInput);
    $('#withdrawAmount').on('input', onAmountInput);


    $('#depositNext').click(function () {
        onTransactionNextStep($('#depositContainer'), selectedPaymentMethodDeposit, TRANSACTION_TYPES.DEPOSIT);
    });

    $('#withdrawNext').click(function () {
        onTransactionNextStep($('#withdrawalContainer'), selectedPaymentMethodWithdrawals, TRANSACTION_TYPES.WITHDRAWAL);
    });

    $('#depositPrevious').click(function () {
        onTransactionPreviousStep($('#depositContainer'), selectedPaymentMethodDeposit, TRANSACTION_TYPES.DEPOSIT);
    });

    $('#withdrawPrevious').click(function () {
        onTransactionPreviousStep($('#withdrawalContainer'), selectedPaymentMethodWithdrawals, TRANSACTION_TYPES.WITHDRAWAL);
    });
}


function setupTransactionHistoryTable () {
    var tableHead = document.createElement('thead');

    var header = document.createElement('tr');
    tableHead.appendChild(header);

    var th = document.createElement('th');
    th.className = 'transactionData transactionAmount';
    th.setAttribute('data-sort', 'float');
    th.setAttribute('data-sort-default', 'desc');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'transactionHeaderText';
    button.innerHTML = 'Amount';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'transactionData transactionMethod';
    th.setAttribute('data-sort', 'string');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'transactionHeaderText';
    button.innerHTML = 'Payment Provider';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'transactionData transactionId';
    th.setAttribute('data-sort', 'int');
    header.appendChild(th);

    var button = document.createElement('button');
    button.className = 'transactionHeaderText';
    button.innerHTML = 'Transaction ID';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'transactionData transactionDate';
    th.setAttribute('data-sort', 'timestamp');
    th.setAttribute('data-sort-default', 'desc');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'transactionHeaderText';
    button.innerHTML = 'Date';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'transactionData transactionStatus';
    th.setAttribute('data-sort', 'string');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'transactionHeaderText';
    button.innerHTML = 'Status';
    th.appendChild(button);

    var headTable = $('#transactionHistoryHeadTable');
    headTable[0].appendChild(tableHead);

    $('#transactionHistoryTableContainer').sortableClusterizeTable({
        scrollId: 'transactionHistoryScrollArea',
        contentId: 'transactionHistoryTableBody',
        generateRowHtml: transactionHistoryRowHtml,
        rows_in_block: 10,
        sortable: true,
        sortInfo: {
            column: 3,
            dataType: 'timestamp',
            direction: $.fn.sortableClusterizeTable.dir.DESC,
            valueFns: [
                function (data) {
                    return data.amount;
                },
                function (data) {
                    return data.paymentMethod;
                },
                function (data) {
                    return data.pspID;
                },
                function (data) {
                    return (moment(data.time).unix() * 1000);
                },
                function (data) {
                    return data.status;
                }
            ]
        },
        secondSortInfo: {
            dataType: 'timestamp',
            direction: $.fn.sortableClusterizeTable.dir.DESC,
            sortFn: function (data) {
                return (moment(data.time).unix() * 1000);
            }
        }
    });
}


function transactionHistoryRowHtml (data) {
    var html = '<tr id="' + data.pspID + '" class="tableRow">';

    html += '<td class="tableData transactionData transactionAmount"><div class="rowIndicator"></div><div class="hoverIndicator"></div>' + formatMoney(data.amount) + '</td>';
    html += '<td class="tableData transactionData transactionMethod singleLineText"><img class="transactionMethodLogo" src="' + LOGO_FOR_PAYMENT[data.paymentMethod] +'"></td>';
    html += '<td class="tableData transactionData transactionId singleLineText">' + data.pspID + '</td>';
    html += '<td class="tableData transactionData transactionDate">' + moment(data.time).format('HH:mm - DD/MM/YY') + '</td>';
    html += '<td class="tableData transactionData transactionStatus hasTooltip"><img src="/icongraphy/svg/' + transactionStatusIcon(data.status) + '"/><div class="tooltipBox"><span class="tooltipInner tooltipText">' + transactionStatusText(data.status) + '</span></div></td>';

    html += '</tr>';

    return html;
}


function setupBalanceHistoryTable () {
    var tableHead = document.createElement('thead');

    var header = document.createElement('tr');
    tableHead.appendChild(header);

    var th = document.createElement('th');
    th.className = 'balanceData balanceIncoming';
    th.setAttribute('data-sort', 'float');
    th.setAttribute('data-sort-default', 'desc');
    header.appendChild(th);

    var button = document.createElement('button');
    button.className = 'balanceHeaderText';
    button.innerHTML = 'Amount';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'balanceData balanceReason';
    th.setAttribute('data-sort', 'string');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'balanceHeaderText';
    button.innerHTML = 'Reason';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'balanceData balanceTime';
    th.setAttribute('data-sort', 'timestamp');
    th.setAttribute('data-sort-default', 'desc');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'balanceHeaderText';
    button.innerHTML = 'Date';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'balanceData balanceInfo';
    th.setAttribute('data-sort', 'string');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'balanceHeaderText';
    button.innerHTML = 'Info';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'balanceData balanceRefId';
    th.setAttribute('data-sort', 'string');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'balanceHeaderText';
    button.innerHTML = 'Reference ID';
    th.appendChild(button);

    th = document.createElement('th');
    th.className = 'balanceData balanceAmount';
    th.setAttribute('data-sort', 'float');
    th.setAttribute('data-sort-default', 'desc');
    header.appendChild(th);

    button = document.createElement('button');
    button.className = 'balanceHeaderText';
    button.innerHTML = 'Balance';
    th.appendChild(button);

    var headTable = $('#balanceHistoryHeadTable');
    headTable[0].appendChild(tableHead);

    $('#balanceHistoryTableContainer').sortableClusterizeTable({
        scrollId: 'balanceHistoryScrollArea',
        contentId: 'balanceHistoryTableBody',
        generateRowHtml: balanceHistoryRowHtml,
        rows_in_block: 15,
        sortable: true,
        sortInfo: {
            column: 2,
            dataType: 'timestamp',
            direction: $.fn.sortableClusterizeTable.dir.DESC,
            valueFns: [
                function (data) {
                    return data.amount;
                },
                function (data) {
                    return balanceUpdateToString(data.reason);
                },
                function (data) {
                    return (moment(data.date).unix() * 1000);
                },
                function (data) {
                    if (data.tournamentName) {
                        return data.tournamentName;
                    }
                    else {
                        return '';
                    }
                },
                function (data) {
                    if (data.tournamentId) {
                        return data.tournamentId;
                    }
                    else {
                        return '';
                    }
                },
                function (data) {
                    return data.balanceSum;
                }
            ]
        },
        secondSortInfo: {
            dataType: 'timestamp',
            direction: $.fn.sortableClusterizeTable.dir.DESC,
            sortFn: function (data) {
                return (moment(data.date).unix() * 1000);
            }
        }
    });
}


function balanceHistoryRowHtml (data) {
    var html = '<tr id="' + data._id + '" class="tableRow">';

    if (data.tournamentId) {
        var refId = data.tournamentId;
        var what = data.tournamentName;
        var isContest = true;
    }
    else {
        refId = data.transactionId;
        if (!data.paymentMethod) return;
        what = data.paymentMethod.toUpperCase();
        isContest = false;
    }

    html += '<td class="tableData balanceData balanceIncoming"><div class="rowIndicator"></div><div class="hoverIndicator"></div>' + formatMoney(data.amount) + '</td>';
    html += '<td class="tableData balanceData balanceReason hasTooltip"><img src="/icongraphy/svg/' + balanceUpdateToIcon(data.reason) + '"/><div class="tooltipBox"><span class="tooltipInner tooltipText">' + balanceUpdateToString(data.reason) + '</span></div></td>';
    html += '<td class="tableData balanceData balanceTime">' + moment(data.date).format('HH:mm - DD/MM/YY') + '</td>';
    html += '<td class="tableData balanceData balanceInfo singleLineText">' + (isContest ? what : '<img class="transactionMethodLogo" src="' + LOGO_FOR_PAYMENT[what] +'">') + '</td>';
    html += '<td class="tableData balanceData balanceRefId hasTooltip"><div class="tooltipBox balanceRefTooltipContainer"><span class="tooltipInner tooltipText">' + refId + '</span></div>' + refId.substring(0, 6) + ' …' + '</td>';
    html += '<td class="tableData balanceData balanceAmount">' + formatMoney(data.balanceSum) + '</td>';

    html += '</tr>';

    return html;
}


function loadAvailablePaymentMethods (transactionType) {
    $.ajax(
        {
            type : 'GET',
            url : '/api/getAvailablePaymentMethods',
            data : { transactionType : transactionType },
            dataType : 'json',
            statusCode : {
                200 : function (res) {
                    purplePaySupportedBankCodes = res.bankCodes;
                    showPaymentMethods(res.paymentMethods, res.transactionType);
                }
            }
        }
    );
}


function showPaymentMethods(paymentMethods, transactionType) {
    var container = (transactionType === TRANSACTION_TYPES.DEPOSIT ? $('#depositOptionsContainer') : $('#withdrawalOptionsContainer'));

    var list = container.find('.paymentsMethodsList');
    list.empty();

    for (var i = 0; i < paymentMethods.length; i++) {
        var payment = paymentMethods[i];
        var el = $('<li class="paymentOption" id="' + payment.code + '"><img src="' + LOGO_FOR_PAYMENT[payment.code]  +'"</li>');
        list.append(el);

        el.click(function () {

            var el = $(this.el);
            if (el.attr('selected')) return;

            $('.paymentOption[selected]').removeAttr('selected');
            el.attr('selected', true);

            if (transactionType === TRANSACTION_TYPES.DEPOSIT) {
                var nextButton = $('#depositNext');
                selectedPaymentMethodDeposit = this.paymentOption;
            }
            else {
                nextButton = $('#withdrawNext');
                selectedPaymentMethodWithdrawals = this.paymentOption;
            }
            nextButton.removeAttr('disabled');

        }.bind({ el : el, paymentOption : payment }));
    }
}


function onTransactionNextStep (container, paymentMethod, transactionType) {
    var mainStepsContainer = container.find('.mainPaymentStepsContainer');
    var extraStepsContainer = container.find('.extraPaymentStepsContainer');
    var confirmContainer = container.find('.paymentConfirmationContainer');
    var isDeposit = (transactionType === TRANSACTION_TYPES.DEPOSIT);
    var isWithdrawal = (transactionType === TRANSACTION_TYPES.WITHDRAWAL);

    // if payment option has more steps, show extra options in the next screen
    if (PAYMENT_OPTIONS_WITH_THIRD_STEP.indexOf(paymentMethod.code) >= 0 && !extraStepsContainer.is(':visible')) {

        mainStepsContainer.hide();
        container.find('.paymentPreviousButton').show();
        showExtraOptionsForTransaction(extraStepsContainer, paymentMethod);

    }
    else {

        // check for errors and start transaction
        var amountInput = (isDeposit ? $('#depositAmount') : $('#withdrawAmount'));
        var val = amountInput.val();
        val = val.replace(/[,€]/g, '');
        var amount = parseFloat(val);
        var errorMessage;
        var $selectedPanel = $(selectedOptionPanel);

        if (isNaN(amount) || amount <= 0) {
            if (isDeposit) {
                errorMessage = 'Please enter the amount to deposit';
            }
            else {
                errorMessage = 'Please enter the amount to withdraw';
            }
        }

        var data = { amount : amount, transactionType : transactionType, paymentMethod : paymentMethod.code };

        // check mobile number validity
        var mobileNumberInput = $('#mobileNumberInput');
        if (mobileNumberInput.is(':visible')) {
            var mobileNumber = mobileNumberInput.val();
            mobileNumber = mobileNumber.replace(/\s/g, '');

            // numbers only
            if (mobileNumber.length < 6 || !/^\d+$/.test(mobileNumber)) {
                errorMessage = 'Please enter a valid phone number';
            }
            else {
                data['mobileNumber'] = mobileNumber;
            }
        }

        // check iban/bic validity for giropay
        var ibanInput = $selectedPanel.find('#giropayIbanInput');
        var bicInput = $selectedPanel.find('#giropayBicInput');
        if (ibanInput.is(':visible') && bicInput.is(':visible')) {
            var iban = ibanInput.val().toUpperCase();
            var bic = bicInput.val().toUpperCase();
            iban = iban.replace(/\s/g, '');
            bic = bic.replace(/\s/g, '');

            if (!/DE[0-9]{20}/.test(iban)) {
                errorMessage = 'IBAN is not valid: it must start with "DE" followed by 20 numeric digits';
            }
            else if (!(bic.length === 8 || bic.length === 11)) {
                errorMessage = 'BIC code is not valid: it must be 8 or 11 alphanumeric digits';
            }
            else {
                data['iban'] = iban;
                data['bic'] = bic;
            }
        }
        else {
            // for purplepay, bank transfers are avaible for norway and turkey, check validity patterns
            var bankCodesDropdown = $selectedPanel.find('#bankCodesDropdown');
            ibanInput = $selectedPanel.find('#purplePayIbanInput');
            bicInput = $selectedPanel.find('#purplePayBicInput');

            if (ibanInput.is(':visible') && bicInput.is(':visible') && bankCodesDropdown.is(':visible')) {
                var bankCode = bankCodesDropdown.find(':selected').attr('id');
                iban = ibanInput.val().toUpperCase();
                bic = bicInput.val().toUpperCase();
                iban = iban.replace(/\s/g, '');
                bic = bic.replace(/\s/g, '');

                if (!bankCode) {
                    errorMessage = 'Please select a bank';
                }
                else if (!/TR[0-9]{24}/.test(iban) && !/NO[0-9]{13}/.test(iban)) {
                    errorMessage = 'IBAN is not valid';
                }
                else if (bic.length !== 11) {
                    errorMessage = 'BIC code is not valid: it must be 11 alphanumeric digits';
                }
                else {
                    data['iban'] = iban;
                    data['branchCode'] = bic.substring(8);
                    data['bankCode'] = bankCode;
                }
            }
        }

        var errorText = $(selectedOptionPanel).find('.errorMessage');

        if (errorMessage) {
            errorText.text(errorMessage);
            return;
        }

        errorText.text('');

        if (isWithdrawal && !confirmContainer.is(':visible')) {
            // show confirmation screen
            mainStepsContainer.hide();
            extraStepsContainer.hide();
            container.find('.paymentPreviousButton').show();
            confirmContainer.show();
        }
        else {
            initTransaction(container, transactionType, data);
        }
    }
}


function onTransactionPreviousStep (container, paymentMethod, transactionType) {
    var mainStepsContainer = container.find('.mainPaymentStepsContainer');
    var extraStepsContainer = container.find('.extraPaymentStepsContainer');
    var confirmContainer = container.find('.paymentConfirmationContainer');
    var previousButton = container.find('.paymentPreviousButton');
    var nextButton = container.find('.paymentNextButton');
    var isWithdrawal = (transactionType === TRANSACTION_TYPES.WITHDRAWAL);

    if (extraStepsContainer.is(':visible')) {
        extraStepsContainer.hide();
        previousButton.hide();
        mainStepsContainer.show();
    }
    else {
        if (isWithdrawal && confirmContainer.is(':visible')) {
            confirmContainer.hide();
        }
        else {
            container.removeAttr('provider');
            container.find('.paymentProviderContainer').hide();
        }

        nextButton.show();

        if (PAYMENT_OPTIONS_WITH_THIRD_STEP.indexOf(paymentMethod.code) >= 0) {
            extraStepsContainer.show();
        }
        else {
            mainStepsContainer.show();
            previousButton.hide();
        }
    }
}


function showExtraOptionsForTransaction (container, paymentMethod) {
    container.empty();

    var title = $('<p class="transactionStepText"></p>');
    container.append(title);

    switch (paymentMethod.code) {
        case 'QIWI':
            var titleText = '3. Enter your mobile number (required for Qiwi)';

            container.append('<div class="transactionInputContainer"><input type="number" class="transactionInput" id="mobileNumberInput"></div>');

            break;

        case 'GIROPAY':
            titleText = '3. Enter your bank information';

            container.append('<div class="transactionInputContainer"><input type="text" class="transactionInput" id="giropayIbanInput" placeholder="IBAN"></div>');
            container.append('<div class="transactionInputContainer"><input type="text" class="transactionInput" id="giropayBicInput" placeholder="BIC/SWIFT code"></div>');

            break;

        case 'BANKTRANSFER': // only for withdrawals
            titleText = '3. Enter your bank information';

            var inputContainer = $('<div class="transactionInputContainer"></div>');
            var banksDropdown = $('<select class="form-control transactionInput" id="bankCodesDropdown"></select>');
            banksDropdown.append('<option selected disabled>-- Choose your bank --</option>');
            for (var i = 0; i < purplePaySupportedBankCodes.length; i++) {
                var bankOption = purplePaySupportedBankCodes[i];
                banksDropdown.append('<option id="' + bankOption.code + '">' + bankOption.name + '</option>');
            }
            inputContainer.append(banksDropdown);
            container.append(inputContainer);

            container.append('<div class="transactionInputContainer"><input type="text" class="transactionInput" id="purplePayIbanInput" placeholder="IBAN"></div>');
            container.append('<div class="transactionInputContainer"><input type="text" class="transactionInput" id="purplePayBicInput" placeholder="BIC/SWIFT code"></div>');

            break;
    }

    title.text(titleText);

    container.show();
}


function initTransaction (container, transactionType, data) {
    $.ajax(
        {
            type : 'GET',
            url : '/api/getFastPayXML',
            data : data,
            dataType : 'json',
            statusCode : {
                200 : function (res) {
                    var response = res.responseText.toLowerCase();
                    var responseTransactionType = response.match(/<actiontype>(.+?)<\/actiontype>/)[1];

                    if (responseTransactionType != transactionType) return;

                    if (transactionType === TRANSACTION_TYPES.DEPOSIT) {
                        var successCallback = showDepositSuccessful;
                        depositAmount = data.amount;
                    }
                    else {
                        successCallback = showWithdrawalSuccessful;
                        withdrawAmount = data.amount;
                    }

                    var xml = encodeURIComponent(res.responseText);

                    container.attr('provider', true);
                    container.find('.mainPaymentStepsContainer').hide();
                    var paymentProviderContainer = container.find('.paymentProviderContainer');
                    paymentProviderContainer.empty();
                    paymentProviderContainer.show();
                    container.find('.paymentNextButton').hide();
                    container.find('.paymentPreviousButton').show();

                    setupFastPay(xml, paymentProviderContainer, transactionType);
                    // showTransactionError();

                    // setup socket events to react to transaction results
                    var transactionId = response.match(/<oref>(.+?)<\/oref>/)[1];
                    socket.on('transactionSuccess:' + transactionId, successCallback);
                    socket.on('transactionError:' + transactionId, showTransactionError);
                    socket.on('transactionPending:' + transactionId, showTransactionPending);
                },
                202 : function (res) {
                    createWarningDialog("Payment failed", res.responseText);
                },
                400 : function () {
                    showTransactionError();
                },
                401 : function () {
                    showTransactionError('Not authorized')
                },
                403 : function (res) {
                    createWarningDialog("Payment failed", res.responseText, "Close", null, "Send new e-mail", function () {
                        requestNewAccountVerificationEmail();
                    });
                },
                501 : function () {
                    showTransactionError();
                }
            }
        }
    );
}


function setupFastPay (xml, container, transactionType) {
    var iFrameName = (transactionType === TRANSACTION_TYPES.DEPOSIT) ? 'depositFrame' : 'withdrawalFrame';
    container.append($('<iframe class="transactionFrame" id="' + iFrameName + '" name="' + iFrameName + '"></iframe>'));
    var postToIframe = $('<form action="'+FAST_PAY_URL+'" method="post" target="' + iFrameName + '" id="postToIframe"></form>');

    container.append(postToIframe);
    postToIframe = $(postToIframe);

    var xmlInput = $('<input type="hidden" name="params" value="'+ xml +'" />');

    postToIframe.append(xmlInput);
    postToIframe.submit().remove();
}


function showDepositSuccessful () {
    var container = $(selectedOptionPanel);
    container.empty();
    container.append($('<iframe class="transactionFrame" src="/transaction/depositSuccess"></iframe>'));

    user.balance += depositAmount;
    depositAmount = 0;
}


function showWithdrawalSuccessful () {
    var container = $(selectedOptionPanel);
    container.empty();
    container.append($('<iframe class="transactionFrame" src="/transaction/withdrawalSuccess"></iframe>'));

    user.balance -= withdrawAmount;
    withdrawAmount = 0;
}


function showTransactionError (message) {
    var container = $(selectedOptionPanel);
    container.empty();
    container.append($('<iframe class="transactionFrame" src="/transaction/error' + (message ? '?message=' + message : '' ) + '"></iframe>'));
}


function showTransactionPending () {
    var container = $(selectedOptionPanel);
    container.empty();
    container.append($('<iframe class="transactionFrame" src="/transaction/pending"></iframe>'));
}

function showTransactionProcessing () {
    var container = $(selectedOptionPanel);
    container.empty();
    container.append($('<iframe class="transactionFrame" src="/transaction/processing"></iframe>'));
}


function sendSetPlayModeRequest (playMode) {

    $.ajax({
        type : 'POST',
        dataType : 'JSON',
        data : { playMode : playMode },
        url : '/api/setUserPlayMode',
        statusCode : {
            200 : function () {
                user.playMode = playMode;
                $('#playModeProgress').hide();
                if (playMode == PLAY_MODE.REAL) {
                    $('#freePlayModeButton').removeClass('selected');
                }
                else if (playMode == PLAY_MODE.FREE) {
                    $('#realMoneyModeButton').removeClass('selected');
                }

                playModeChanged(user.playMode, getBalanceForCurrentPlayMode(user));
            },
            501 : function (err) {
                //TODO show error

                // restore previous selection
                $('#playModeProgress').hide();

                if (playMode == PLAY_MODE.REAL) {
                    $('#realMoneyModeButton').removeClass('selected');
                }
                else if (playMode == PLAY_MODE.FREE) {
                    $('#freePlayModeButton').removeClass('selected');
                }
            }
        }
    });
}


function loadBalanceHistory () {
    $.ajax(
        {
            type : 'GET',
            url : '/api/getBalanceHistory',
            dataType : 'json',
            statusCode : {
                200 : function (newBalanceUpdates) {
                    if (!balanceUpdates || balanceUpdates.length !== newBalanceUpdates.length) {
                        // only keep real money updates
                        var balanceSum = user.balance;

                        for (var i = 0; i < newBalanceUpdates.length; i++) {
                            var update = newBalanceUpdates[i];

                            if (update.playMode === PLAY_MODE.REAL) {
                                if (i !== 0) {
                                    balanceSum -= newBalanceUpdates[i - 1].amount;
                                }
                                update.balanceSum = balanceSum;
                                continue;
                            }

                            newBalanceUpdates.splice(i, 1);
                            i--;
                        }
                        balanceUpdates = newBalanceUpdates;

                        fillInBalanceHistoryTable(balanceUpdates);
                    }
                }
            }
        }
    );
}


function loadTransactionHistory () {
    $.ajax(
        {
            type : 'GET',
            url : '/api/getTransactionsHistory',
            dataType : 'json',
            statusCode : {
                200 : function (newTransactions) {
                    if (!transactionHistory || transactionHistory.length !== newTransactions.length) {
                        transactionHistory = newTransactions;

                        fillInTransactionHistoryTable(transactionHistory);
                    }
                }
            }
        }
    );
}


function fillInBalanceHistoryTable (balanceUpdates) {
    $('#balanceHistoryTableContainer').sortableClusterizeTable('update', balanceUpdates);
    drawClusterizeHeadTable($('#balanceHistoryTable'));
}


function fillInTransactionHistoryTable (transactions) {
    $('#transactionHistoryTableContainer').sortableClusterizeTable('update', transactions);
    drawClusterizeHeadTable($('#transactionHistoryTable'));
}


function setupSettings () {
    $('#applySettings').click(function () {

        var responsibleGamingValuesChanged = false;
        var allowRealMoney = $('#allowRealMoneyToggle').prop('checked');
        var maxEntryFee = parseFloat($('#maxContestFeeInput').val());
        var monthlySpendingCap = parseFloat($('#monthlySpendingInput').val());

        var error = $('#settingsError');

        if (isNaN(maxEntryFee) || isNaN(monthlySpendingCap) || maxEntryFee < 0 || monthlySpendingCap < 0) {
            error.text('Numeric values must be greater than 0 or equal');
            error.show();
            return;
        }

        error.hide();

        if (maxEntryFee !== user.settings.maxEntryFee) {
            responsibleGamingValuesChanged = true;
        }
        if (monthlySpendingCap !== user.settings.monthlySpendingCap) {
            responsibleGamingValuesChanged = true;
        }
        if (allowRealMoney !== user.settings.allowRealMoney) {
            responsibleGamingValuesChanged = true;
        }

        if (responsibleGamingValuesChanged) {
            const confirmCallback = function () {

                user.settings.maxEntryFee = maxEntryFee;
                user.settings.monthlySpendingCap = monthlySpendingCap;
                user.settings.allowRealMoney = allowRealMoney;

                updateSettings(user.settings);
            };

            createWarningDialog('Confirm settings changes', 'You have changed some settings relative to responsible gaming. ' +
                'For your safety, once updated, you will not be able to modify those settings before 7 days have passed.', 'Apply Settings', confirmCallback, 'Cancel');
        }
        else {
            updateSettings(user.settings);
        }
    });

    if (user.settings.allowRealMoney) {
        $('#allowRealMoneyToggle').click();
    }
    if (user.settings.maxEntryFee) {
        $('#maxContestFeeInput').val(user.settings.maxEntryFee);
    }
    if (user.settings.monthlySpendingCap) {
        $('#monthlySpendingInput').val(user.settings.monthlySpendingCap);
    }
}


function updateSettings (settings) {
    $.ajax(
        {
            type : 'POST',
            url : '/api/updateUserSettings',
            data : settings,
            dataType : 'json',
            statusCode : {
                200 : function () {
                    createGenericDialog('Settings updated', 'Changes applied with success!');
                },
                400 : function (res) {
                    createErrorDialog('Failed to update settings', res.responseText);
                },
                403 : function (res) {
                    createErrorDialog('Failed to update settings', res.responseText);
                },
                401 : function () {
                    createErrorDialog('Failed to update settings', 'Not authorized');
                }
            }
        }
    );
}