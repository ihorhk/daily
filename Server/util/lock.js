/*
 * Simple implementation of semaphore, useful to make sure that a function is executed only once at a time.
 * Use acquire to get access to a function, and call release when the function can be freed.
 *
 * IMPORTANT: callbacks inside semaphore functions need to be executed using run(key, fn), to make sure that
 * exceptions are handled properly..
 */

var locks = [];
var logger = require('./logger');


function acquireLock (key, fn) {
    var lock = locks[key];

    if (!lock || lock.length === 0) {
        locks[key] = [ fn ];
        run(key, fn);
        return;
    }

    locks[key].push(fn);
}


function releaseLock (key) {
    var lock = locks[key];

    if (!lock || lock.length === 0) return;

    lock.splice(0, 1);

    if (lock.length > 0) {
        run(key, lock[0]);
    }
}


function run (key, fn, ...args) {
    try {

        fn(...args);

    } catch (e) {
        logger.error('Error found in lock {' + key + '} - ' + e.stack);
        releaseLock(key);
    }
}


exports.acquire = acquireLock;
exports.release = releaseLock;
exports.run = run;