var TRANSACTION_TYPES = {
    DEPOSIT : 1,
    WITHDRAWAL : 13
};


const LOGO_FOR_PAYMENT = {
    //TODO the payment methods marked with *** need to be checked when they get activated from apcopay: maybe the code is different
    ASTROPAYCARD : '/icongraphy/svg/payment/color/astropay_card.svg',
    BANKTRANSFER : '/icongraphy/svg/payment/color/bank_transfer.svg',
    BTC01 : '/icongraphy/svg/payment/color/bitcoin.svg',
    DISCOVER : '/icongraphy/svg/payment/color/discover.svg', //***
    ELV : '/icongraphy/svg/payment/color/elv.svg', //***
    EPS : '/icongraphy/svg/payment/color/eps.svg',
    GIROPAY : '/icongraphy/svg/payment/color/giropay.svg',
    IDEAL : '/icongraphy/svg/payment/color/ideal.svg',
    IBANKTRANSFER : '/icongraphy/svg/payment/color/instant_transfer.svg',
    MAESTRO : '/icongraphy/svg/payment/color/maestro.svg', //***
    MASTERCARD : '/icongraphy/svg/payment/color/mastercard.svg', //***
    NT : '/icongraphy/svg/payment/color/neteller.svg',
    PAYPAL : '/icongraphy/svg/payment/color/paypal.svg', //***
    PSC : '/icongraphy/svg/payment/color/paysafe_card.svg',
    POLI : '/icongraphy/svg/payment/color/poli.svg',
    PRZELEWY : '/icongraphy/svg/payment/color/przelewy24.svg',
    QIWI : '/icongraphy/svg/payment/color/qiwi.svg',
    SAFETYPAY : '/icongraphy/svg/payment/color/safety_pay.svg',
    MBANKTRANSFER : '/icongraphy/svg/payment/color/bank_transfer.svg',
    MBKR : '/icongraphy/svg/payment/color/skrill.svg',
    SOFORT : '/icongraphy/svg/payment/color/sofort.svg',
    TRUSTPAY : '/icongraphy/svg/payment/color/trustpay.svg',
    VISA : '/icongraphy/svg/payment/color/visa.svg',
    WEBMONEY : '/icongraphy/svg/payment/color/web_money.svg', //***
    YANDEX : '/icongraphy/svg/payment/color/yandex.svg', //***
};


function transactionStatusIcon (status) {
    switch (status) {
        case 'OK':
            return 'icon-transaction-success.svg';
            break;
        case 'PENDING':
            return 'icon-transaction-pending.svg';
            break;
        default:
            return 'icon-transaction-failure.svg';
    }
}


function transactionStatusText (status) {
    switch (status) {
        case 'OK':
            return 'Success';
            break;
        case 'PENDING':
            return 'Pending';
            break;
        case 'NOTOK':
            return 'Failure';
            break;
        case 'ERROR':
            return 'Error';
            break;
        case 'DECLINED':
            return 'Declined';
            break;
        default:
            return '';
    }
}