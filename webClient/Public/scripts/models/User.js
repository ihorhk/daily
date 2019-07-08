function getBalanceForCurrentPlayMode (user) {
    if (isUserInFreePlayMode(user)) {
        return user.freeMoneyBalance;
    }

    return user.balance;
}


function isUserInFreePlayMode (user) {
    return user.playMode === PLAY_MODE.FREE;
}


function balanceUpdateToString (balanceUpdate) {
    switch (balanceUpdate) {
        case 'TOURNAMENT_REGISTRATION':
            return 'Tournament Registration';
        case 'TOURNAMENT_REGISTRATION_CANCELLED':
            return 'Tournament Registration Cancelled';
        case 'TOURNAMENT_CANCELLED':
            return 'Tournament Cancelled';
        case 'TOURNAMENT_WINNING':
            return 'Tournament Winning';
        case 'DEPOSIT':
            return 'Deposit';
        case 'WITHDRAWAL':
            return 'Withdrawal';
        case 'REFUND':
            return 'Refund';
        default:
            return '';
    }
}


function balanceUpdateToIcon (balanceUpdate) {
    switch (balanceUpdate) {
        case 'TOURNAMENT_REGISTRATION':
            return 'icon-balance-reg.svg';
        case 'TOURNAMENT_REGISTRATION_CANCELLED':
            return 'icon-balance-reg-cancelled.svg';
        case 'TOURNAMENT_CANCELLED':
            return 'icon-balance-tour-cancelled.svg';
        case 'TOURNAMENT_WINNING':
            return 'icon-balance-winning.svg';
        case 'DEPOSIT':
            return 'icon-balance-deposit.svg';
        case 'WITHDRAWAL':
            return 'icon-balance-withdraw.svg';
        case 'REFUND':
            return 'icon-balance-refund.svg';
        default:
            return '';
    }
}


var PLAY_MODE = {
    REAL : 'real',
    FREE : 'free'
};