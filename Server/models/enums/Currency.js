var Currency = {
    EURO : 'eur',
    AMERICAN_DOLLAR : 'usd',
    BRITISH_POUND : 'gbp'
};

var CurrencyISO = {
    EURO : '978',
    AMERICAN_DOLLAR : '840',
    BRITISH_POUND : '826'
};

function getCurrencyISO (currency) {
    var iso;
    var myCurrency = currency.toLowerCase();

    Object.keys(Currency).forEach(function (key) {
        if (Currency[key] === myCurrency) {
            iso = CurrencyISO[key];
        }
    });

    return iso;
}


function getCurrencyNameFromISO (iso) {
    var name;

    Object.keys(CurrencyISO).forEach(function (key) {
        if (CurrencyISO[key] === iso) {
            name = Currency[key];
        }
    });

    return name;
}


exports.Currency = Currency;
exports.getCurrencyISO = getCurrencyISO;
exports.getCurrencyNameFromISO = getCurrencyNameFromISO;