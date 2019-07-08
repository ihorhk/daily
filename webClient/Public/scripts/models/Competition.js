const FLAG_FOR_COMPETITION = {
    9 : '/icongraphy/svg/flags/Netherlands.svg',
    18 : '/icongraphy/svg/flags/Netherlands.svg',
    38 : '/icongraphy/svg/flags/United-Kingdom.svg',
    541 : '/icongraphy/svg/flags/Germany.svg',
    168 : '/icongraphy/svg/flags/Spain.svg',
    361 : '/icongraphy/svg/flags/France.svg',
    24 : '/icongraphy/svg/flags/France.svg',
    259 : '/icongraphy/svg/flags/Italy.svg',
    21 : '/icongraphy/svg/flags/Italy.svg',
    23 : '/icongraphy/svg/flags/Spain.svg',
    231 : '/icongraphy/svg/flags/Germany.svg',
    1 : '/icongraphy/svg/flags/United-Kingdom.svg',
    395 : '/icongraphy/svg/flags/Netherlands.svg',
    22 : '/icongraphy/svg/flags/Germany.svg',
    2 : '/icongraphy/svg/flags/United-Kingdom.svg',
    5 : '/icongraphy/svg/flags/European-Union.svg',
    6 : '/icongraphy/svg/flags/European-Union.svg',
    8 : '/icongraphy/svg/flags/United-Kingdom.svg',
    352 : '/icongraphy/svg/flags/European-Union.svg',
    331 : '/icongraphy/svg/flags/Spain.svg',
    362 : '/icongraphy/svg/flags/France.svg'
};


const SMALL_LOGO = 'small';
const MEDIUM_LOGO = 'medium';
const MEDIUM_VERTICAL_LOGO = 'mediumVertical';
const BIG_HORIZONTAL_LOGO = 'bigHorizontal';
const BIG_VERTICAL_LOGO = 'bigVertical';


const LOGO_FOR_COMPETITION = {
    1 : {
        small : '/icongraphy/img/league-icons/English-FA-Cup_small-25px.png',
        medium : '/icongraphy/img/league-icons/English-FA-Cup_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/English-FA-Cup_medium-vertical.png',
        bigHorizontal : '/icongraphy/img/league-icons/English-FA-Cup_big-200px.png',
        bigVertical : '/icongraphy/img/league-icons/English-FA-Cup_big-200px-vertical.png'
    },
    2 : {
        small : '/icongraphy/img/league-icons/English-League-Cup_small-25px.png',
        medium : '/icongraphy/img/league-icons/English-League-Cup_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/English-League-Cup_medium-vertical.png',
        bigVertical : '/icongraphy/img/league-icons/English-League-Cup_big-200px-vertical.png'
    },
    5 : {
        small : '/icongraphy/img/league-icons/Champions-League_small-25px.png',
        medium : '/icongraphy/img/league-icons/Champions-League_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/Champions-League_medium-vertical.png',
        bigHorizontal : '/icongraphy/img/league-icons/Champions-League_big-200px.png',
        bigVertical : '/icongraphy/img/league-icons/Champions-League_big-200px-vertical.png'
    },
    6 : {
        small : '/icongraphy/img/league-icons/UEFA_small-25px.png',
        medium : '/icongraphy/img/league-icons/UEFA_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/UEFA_medium-vertical.png',
        bigHorizontal : '/icongraphy/img/league-icons/UEFA_big-200px.png',
        bigVertical : '/icongraphy/img/league-icons/UEFA_big-200px-vertical.png'
    },
    8 : {
        small : '/icongraphy/img/league-icons/English-Premier-League_small-25px.png',
        medium : '/icongraphy/img/league-icons/English-Premier-League_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/English-Premier-League_medium-vertical.png',
        bigHorizontal : '/icongraphy/img/league-icons/English-Premier-League_big-200px.png',
        bigVertical : '/icongraphy/img/league-icons/English-Premier-League_big-200px-vertical.png'
    },
    9 : {
        small : '/icongraphy/img/league-icons/Dutch-Eredivisie_small-25px.png',
        medium : '/icongraphy/img/league-icons/Dutch-Eredivisie_medium-75px.png',
        bigHorizontal : '/icongraphy/img/league-icons/Dutch-Eredivisie_big-200px.png'
    },
    18 : {
        small : '/icongraphy/img/league-icons/Dutch-Johan-Cruyff-Shield_small-25px.png',
        medium : '/icongraphy/img/league-icons/Dutch-Johan-Cruyff-Shield_medium-75px.png',
        bigVertical : 'Dutch-Johan-Cruyff-shield_big-200px-vertical.png'
    },
    21 : {
        small : '/icongraphy/img/league-icons/Italian-Serie-A_small-25px.png',
        medium : '/icongraphy/img/league-icons/Italian-Serie-A_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/Italian-Serie-A_medium-vertical.png',
        bigHorizontal : '/icongraphy/img/league-icons/Italian-Serie-A_big-200px.png',
        bigVertical : '/icongraphy/img/league-icons/Italian-Serie-A_big-200px-vertical.png'
    },
    22 : {
        small : '/icongraphy/img/league-icons/German-Bundesliga_small-25px.png',
        medium : '/icongraphy/img/league-icons/German-Bundesliga_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/German-Bundesliga_medium-vertical.png',
        bigHorizontal : '/icongraphy/img/league-icons/German-Bundesliga_big-200px.png',
        bigVertical : '/icongraphy/img/league-icons/German-Bundesliga_big-200px-vertical.png'
    },
    23 : {
        small : '/icongraphy/img/league-icons/Spanish-La-Liga_small-25px.png',
        medium : '/icongraphy/img/league-icons/Spanish-La-Liga_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/Spanish-La-Liga_medium-75px.png',
        bigHorizontal : '/icongraphy/img/league-icons/Spanish-La-Liga_big-200px.png',
        bigVertical : '/icongraphy/img/league-icons/Spanish-La-Liga_big-200px-vertical.png'
    },
    24 : {
        small : '/icongraphy/img/league-icons/French-Ligue-1_small-25px.png',
        medium : '/icongraphy/img/league-icons/French-Ligue-1_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/French-Ligue-1_medium-vertical.png',
        bigHorizontal : '/icongraphy/img/league-icons/French-Ligue-1_big-200px.png',
        bigVertical : '/icongraphy/img/league-icons/French-Ligue-1_big-200px-vertical.png'
    },
    38 : {
        small : '/icongraphy/img/league-icons/English-Community-Shield_small-25px.png',
        medium : '/icongraphy/img/league-icons/English-Community-Shield_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/English-Community-Shield_medium-vertical.png',
        bigVertical : '/icongraphy/img/league-icons/English-Community-Shield_big-200px-vertical.png'
    },
    168 : {
        small : '/icongraphy/img/league-icons/Spanish-Supercopa_small-25px.png',
        medium : '/icongraphy/img/league-icons/Spanish-Supercopa_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/Spanish-Supercopa_medium-vertical.png',
        bigHorizontal : '/icongraphy/img/league-icons/Spanish-Supercopa_big-200px.png',
        bigVertical : '/icongraphy/img/league-icons/Spanish-Supercopa_big-200px-vertical.png'
    },
    231 : {
        small : '/icongraphy/img/league-icons/German-DFB-Pokal_small-25px.png',
        medium : '/icongraphy/img/league-icons/German-DFB-Pokal_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/German-DFB-Pokal_medium-vertical.png',
        bigHorizontal : '/icongraphy/img/league-icons/German-DFB-Pokal_big-200px.png',
        bigVertical : '/icongraphy/img/league-icons/German-DFB-Pokal_big-200-px-vertical.png',
    },
    259 : {
        small : '/icongraphy/img/league-icons/Coppa-Italia_small-25px.png',
        medium : '/icongraphy/img/league-icons/Coppa-Italia_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/Coppa-Italia_medium-vertical.png'
    },
    331 : {
        small : '/icongraphy/img/league-icons/Spanish-Copa-del-Rey_small-25px.png',
        medium : '/icongraphy/img/league-icons/Spanish-Copa-del-Rey_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/Spanish-Copa-del-Rey_medium-vertical.png',
        bigHorizontal : '/icongraphy/img/league-icons/Spanish-Copa-del-Rey_big-200px.png',
        bigVertical : '/icongraphy/img/league-icons/Spanish-Copa-del-Rey_big-200px-vertical.png',
    },
    352 : {
        small : '/icongraphy/img/league-icons/UEFA-under-21_small-25px.png',
        medium : '/icongraphy/img/league-icons/UEFA-under-21_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/UEFA-under-21_medium-vertical.png',
        bigHorizontal : '/icongraphy/img/league-icons/UEFA-under-21_big-200px.png',
        bigVertical : '/icongraphy/img/league-icons/UEFA-under-21_big-200px-vertical.png'
    },
    354 : {
        small : '/icongraphy/img/league-icons/French-Champions-Trophy_small-25px.png',
        medium : '/icongraphy/img/league-icons/French-Champions-Trophy_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/French-Champions-Trophy_medium-vertical.png',
        bigVertical : 'French-Champions-Trophy_big-200px-vertical.png'
    },
    361 : {
        small : '/icongraphy/img/league-icons/Coupe-De-France_small-25px.png',
        medium : '/icongraphy/img/league-icons/Coupe-De-France_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/Coupe-De-France_medium-vertical.png',
        bigHorizontal : '/icongraphy/img/league-icons/Coupe-De-France_big-200px.png',
        bigVertical : '/icongraphy/img/league-icons/Coupe-De-France_big-200px-vertical.png'
    },
    362 : {
        small : '/icongraphy/img/league-icons/French-Coupe-de-la-Ligue_small-25px.png',
        medium : '/icongraphy/img/league-icons/French-Coupe-de-la-Ligue_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/French-Coupe-de-la-Ligue_medium-vertical.png',
        bigHorizontal : '/icongraphy/img/league-icons/French-Coupe-de-la-Ligue_big-200px.png',
        bigVertical : '/icongraphy/img/league-icons/French-Coupe-de-la-Ligue_big-200px-vertical.png'
    },
    395 : {
        small : '/icongraphy/img/league-icons/Dutch-KNVB-cup_small-25px.png',
        mediumVertical : '/icongraphy/img/league-icons/Dutch-KNVB-cup_medium-vertical.png',
        bigHorizontal : '/icongraphy/img/league-icons/Dutch-KNVB-cup_big-200px.png',
        bigVertical : '/icongraphy/img/league-icons/Dutch-KNVB-cup_big-200px-vertical.png'
    },
    541 : {
        small : '/icongraphy/img/league-icons/German-Super-Cup_small-25px.png',
        medium : '/icongraphy/img/league-icons/German-Super-Cup_medium-75px.png',
        mediumVertical : '/icongraphy/img/league-icons/German-Super-Cup_medium-vertical.png',
        bigVertical : '/icongraphy/img/league-icons/German-Super-Cup_big-200px-vertical.png'
    }
};


function logoForCompetition (competitionId, size) {
    var icons = LOGO_FOR_COMPETITION[competitionId];
    var res = icons[size];

    if (res) {
        return res;
    }

    if (size === MEDIUM_LOGO) {
        res = icons[BIG_VERTICAL_LOGO];

        return res || icons[BIG_HORIZONTAL_LOGO]
    }

    if (size === MEDIUM_VERTICAL_LOGO) {
        return icons[MEDIUM_LOGO]
    }

    if (size === BIG_HORIZONTAL_LOGO) {
        res = icons[BIG_VERTICAL_LOGO];

        return res || icons[MEDIUM_LOGO];
    }

    if (size === BIG_VERTICAL_LOGO) {
        res = icons[MEDIUM_VERTICAL_LOGO];

        return res || icons[MEDIUM_LOGO];
    }
}