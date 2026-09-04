/* ARC Web Push service worker — must stay at site root scope (/sw.js).
   Handles background push for ALERTS publish + Re-notify. No build step. */
'use strict';

self.addEventListener('push', (event) => {
  let data = { title: 'ARC Alert', body: 'New operational dispatch.', url: 'feed.html', total: 0 };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = {
        title: typeof parsed.title === 'string' && parsed.title ? parsed.title.slice(0, 120) : data.title,
        body: typeof parsed.body === 'string' && parsed.body ? parsed.body.slice(0, 200) : data.body,
        url: typeof parsed.url === 'string' && parsed.url ? parsed.url : data.url,
        total: typeof parsed.total === 'number' && parsed.total > 0 ? parsed.total : 0
      };
    }
  } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'assets/favicon-32.png',
      badge: 'assets/favicon-32.png',
      tag: 'arc-feed',
      renotify: true,
      data: { url: data.url }
    }).then(() => {
      try {
        if (data.total > 0 && 'setAppBadge' in navigator) return navigator.setAppBadge(data.total);
      } catch (e) {}
      return undefined;
    }).catch(() => {})
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  try {
    if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
  } catch (e) {}
  const url = (event.notification.data && event.notification.data.url) || 'feed.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        try {
          const u = new URL(client.url);
          if (u.pathname.endsWith('/feed.html') || u.pathname.endsWith('feed.html')) {
            return client.focus();
          }
        } catch (e) {}
      }
      return self.clients.openWindow(url);
    })
  );
});
