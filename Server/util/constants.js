module.exports = {
    GLOBAL_DEBUG : true,
    TEST_VERSION : true,
    IS_CONTESTS_REGISTRATION_BOT_ENABLED : true,

    // values set during server init
    IS_RUNNING_LOCAL : undefined,
    CWD : undefined,
    SERVER_IP : undefined,
    SERVER_PORT: undefined,
    CERTIFICATE: undefined,
    PRIVATE_KEY: undefined,

    PRODUCTION_SERVER_IP: '',
    STAGING_SERVER_IP: '',
    DEVELOPMENT_SERVER_IP: '',
    API_SERVER_PORT: 9030,
    WEBSITE_URL : '',

    ERROR_NOTIFICATION_EMAIL : '',
    FRAUD_NOTIFICATION_EMAIL : '',
    NOREPLY_EMAIL : '',

    DB_PORT : 27017,
    DB_HOST : 'localhost',
    DB_NAME : 'daily_champion',
    DB_USER : 'root',
    DB_PWD : '',

    LOG_FILENAME: "debug.log",
    ERROR_LOG_FILENAME: "errors.log",
    EMERG_LOG_FILENAME: "emerg.log",

    PROGRAMMED_TOURNAMENTS_FILE : 'programmed_tournaments.json',
    MOCK_MATCHES_DIR : 'mock_matches',

    FEED_FORMAT_F1: 'F1',
    FEED_FORMAT_F9: 'F9',
    FEED_FORMAT_F40: 'F40',

    FTP_PORT: 7001,
    FTP_FEED_BASE_PATH: '/football_data/',
    FTP_USER_BASE_PATH: '/user/',

    REGISTRATION_TOKEN_EXPIRATION_DAYS: 7,

    API_MASTER_KEY: 'test', // set from secretConstants at runtime
};
