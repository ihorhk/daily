var Timer = function (element, endTime, highlightTime, endTimeCallback) {
    this.element = element;
    this.endTime = endTime;
    this.highlightTime = highlightTime * 1000;
    this.isEndTime = false;
    if (endTimeCallback) {
        this.endTimeCallback = endTimeCallback;
    }
};

Timer.prototype.update = function () {
    var duration = moment.duration(moment(this.endTime).diff(moment()));

    var weeks = 0;
    var days = 0;
    var hours = 0;
    var minutes = 0;
    var seconds = 0;

    var milliseconds = duration.asMilliseconds();

    if (milliseconds > 0 || $(this.element).hasClass('past')) {
        weeks = Math.abs(duration.weeks());
        days = Math.abs(duration.days());
        hours = Math.abs(duration.hours());
        minutes = Math.abs(duration.minutes());
        seconds = Math.abs(duration.seconds());
    }

    if (this.isEndTime === false && milliseconds <= 0) {
        this.isEndTime = true;
        if (this.hasOwnProperty('endTimeCallback')) {
            this.endTimeCallback(this);
        }
    }

    if (milliseconds < this.highlightTime && milliseconds > 0) {
        $(this.element).addClass('highlighted');
    }

    if ($(this.element).hasClass('highlighted')) {
        this.element.html('STARTS IN<br><span>' + minutes + ':' + this.formatDigits(seconds) + '</span>');
    }
    else if ($(this.element).hasClass('past')) {
        var html = '';

        if (weeks === 1) {
            html = weeks + ' week ago';
        }
        else if (weeks > 1) {
            html = weeks + ' weeks ago';
        }
        else if (days > 1) {
            html = days + ' days ago';
        }
        else if (days === 1) {
            html = days + ' day ago';
        }
        else if (hours > 1) {
            html = hours + ' hrs ago';
        }
        else if (hours === 1) {
            html = hours + ' hr ago';
        }
        else if (minutes > 1) {
            html = minutes + ' mins ago';
        }
        else {
            html = minutes + ' min ago';
        }

        this.element.html(html);
    }
    else {
        this.element.html(hours + ':' + this.formatDigits(minutes) + ':' + this.formatDigits(seconds));
    }
};

Timer.prototype.formatDigits = function (number) {
    return ('0' + number).slice(-2);
};