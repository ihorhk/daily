var JSFtp = require('jsftp');

var ftp = new JSFtp({
    host: 'localhost',
    port: 7001,
    user: 'grass_project',
    pass: 'gr4sspr0j3ct',
    debugMode: true
});

ftp.on('data', function(data) {
    console.log(data.text);
});

ftp.raw.mkd('new_dir', function(err) {
    if (err) return console.error(err);
});