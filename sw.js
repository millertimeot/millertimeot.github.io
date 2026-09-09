/* Just Art's Board service worker.
   No fetch handler, no caching. The site must never be served stale. */

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', function (event) {
  var data = {};
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    data = {};
  }
  var title = data.title || "Just Art's";
  var body = data.body || 'Something happened at the bar.';
  var url = data.url || '/';
  var tag = data.tag || 'just-arts';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: tag,
      data: { url: url }
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  var notification = event.notification;
  var url = (notification.data && notification.data.url) || '/';
  notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          if ('navigate' in client) {
            try { client.navigate(url); } catch (e) {}
          }
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
