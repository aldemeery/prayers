const updateRemainingTime = (time) => {
    const digits = `${time.hours}`.padStart(2, '0') + `${time.minutes}`.padStart(2, '0') + `${time.seconds}`.padStart(2, '0');
    document.querySelectorAll('#countdown .rolling').forEach((el, i) => {
        if (el.textContent !== digits[i]) {
            const fresh = el.cloneNode(false);
            fresh.textContent = digits[i];
            el.replaceWith(fresh);
        }
    });
};
const formatPrayerName = (prayer) => prayer.name;
const formatPrayerTime = (prayer) => `${prayer.time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).replace(/ AM| PM/, '')}`;

const prayers = new Prayers(new Audio('./assets/adhan_01.mp3'), 'Cairo', 'Egypt', { fajr: 15, dhuhr: 15, asr: 15, maghrib: 15, isha: 15 });

prayers.on('start', (data) => {
    document.getElementById('countdown').style.display = 'block';
    document.getElementById('prayer').style.display = 'block';
    document.getElementById('time').style.display = 'block';
    document.getElementById('start').remove();

    updateRemainingTime(data.remainingTime);
    document.getElementById('prayer').innerText = formatPrayerName(data.nextPrayer);
    document.getElementById('time').innerText = formatPrayerTime(data.nextPrayer);
});

prayers.on('tick', (data) => {
    updateRemainingTime(data.remainingTime);
    document.getElementById('prayer').innerText = formatPrayerName(data.nextPrayer);
    document.getElementById('time').innerText = formatPrayerTime(data.nextPrayer);
});

const start = () => prayers.start();

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        prayers.requestWakeLock();
    }
});
