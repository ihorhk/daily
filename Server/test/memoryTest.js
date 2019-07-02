var exec = require('child_process').exec;
var fs = require('fs');

function printMemoryUsage () {
    exec("free -m -t", function (err, stdout, stderr) {
        fs.appendFile('memoryTest.txt', '_____________________________________\n' +new Date() + '\n' + stdout +'\n', function (err) {

        });
    });

    exec("ps aux | grep 'node'", function (err, stdout, stderr) {
        fs.appendFile('memoryTest.txt', stdout +'\n', function (err) {

        });
    });
}

setInterval(printMemoryUsage, 1800000);