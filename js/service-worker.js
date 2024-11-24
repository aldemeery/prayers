self.addEventListener('notificationclose', (event) => {
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            clientList.forEach((client) => {
                client.postMessage({ type: 'STOP_ADHAN' });
            });
        })
    );
});
