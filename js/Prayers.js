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

        this._uiInterval = null;
        this._earlyTimeout = null;
        this._mainTimeout = null;
    }

    Prayers.prototype.requestWakeLock = function () {
        if (this.wakeLock !== null || document.visibilityState !== 'visible') {
            return;
        }

        navigator.wakeLock.request('screen').then(wakeLock => {
            this.wakeLock = wakeLock;
            wakeLock.addEventListener('release', () => {
                this.wakeLock = null;
            });
        }).catch(() => {
            // Wake lock can reject if doc not visible/focused — safe to ignore.
        });
    };

    Prayers.prototype.releaseWakeLock = function () {
        if (this.wakeLock !== null) {
            this.wakeLock.release();
            this.wakeLock = null;
        }
    };

    Prayers.prototype.playAdhan = function () {
        this.adhan.play().catch(() => {
            // Autoplay can be blocked; the start-button gesture should prevent this,
            // but swallow rejections so they don't surface as unhandled errors.
        });
    };

    Prayers.prototype.stopAdhan = function () {
        this.adhan.pause();
        this.adhan.load();
    };

    Prayers.prototype.showNotification = function (title, options = {}) {
        if (!this.serviceWorkerRegistration) {
            return;
        }

        this.serviceWorkerRegistration.showNotification(title, {
            ...options,
            requireInteraction: true,
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
                this.scheduleAdhan();
                this.startUiUpdates();
                this.dispatch('start', { nextPrayer, remainingTime: this.getRemainingTime() });
            });
    };

    Prayers.prototype.scheduleAdhan = function () {
        if (this._earlyTimeout) clearTimeout(this._earlyTimeout);
        if (this._mainTimeout)  clearTimeout(this._mainTimeout);

        const now      = Date.now();
        const prayer   = this.getNextPrayer();
        const prayerMs = prayer.time.getTime();
        const earlyMs  = prayerMs - prayer.adjustment * 60 * 1000;

        // Early adhan (only if adjustment > 0 AND the early moment is still in the future).
        if (prayer.adjustment > 0 && earlyMs > now) {
            this._earlyTimeout = setTimeout(() => {
                this.playAdhan();
                this.showNotification('Prayers', { body: prayer.name });
            }, earlyMs - now);
        }

        // Main adhan at the actual prayer time, then refetch + reschedule.
        this._mainTimeout = setTimeout(() => {
            this.playAdhan();
            this.showNotification('Prayers', { body: prayer.name });

            setTimeout(() => {
                fetchNextPrayer(this.city, this.country, this.adjustments).then(p => {
                    if (!p) return;
                    this.nextPrayer = p;
                    this.scheduleAdhan();
                });
            }, 2000);
        }, Math.max(0, prayerMs - now));
    };

    Prayers.prototype.startUiUpdates = function () {
        if (this._uiInterval) clearInterval(this._uiInterval);

        this._uiInterval = setInterval(() => {
            this.dispatch('tick', {
                nextPrayer: this.getNextPrayer(),
                remainingTime: this.getRemainingTime(),
            });
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
        const diff = Math.max(0, this.getNextPrayer().time - new Date());
        return {
            hours:   Math.floor(diff / 3600000),
            minutes: Math.floor(diff /   60000) % 60,
            seconds: Math.floor(diff /    1000) % 60,
        };
    };

    const fetchNextPrayer = function (city, country, adjustments) {
        const today = new Date();
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
                {name: 'صلاة الفجر',   time: new Date(`${today.toDateString()} ${t1.Fajr}`),    adjustment: adjustments.fajr},
                {name: 'صلاة الظهر',   time: new Date(`${today.toDateString()} ${t1.Dhuhr}`),   adjustment: adjustments.dhuhr},
                {name: 'صلاة العصر',   time: new Date(`${today.toDateString()} ${t1.Asr}`),     adjustment: adjustments.asr},
                {name: 'صلاة المغرب',  time: new Date(`${today.toDateString()} ${t1.Maghrib}`), adjustment: adjustments.maghrib},
                {name: 'صلاة العشاء',  time: new Date(`${today.toDateString()} ${t1.Isha}`),    adjustment: adjustments.isha},
                {name: 'صلاة الفجر',   time: new Date(`${tomorrow.toDateString()} ${t2.Fajr}`),    adjustment: adjustments.fajr},
                {name: 'صلاة الظهر',   time: new Date(`${tomorrow.toDateString()} ${t2.Dhuhr}`),   adjustment: adjustments.dhuhr},
                {name: 'صلاة العصر',   time: new Date(`${tomorrow.toDateString()} ${t2.Asr}`),     adjustment: adjustments.asr},
                {name: 'صلاة المغرب',  time: new Date(`${tomorrow.toDateString()} ${t2.Maghrib}`), adjustment: adjustments.maghrib},
                {name: 'صلاة العشاء',  time: new Date(`${tomorrow.toDateString()} ${t2.Isha}`),    adjustment: adjustments.isha},
            ])
            .then(config => {
                const now = new Date();
                now.setMilliseconds(0);
                return config.find(prayer => prayer.time > now);
            });
    };

    const registerServiceWorker = function (prayers) {
        if (!('serviceWorker' in navigator)) {
            return;
        }

        navigator.serviceWorker.register('./js/service-worker.js')
            .then(registration => {
                prayers.serviceWorkerRegistration = registration;
            })
            .catch(err => {
                console.error('Service worker registration failed:', err);
            });

        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'STOP_ADHAN') {
                prayers.stopAdhan();
            }
        });
    };

    return Prayers;
})();
