var crypto = require('crypto');
var constants = require('../util/constants');
var Currency = require('../models/enums/Currency');
var models = require('../models/index');
var db = require('../db/dbManager');
var helper = require('../util/helper');
var emailer = require('../util/emailer');
var logger = require('../util/logger');
var moment = require('moment');
var routes = require('../net/routes');
var socket = require('../net/socket');
var TransactionType = models.TransactionType;

var FASTPAY_SECRET_HASH = '76e96b177b';
var FASTPAY_PROFILE_ID = '586F04CE13D84F2A85CCC7353FD24121';
var APCO_IP_ADDRESSES = [ '78.133.121.102', '78.133.121.98', '213.165.190.20', '217.168.166.66' ];
var REDIRECTION_URL = constants.WEBSITE_URL + ':' + constants.SERVER_PORT + routes.TRANSACTION_PROCESSING;
var FAILED_REDIRECTION_URL = constants.WEBSITE_URL + ':' + constants.SERVER_PORT + routes.TRANSACTION_ERROR;
var STATUS_URL = constants.WEBSITE_URL + ':' + constants.API_SERVER_PORT + '/api' + routes.API_FAST_PAY_STATUS_URL;
var MIN_AMOUNT_DEPOSIT = 10;
var MAX_AMOUNT_DEPOSIT = 500;
var MIN_AMOUNT_WITHDRAWAL = 10;
var MAX_AMOUNT_WITHDRAWAL = 10000;


function handleGetFastPayXMLRequest (req, res) {
    if (!req.user) {
        res.status(401).send();
        return;
    }

    if (req.user.isEmailValidated === false) {
        res.status(403).send('Your account hasn\'t been verified yet. \nSimply click the link in the e-mail that we have sent you and you are ready to go.');
        return;
    }

    if (req.query.transactionType && req.query.amount) {
        var transactionType = parseInt(req.query.transactionType);
        if (!transactionType) {
            res.status(400).send('Invalid request: invalid transaction type');
            return;
        }

        if (transactionType != TransactionType.DEPOSIT && transactionType != TransactionType.WITHDRAWAL) {
            res.status(400).send('Invalid request: transaction type missing or not supported');
            return;
        }

        var amount = parseFloat(req.query.amount);

        if (isNaN(amount)) {
            res.status(400).send('Invalid request: amount is not a valid number');
            return;
        }

        if (transactionType == TransactionType.DEPOSIT) {
            if (amount < MIN_AMOUNT_DEPOSIT) {
                res.status(202).send('The minimum amount allowed for deposits is €' + MIN_AMOUNT_DEPOSIT);
                return;
            }
            if (amount > MAX_AMOUNT_DEPOSIT) {
                res.status(202).send('The maximum amount allowed for deposits is €' + MAX_AMOUNT_DEPOSIT);
                return;
            }
        }
        else {
            if (amount < MIN_AMOUNT_WITHDRAWAL) {
                res.status(202).send('The minimum amount allowed for withdrawals is €' + MIN_AMOUNT_WITHDRAWAL);
                return;
            }
            if (amount > MAX_AMOUNT_WITHDRAWAL) {
                res.status(202).send('The maximum amount allowed for withdrawals is €' + MAX_AMOUNT_WITHDRAWAL);
                return;
            }
        }

        var paymentMethodCode = req.query.paymentMethod;

        if (!paymentMethodCode) {
            res.status(400).send('Invalid request: payment method is missing');
            return;
        }

        var paymentMethod = getPaymentMethod(paymentMethodCode);
        if (!paymentMethod || !isPaymentMethodValid(paymentMethod, req.user, transactionType)) {
            res.status(400).send('Invalid request: payment method is not valid');
            return;
        }

        var currency = Currency.getCurrencyISO(req.user.currency);

        var additionalData = {};
        if (req.query.mobileNumber) {
            additionalData['mobileNumber'] = req.query.mobileNumber;
        }
        if (req.query.iban) {
            additionalData['iban'] = req.query.iban;
        }
        if (req.query.bic) {
            additionalData['bic'] = req.query.bic;
        }
        if (req.query.bankCode) {
            additionalData['bankCode'] = req.query.bankCode;
        }
        if (req.query.branchCode) {
            additionalData['branchCode'] = req.query.branchCode;
        }

        generateFastPayXML(req.user, transactionType, amount, currency, paymentMethodCode, additionalData, function (err, status, xml) {

            if (err) {
                res.status(status).send(err);
                return;
            }

            var oref = xml.toLowerCase().match(/<oref>(.+?)<\/oref>/)[1];

            var transactionRequestDoc = {
                transactionId : oref,
                username : req.user.username,
                email : req.user.email,
                transactionType : transactionType,
                amount : amount,
                currency : currency,
                paymentMethod : paymentMethodCode,
                time : new Date()
            };

            db.insertTransactionRequest(transactionRequestDoc, function (err) {
                if (err) {
                    emailer.sendErrorEmail('Failed to insert transaction request', err + ' ||| ' + transactionRequestDoc);
                    logger.emerg('Failed to insert transaction request! ' + err);
                }
                else {
                    res.status(200).send(xml);
                }
            });
        });
    }
    else {
        res.status(400).send('Invalid request: missing fields');
    }
}


function generateFastPayXML (user, transactionType, amount, currency, paymentMethod, additionalData, callback) {
    helper.generateToken(function (oref) {
        var xml = createFastPayRequestXML(oref, user, transactionType, amount, currency, paymentMethod, additionalData);
        callback(null, 200, xml);
    });
}


function createFastPayRequestXML (oref, user, transactionType, amount, currency, paymentMethod, additionalData) {
    user.country = 'AT';

    var xml = '<ProfileID>' + FASTPAY_PROFILE_ID + '</ProfileID>' +
        '<ActionType>' + transactionType + '</ActionType>' +
        '<Value>' + amount +'</Value>' +
        '<Curr>' + currency + '</Curr>' +
        '<Lang>en</Lang>' +
        '<ORef>' + oref + '</ORef>' +
        '<UDF1>' + user.username + '</UDF1>' +
        '<UDF2>' + amount + '</UDF2>' +
        '<UDF3>' + currency +'</UDF3>' +
        '<Email>' + user.email + '</Email>' +
        '<Address>' + user.street + ',,' + user.city + ',' + user.zipCode + ',' + user.country + '</Address>' + // format is Street1,Street2,City,ZIP,State
        '<DOB>' + moment(user.birthDate).format('YYYY-MM-DD') + '</DOB>' +
        '<Country>' + user.country + '</Country>' +
        '<RegCountry>' + user.country + '</RegCountry>' +
        '<RegName>' + user.firstName + ' ' + user.lastName + '</RegName>' +
        '<RedirectionURL>' + REDIRECTION_URL + '</RedirectionURL>' +
        '<FailedRedirectionURL>' + FAILED_REDIRECTION_URL + '</FailedRedirectionURL>' +
        '<status_url urlEncode="true">' + STATUS_URL + '</status_url>' +
        '<CA></CA>' +
        '<HideSSLLogo></HideSSLLogo>' +
        '<Enc>UTF8</Enc>' +
        '<Only3DS />' +
        '<PostDeclined />' +

        '<TEST />' +
        '<TESTCARD />' + 
        '<ForcePayment>' + paymentMethod + '</ForcePayment>'
        ;

    if (transactionType === TransactionType.WITHDRAWAL && additionalData.pspID) {
        xml += '<PspID>' + additionalData.pspID + '</PspID>';
    }
    if (additionalData.mobileNumber) {
        xml += '<MobileNo>' + additionalData.mobileNumber + '</MobileNo>';
    }
    if (additionalData.iban) {
        xml += '<IBAN>' + additionalData.iban + '</IBAN>';
    }
    if (additionalData.bic) {
        xml += '<BIC>' + additionalData.bic + '</BIC>';
    }
    if (additionalData.branchCode) {
        xml += '<BranchCode>' + additionalData.branchCode + '</BranchCode>';
    }
    if (additionalData.bankCode) {
        xml += '<BankCode>' + additionalData.bankCode + '</BankCode>';
    }
    // for deposits with purple pay it does not matter which bank code we put because the user is prompted to choose the bank in the merchant site
    else if (paymentMethod === 'MBANKTRANSFER') {
        xml += '<BankCode>AK</BankCode>';
    }

    xml = '<Transaction hash="' + FASTPAY_SECRET_HASH + '">' + xml + '</Transaction>';

    // create hash based on the xml
    var hash = crypto.createHash('md5').update(xml).digest('hex').toUpperCase();
    xml = xml.replace(/hash="[a-zA-Z1-9]+"/g, 'hash="' + hash + '"');

    return xml;
}


function handleFastPayResponse (req, res) {
    if (!req.body.params) {
        res.status(400).send('Missing XML');
        return;
    }

    var xml = req.body.params.toLowerCase();
    console.log(xml); //TODO remove log

    var okCallback = function (transaction, shouldInsert) {
        if (shouldInsert) {
            db.insertTransaction(transaction, function (err) {
                if (err) {
                    handleFastPayResponseError('Failed to insert transaction: ' + err, xml, res, 501, transaction.transactionId);
                }
                else {
                    handleTransactionSuccessful(transaction.transactionId, res);
                }
            });
        }

        if (transaction.transactionType === TransactionType.DEPOSIT) {
            var amount = transaction.amount;
            var balanceUpdateReason = models.BalanceUpdate.DEPOSIT;
        }
        else if (transaction.transactionType === TransactionType.WITHDRAWAL) {
            amount = -transaction.amount;
            balanceUpdateReason = models.BalanceUpdate.WITHDRAWAL;
        }

        db.updateUserBalance(transaction.username, amount, balanceUpdateReason);
        db.insertBalanceUpdate(transaction.username, amount, balanceUpdateReason, null, transaction, models.PlayMode.REAL);

        sendPaymentResultEmail(transaction, PaymentStatus.OK);
    };

    var declinedCallback = function (transaction, status) {
        var errorMessage = 'Transaction cancelled';
        if (transaction.errorMessage) {
            errorMessage += ': ' + transaction.errorMessage;
        }

        handleTransactionError(transaction.transactionId, 200, errorMessage, res);

        sendPaymentResultEmail(transaction, status);
    };

    var pendingCallback = function (transaction) {
        db.insertTransaction(transaction, function (err) {
            if (err) {
                handleFastPayResponseError('Failed to insert transaction: ' + err, xml, res, 501, transaction.transactionId);
            }
            else {
                handleTransactionPending(transaction.transactionId, res);
            }
        });

        sendPaymentResultEmail(transaction, PaymentStatus.PENDING);
    };

    var errorCallback = function (error, status, transactionId) {
        handleFastPayResponseError(error, xml, res, status, transactionId);
    };

    createTransactionDocAndCheckResponseValidity(req, xml, okCallback, pendingCallback, declinedCallback, errorCallback);
}


function handleFastPayResponseError (err, xml, res, status, transactionId) {
    helper.sendFraudEmail(err, xml);
    logger.emerg('FastPay Response error:' + err + ' || response: ' + xml);

    handleTransactionError(transactionId, status, err, res);
}


function handleTransactionError (transactionId, status, err, res) {
    socket.transactionError(transactionId, err);
    res.status(status).send(err);
}


function handleTransactionSuccessful (transactionId, res) {
    socket.transactionSuccess(transactionId);
    res.status(200).send();
}


function handleTransactionPending (transactionId, res) {
    socket.transactionPending(transactionId);
    res.status(200).send();
}


/**
 * The response is considered valid when:
 * - fields are valid
 * - the host sending the request has a valid IP
 * - a transaction request with the same ORef value has been previously stored, which has identical transaction type, amount, currency and payment method
 * - the fields of the transaction request match those of the transaction response
 * - no complete transactions exist for the same ORef
 * @param req
 * @param xml
 * @param okCallback(transaction) - called when transaction is valid and status is ok
 * @param pendingCallback(transaction) - called when transaction is valid and pending
 * @param declinedCallback(transaction) - called when status is notok or declined
 * @param errorCallback(err, status, transactionId[optional]) - called when error
 */
function createTransactionDocAndCheckResponseValidity (req, xml, okCallback, pendingCallback, declinedCallback, errorCallback) {

    // check fields validity
    var oref = xml.match(/<oref>(.+?)<\/oref>/);
    if (!oref || oref.length === 0) {
        errorCallback('Received transaction with no ORef', 400);
        return;
    }

    oref = oref[1];

    var result = xml.match(/<result>(.+?)<\/result>/);
    if (!result || result.length === 0) {
        errorCallback('Received transaction with no result', 400, oref);
        return;
    }

    result = result[1];

    var value = xml.match(/<value>(.+?)<\/value>/);
    if (!value || value.length === 0) {
        errorCallback('Received transaction with no value', 400, oref);
        return;
    }

    value = parseFloat(value[1]);

    var currency = xml.match(/<currency>(.+?)<\/currency>/);
    if (!currency || currency.length === 0) {
        errorCallback('Received transaction with no currency', 400, oref);
        return;
    }

    currency = currency[1];

    var pspId = xml.match(/<pspid>(.+?)<\/pspid>/);
    if (!pspId || pspId.length === 0) {
        errorCallback('Received transaction with missing PspID', 400, oref);
        return;
    }

    pspId = pspId[1];

    var username = xml.match(/<udf1>(.+?)<\/udf1>/);
    if (!username || username.length === 0) {
        errorCallback('Received transaction with missing username (UDF1)', 400, oref);
        return;
    }

    username = username[1];

    var paymentMethod = xml.match(/<source>(.+?)<\/source>/);
    if (!paymentMethod || paymentMethod.length === 0) {
        errorCallback('Received transaction with missing payment method (source)', 400, oref);
        return;
    }

    paymentMethod = paymentMethod[1];

    //TODO handle different transaction methods
    var cardNum = xml.match(/<cardnum>(.+?)<\/cardnum>/);
    if (cardNum && cardNum.length !== 0) {
        cardNum = cardNum[1];
    }

    var cardExpiry = xml.match(/<cardexpiry>(.+?)<\/cardexpiry>/);
    if (cardExpiry && cardExpiry.length !== 0) {
        cardExpiry = cardExpiry[1];
    }

    var cardType = xml.match(/<cardtype>(.+?)<\/cardtype>/);
    if (cardType && cardType.length !== 0) {
        cardType = cardType[1];
    }

    // for bitcoins the response returns BTC. We get the EUR value from UDF2 and currency from UDF3
    if (paymentMethod === 'btc01') {
        value = xml.match(/<udf2>(.+?)<\/udf2>/);
        if (!value || value.length === 0) {
            errorCallback('Received transaction with no value', 400, oref);
            return;
        }

        value = parseFloat(value[1]);

        currency = xml.match(/<udf3>(.+?)<\/udf3>/);
        if (!currency || currency.length === 0) {
            errorCallback('Received transaction with no currency', 400, oref);
            return;
        }

        currency = currency[1];
    }

    var transaction = {
        transactionId : oref,
        status : result,
        time : new Date(),
        pspID : pspId,
        amount : value,
        currency : currency,
        cardNumber : cardNum,
        cardExpiry : cardExpiry,
        cardType : cardType,
        username : username,
        paymentMethod : paymentMethod
    };

    // check that a transaction request with the same oref is present
    db.getTransactionRequest(oref, function (err, request) {
        if (err) {
            errorCallback(err, 501, oref);
            return;
        }

        if (!request) {
            errorCallback('Invalid response: no transaction request found with the given ORef', 400, oref);
            return;
        }

        var transaction = this;

        // check that the fields of the response match those of the request
        if (transaction.username.toLowerCase() !== request.username.toLowerCase() || transaction.amount != request.amount ||
                        transaction.currency != request.currency || transaction.paymentMethod.toLowerCase() != request.paymentMethod.toLowerCase()) {

            errorCallback('The fields of the transaction response do not match those of the request', 200, oref);
            return;
        }

        transaction.email = request.email;
        transaction.transactionType = request.transactionType;

        // handle "not ok" status
        if (result !== 'ok') {
            var email = xml.match(/<email>(.+?)<\/email>/);
            if (email && email.length !== 0) {
                transaction.email = email[1];
            }

            switch (result.toUpperCase()) {
                case PaymentStatus.NOTOK:
                    declinedCallback(transaction, PaymentStatus.NOTOK);
                    break;

                case PaymentStatus.DECLINED:
                    var errorMessage = xml.match(/<extendederr>(.+?)<\/extendederr>/);
                    if (errorMessage && errorMessage.length !== 0) {
                        transaction.errorMessage = errorMessage[1];
                    }

                    declinedCallback(transaction, PaymentStatus.DECLINED);

                    break;

                case PaymentStatus.PENDING:
                    pendingCallback(transaction);
                    break;

            }

            return;
        }

        // check that no other transactions with the same oref have already been completed
        db.getTransaction(oref, function (err, res) {

            var transaction = this;
            var isPending = res && res.status.toUpperCase() === PaymentStatus.PENDING;

            if (res && !isPending) {
                errorCallback('Duplicate transaction, possible FRAUD', 200, oref);
            }
            else if (err) {
                errorCallback(err, 501, oref);
            }
            else {
                okCallback(transaction, !isPending); // insert only if it wasnt pending
            }

            if (isPending) {
                db.updateTransactionStatus(res.transactionId, PaymentStatus.OK);
            }

        }.bind(transaction));

    }.bind(transaction));
}


function handleGetAvailablePaymentMethodsRequest (req, res) {
    if (!req.user) {
        res.status(401).send();
        return;
    }
    var transactionType = parseInt(req.query.transactionType);
    if (!transactionType) {
        res.status(400).send('Invalid request: invalid transaction type');
        return;
    }

    if (transactionType != TransactionType.DEPOSIT && transactionType != TransactionType.WITHDRAWAL) {
        res.status(400).send('Invalid request: transaction type not supported');
        return;
    }

    var validPayments = [];

    for (var i = 0; i < DETAILED_PAYMENT_METHODS.length; i++) {
        var payment = DETAILED_PAYMENT_METHODS[i];

        if (!isPaymentMethodValid(payment, req.user, transactionType)) {
            continue;
        }

        validPayments.push({ name : payment.name, code : payment.code });
    }

    var resObj = { paymentMethods : validPayments, transactionType : transactionType };
    if (transactionType === TransactionType.WITHDRAWAL) {
        resObj['bankCodes'] = SUPPORTED_BANKS_PURPLE_PAY_WITHDRAWALS;
    }

    res.status(200).send(resObj);
}


function isPaymentMethodValid (payment, user, transactionType) {
    return true;
}


function getPaymentMethod (code) {
    for (var i = 0; i < DETAILED_PAYMENT_METHODS.length; i++) {
        if (DETAILED_PAYMENT_METHODS[i].code === code) {
            return DETAILED_PAYMENT_METHODS[i];
        }
    }
}


function sendPaymentResultEmail (transaction, status) {
    if (status === PaymentStatus.ERROR) return;

    var isDeposit = transaction.transactionType === TransactionType.DEPOSIT;

    switch (status) {
        case PaymentStatus.OK:
            var subject = (isDeposit ? 'Deposit' : 'Withdrawal') + ' successful';
            var message = 'Hi ' + transaction.username + ',<br><br><br>Your ' + (isDeposit ? 'deposit' : 'withdrawal') +
                ' of <b>' + helper.formatNumber(transaction.amount) + ' ' + Currency.getCurrencyNameFromISO(transaction.currency).toUpperCase() + '</b> has been successful!' +
                '<br><br>The reference code for your transaction is <b>' + transaction.pspID + '</b>.' +
                '<br><br><br>Good luck!<br><br>The DailyChampion team';

            break;

        case PaymentStatus.NOTOK:
        case PaymentStatus.DECLINED:
            subject = (isDeposit ? 'Deposit' : 'Withdrawal') + ' declined';
            message = 'Hi ' + transaction.username + ',<br><br><br>Your ' + (isDeposit ? 'deposit' : 'withdrawal') +
                ' of <b>' + helper.formatNumber(transaction.amount) + ' ' + Currency.getCurrencyNameFromISO(transaction.currency).toUpperCase() + '</b> has been declined.' +
                '<br><br>The reference code for your transaction is <b>' + transaction.pspID + '</b>.';

            if (PaymentStatus.DECLINED) {
                message += '<br><br>The reason of the refusal is: <i>' + transaction.errorMessage + '</i>.';
            }

            message += '<br><br><br>Please dont\'t hesitate to contact the support sending an e-mail to ' + constants.NOREPLY_EMAIL + ' in case you need further assistance.' +
                '<br><br><br>Best regards<br><br>The DailyChampion team';

            break;

        case PaymentStatus.PENDING:
            subject = (isDeposit ? 'Deposit' : 'Withdrawal') + ' pending';
            var message = 'Hi ' + transaction.username + ',<br><br><br>Your ' + (isDeposit ? 'deposit' : 'withdrawal') +
                ' of <b>' + helper.formatNumber(transaction.amount) + ' ' + Currency.getCurrencyNameFromISO(transaction.currency).toUpperCase() +
                '</b> has been accepted and is pending for approval. You will be notified when the process has been completed.' +
                '<br><br>The reference code for your transaction is <b>' + transaction.pspID + '</b>.' +
                '<br><br><br>Good luck!<br><br>The DailyChampion team';

            break;
    }

    emailer.sendEmail(transaction.email, subject, message);
}


var DETAILED_PAYMENT_METHODS = [
    // Fast Pay
    { name : 'VISA', code : 'VISA' },

    { name : 'Bitcoin', code : 'BTC01', currenciesSupported : [ 'EUR' ], depositOnly : true },

    { name : 'Neteller', code : 'NT' },

    // Purple Pay
    { name : 'Bank Transfer', code : 'MBANKTRANSFER', countriesSupported : [ 'NOR', 'TUR' ], depositOnly : true },
    { name : 'Bank Transfer', code : 'BANKTRANSFER', countriesSupported : [ 'NOR', 'TUR' ], withdrawalOnly : true },

    // PPRO
    { name : 'Astropay Card', code : 'ASTROPAYCARD', currenciesSupported : [ 'USD' ], countriesSupported : [ 'ARG', 'BOL', 'BLM', 'CHL', 'COL', 'MEX', 'PER', 'URY', 'VEN' ]},
    { name : 'SOFORT', code : 'SOFORT', currenciesSupported : [ 'EUR' ], countriesSupported : [ 'AUS', 'BEL', 'FRA', 'DEU', 'NLD', 'GBR', 'ITA', 'POL', 'HUN', 'ESP', 'CHE' ] },
    { name : 'EPS', code : 'EPS', currenciesSupported : [ 'EUR' ], countriesSupported : [ 'AUT' ] },
    { name : 'Giropay', code : 'GIROPAY', currenciesSupported : [ 'EUR' ], countriesSupported : [ 'DEU' ] },
    { name : 'iDEAL', code : 'IDEAL', currenciesSupported : [ 'EUR' ], countriesSupported : [ 'NLD' ] },
    { name : 'Instant Transfer', code : 'IBANKTRANSFER', currenciesSupported : [ 'EUR' ], countriesSupported : [ 'DEU' ] },
    { name : 'Paysafe', code : 'PSC', currenciesSupported : [ 'AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'NOK', 'PLN', 'RON' ]},
    { name : 'POLi', code : 'POLI', currenciesSupported : [ 'AUD', 'NZD' ], countriesSupported : [ 'AUS', 'NZL' ] },
    { name : 'Przelewy 24', code : 'PRZELEWY', currenciesSupported : [ 'EUR', 'PLN' ], countriesSupported : [ 'POL' ] },
    { name : 'SafetyPay', code : 'SAFETYPAY', currenciesSupported : [ 'EUR', 'USD' ], countriesSupported : [ 'DEU', 'AUT', 'BRA', 'COL', 'CRI', 'ESP', 'MEX', 'NIC', 'NLD', 'PAN', 'PER' ] },
    { name : 'Skrill', code : 'MBKR' },
    { name : 'TrustPay', code : 'TRUSTPAY', currenciesSupported : [ 'EUR', 'CZK', 'HUF' ], countriesSupported : [ 'CZE', 'EST', 'HUN', 'LTU', 'LVA', 'SVK', 'SVN' ] },
    { name : 'Qiwi', code : 'QIWI', currenciesSupported : [ 'EUR' ], countriesSupported : [ 'RUS', 'KAZ', 'UKR' ] },
];


var PAYMENT_METHODS_NAMES = [
    // Fast Pay
    { name : 'VISA', code : 'VISA' },

    { name : 'Bitcoin', code : 'BTC01' },

    { name : 'Neteller', code : 'NT' },

    // Purple Pay
    { name : 'Bank Transfer', code : 'MBANKTRANSFER' },
    { name : 'Bank Transfer', code : 'BANKTRANSFER' },

    // PPRO
    { name : 'Astropay Card', code : 'ASTROPAYCARD' },
    { name : 'SOFORT', code : 'SOFORT' },
    { name : 'EPS', code : 'EPS' },
    { name : 'Giropay', code : 'GIROPAY' },
    { name : 'iDEAL', code : 'IDEAL' },
    { name : 'Instant Transfer', code : 'IBANKTRANSFER' },
    { name : 'Paysafe', code : 'PSC' },
    { name : 'POLi', code : 'POLI' },
    { name : 'Przelewy 24', code : 'PRZELEWY' },
    { name : 'SafetyPay', code : 'SAFETYPAY' },
    { name : 'Skrill', code : 'MBKR' },
    { name : 'TrustPay', code : 'TRUSTPAY' },
    { name : 'Qiwi', code : 'QIWI' },
];


var SUPPORTED_BANKS_PURPLE_PAY_DEPOSITS = [
    { name : 'ING Bank', code : 'ING' },
    { name : 'Akbank', code : 'AK' },
    { name : 'Deniz Bank', code : 'DB' },
    { name : 'Finansbank', code : 'FB' },
    { name : 'Halk Bank', code : 'HB' },
    { name : 'IS Bankasi', code : 'IS' },
    { name : 'Garanti Bankası', code : 'GB' },
    { name : 'Vakıfbank', code : 'VB' },
    { name : 'Yapi Kredi Bankası', code : 'YKB' },
    { name : 'Türkiye Ekonomi Bankası', code : 'TEB' },
    { name : 'Ziraat Bankası', code : 'ZB' },
];


var SUPPORTED_BANKS_PURPLE_PAY_WITHDRAWALS = [
    { name : 'ING Bank', code : 'ING' },
    { name : 'Deniz Bank', code : 'DB' },
    { name : 'Finansbank', code : 'FB' },
    { name : 'Halk Bank', code : 'HB' },
    { name : 'Ziraat Bankası', code : 'ZB' },
    { name : 'IS Bankasi', code : 'IS' },
    { name : 'Garanti Bankası', code : 'GB' },
    { name : 'Vakıfbank', code : 'VB' },
    { name : 'Yapi Kredi Bankası', code : 'YKB' },
    { name : 'HSBC', code : 'HSBC' },
    { name : 'Kuveyt Turk', code : 'KT' },
    { name : 'En Para', code : 'EP' },
    { name : 'Türkiye Ekonomi Bankası', code : 'TEB' }
];


var PaymentStatus = {
    OK : 'OK',
    NOTOK : 'NOTOK',
    DECLINED : 'DECLINED',
    PENDING : 'PENDING',
    ERROR : 'ERROR'
};


exports.handleGetFastPayXMLRequest = handleGetFastPayXMLRequest;
exports.handleFastPayResponse = handleFastPayResponse;
exports.handleGetAvailablePaymentMethodsRequest = handleGetAvailablePaymentMethodsRequest;
exports.generateFastPayXML = generateFastPayXML;

exports.PAYMENT_METHODS_NAMES = PAYMENT_METHODS_NAMES;
exports.DETAILED_PAYMENT_METHODS = DETAILED_PAYMENT_METHODS;
exports.PaymentStatus = PaymentStatus;