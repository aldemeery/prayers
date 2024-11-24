const Prayers = (function () {
    function Prayers (adhan, city, country, adjustments = {fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0}) {
        if (Notification.permission === "default") {
            Notification.requestPermission();
        }

        registerServiceWorker(this);

        this.started = false;
        this.events = {};
        this.wakeLock = null;
        this.nextPrayer = null;
        this.adhan = adhan;
        this.city = city;
        this.country = country;
        this.adjustments = adjustments;
    }

    Prayers.prototype.requestWakeLock = function () {
        if (this.wakeLock === null) {
            navigator.wakeLock.request('screen').then(wakeLock => {
                this.wakeLock = wakeLock;
            });
        }
    };

    Prayers.prototype.releaseWakeLock = function () {
        if (this.wakeLock !== null) {
            this.wakeLock.release();
            this.wakeLock = null;
        }
    };

    Prayers.prototype.playAdhan = function () {
        this.adhan.play();
    };

    Prayers.prototype.stopAdhan = function () {
        this.adhan.pause();
        this.adhan.load();
    };

    Prayers.prototype.showNotification = function (title, options = {}) {
        this.serviceWorkerRegistration.showNotification(title, {
            ...options,
            actions: [{ action: 'close', title: 'Close' }],
        });
    };

    Prayers.prototype.start = function () {
        if (this.started) {
            return;
        }

        this.started = true;
        this.requestWakeLock();

        return fetchNextPrayer(this.city, this.country, this.adjustments)
            .then(nextPrayer => {
                this.nextPrayer = nextPrayer;
                this.tick();
                this.dispatch('start', {nextPrayer, remainingTime: this.getRemainingTime()});
            });
    };

    Prayers.prototype.tick = function () {
        const interval = setInterval(() => {
            const remainingTime = this.getRemainingTime();
            const nextPrayer = this.getNextPrayer();

            this.dispatch('tick', {nextPrayer, remainingTime});

            if (nextPrayer.adjustment > 0 && remainingTime.hours === 0 && (remainingTime.minutes - nextPrayer.adjustment) === 0 && remainingTime.seconds === 0) {
                this.playAdhan();
                this.showNotification('Prayers', {body: nextPrayer.name});
            } else if (remainingTime.hours === 0 && remainingTime.minutes === 0 && remainingTime.seconds === 0) {
                this.playAdhan();
                this.showNotification('Prayers', {body: nextPrayer.name});

                clearInterval(interval);

                setTimeout(() => {
                    fetchNextPrayer(this.city, this.country, this.adjustments).then(nextPrayer => {
                        this.nextPrayer = nextPrayer;
                        this.tick();
                    });
                }, 2000);
            }
        }, 1000);
    };

    Prayers.prototype.dispatch = function (event, data = {}) {
        this.events[event] && this.events[event](data);
    };

    Prayers.prototype.on = function (event, callback) {
        this.events[event] = callback;
    };

    Prayers.prototype.getNextPrayer = function () {
        return this.nextPrayer;
    };

    Prayers.prototype.getRemainingTime = function () {
        const now = new Date();
        const nextPrayerTime = this.getNextPrayer().time;

        return {
            hours: Math.floor((nextPrayerTime - now) / 1000 / 60 / 60),
            minutes: Math.floor((nextPrayerTime - now) / 1000 / 60) % 60,
            seconds: Math.floor((nextPrayerTime - now) / 1000) % 60
        };
    };

    const fetchNextPrayer = function (city, country, adjustments) {
        const today = new Date()
        const todayDate = today.toLocaleDateString('en-GB').split('/').join('-');

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDate = tomorrow.toLocaleDateString('en-GB').split('/').join('-');

        return Promise.all([
            fetch(`https://api.aladhan.com/v1/timingsByCity/${todayDate}?city=${city}&country=${country}`).then(r => r.json()),
            fetch(`https://api.aladhan.com/v1/timingsByCity/${tomorrowDate}?city=${city}&country=${country}`).then(r => r.json()),
        ])
            .then(([d1, d2]) => [d1.data.timings, d2.data.timings])
            .then(([t1, t2]) => [
                {name: 'صلاة الفجر', time: new Date(`${today.toDateString()} ${t1.Fajr}`), adjustment: adjustments.fajr},
                {name: 'صلاة الظهر', time: new Date(`${today.toDateString()} ${t1.Dhuhr}`), adjustment: adjustments.dhuhr},
                {name: 'صلاة العصر', time: new Date(`${today.toDateString()} ${t1.Asr}`), adjustment: adjustments.asr},
                {name: 'صلاة المغرب', time: new Date(`${today.toDateString()} ${t1.Maghrib}`), adjustment: adjustments.maghrib},
                {name: 'صلاة العشاء', time: new Date(`${today.toDateString()} ${t1.Isha}`), adjustment: adjustments.isha},
                {name: 'صلاة الفجر', time: new Date(`${tomorrow.toDateString()} ${t2.Fajr}`), adjustment: adjustments.fajr},
                {name: 'صلاة الظهر', time: new Date(`${tomorrow.toDateString()} ${t2.Dhuhr}`), adjustment: adjustments.dhuhr},
                {name: 'صلاة العصر', time: new Date(`${tomorrow.toDateString()} ${t2.Asr}`), adjustment: adjustments.asr},
                {name: 'صلاة المغرب', time: new Date(`${tomorrow.toDateString()} ${t2.Maghrib}`), adjustment: adjustments.maghrib},
                {name: 'صلاة العشاء', time: new Date(`${tomorrow.toDateString()} ${t2.Isha}`), adjustment: adjustments.isha},
            ])
            .then(config => {
                for (const prayer of config) {
                    let now = new Date();
                    now.setMilliseconds(0);

                    if (prayer.time > now) {
                        return prayer;
                    }
                }
            });
    };

    const registerServiceWorker = function (prayers) {
        navigator.serviceWorker.register('./js/service-worker.js').then((registration) => {
            prayers.serviceWorkerRegistration = registration;
        });

        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data.type === 'STOP_ADHAN') {
                prayers.stopAdhan();
            }
        });
    };

    return Prayers;
})();
