$ (function () {

    $.timer = function (time, endEvent, parentView) {

        var config = {
            endDate: time,
            timeZone: 'Europe/Dublin',
            time: parentView ? parentView.find('.time') : $('.time'),
            hours: parentView ? parentView.find('.hours') : $('.hours'),
            minutes: parentView ? parentView.find('.minutes') : $('.minutes'),
            seconds: parentView ? parentView.find('.seconds') : $('.seconds')
        };

        function prependZero(number){
            return number < 10 ? '0' + number : number;
        }

        var interval = 1000;
        var intervalID = setInterval(function(){
            var currentTime = moment();
            var endDate = moment.tz(config.endDate, config.timeZone);
            var diffTime = endDate.valueOf() - currentTime.valueOf();
            var duration = moment.duration(moment.duration(diffTime, 'milliseconds') - interval, 'milliseconds');
            var hours = duration.hours() + (duration.days() * 24),
                minutes = duration.minutes(),
                seconds = duration.seconds();
            if(hours  <= 0 && minutes <= 0 && seconds  <= 0){
                clearInterval(intervalID);
                endEvent();
                return;
            }
            if (config.time.length !== 0) {
                config.time.text(hours + ':' + minutes + ':' + seconds);
            }
            else {
                config.hours.text(prependZero(hours));
                config.minutes.text(prependZero(minutes));
                config.seconds.text(prependZero(seconds));
            }

        }, interval);
    }
});