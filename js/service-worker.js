self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

const stopAdhanInAllClients = async () => {
    const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
    });

    for (const client of allClients) {
        client.postMessage({ type: 'STOP_ADHAN' });
    }

    return allClients;
};

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil((async () => {
        const allClients = await stopAdhanInAllClients();

        // If the action was explicitly "close", we're done.
        if (event.action === 'close') {
            return;
        }

        // Otherwise (body click), focus an existing tab or open a new one.
        const focusable = allClients.find(c => 'focus' in c);

        if (focusable) {
            await focusable.focus();
        } else if (self.clients.openWindow) {
            await self.clients.openWindow('./');
        }
    })());
});

self.addEventListener('notificationclose', (event) => {
    // Dismiss-by-swipe also stops the adhan, otherwise it'd keep playing
    // with no notification on screen to silence it.
    event.waitUntil(stopAdhanInAllClients());
});
