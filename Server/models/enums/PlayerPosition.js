var PlayerPosition = {
    GOALKEEPER : 'Goalkeeper',
    DEFENDER : 'Defender',
    MIDFIELDER : 'Midfielder',
    STRIKER : 'Striker',
    SUBSTITUTE : 'Substitute'
};


function getShortPosition (position) {
    switch (position) {
        case PlayerPosition.GOALKEEPER:
            return 'GK';

        case PlayerPosition.DEFENDER:
            return 'DEF';

        case PlayerPosition.MIDFIELDER:
            return 'MID';

        case PlayerPosition.STRIKER:
        case 'Forward':
            return 'ATT';

        case PlayerPosition.SUBSTITUTE:
            return 'SUB';
    }
}


exports.PlayerPosition = PlayerPosition;
exports.getShortPosition = getShortPosition;