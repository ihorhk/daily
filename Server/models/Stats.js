var Stats = function () {
    this.stats = [];
};


Stats.prototype.get = function (name) {
    return this.stats[name];
};


Stats.prototype.set = function (name, value) {
    this.stats[name] = value;
};


Stats.prototype.toString = function () {
    var s = '';

    for (var stat in this.stats) {
        s += stat + '=' + this.stats[stat] + ',';
    }

    return s;
};


function parseStats (string) {
    //TODO
    throw new Error('parseStats function is not implemented yet');
}


exports.Stats = Stats;
exports.parseStats = parseStats;