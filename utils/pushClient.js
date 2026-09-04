/* ARC Web Push client — shared helper for feed.html (publish + re-notify)
   and settings.html (toggle + send test). Classic script, exposes window.ArcPush.
   No dependencies. Requires sw.js at site root scope. */
(function () {
  'use strict';

  function supported() {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      typeof Notification !== 'undefined'
    );
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function getPublicKey() {
    const res = await fetch('/api/push?action=key');
    if (!res.ok) throw new Error('push key failed');
    const data = await res.json();
    if (!data || !data.publicKey) throw new Error('push key missing');
    return data.publicKey;
  }

  async function getRegistration() {
    return navigator.serviceWorker.register('sw.js');
  }

  async function currentSubscription() {
    if (!supported()) return null;
    try {
      const reg = await getRegistration();
      return await reg.pushManager.getSubscription();
    } catch (e) {
      return null;
    }
  }

  var CATS = ['Urgent', 'Operational Dispatch', 'Deployment', 'Training', 'General'];
  var CATS_KEY = 'arc_notify_cats';

  // Per-category opt-out, shared with settings.html checkboxes. Defaults to all.
  function getEnabledCategories() {
    try {
      const raw = localStorage.getItem(CATS_KEY);
      if (!raw) return CATS.slice();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return CATS.slice();
      const kept = arr.filter((c) => CATS.indexOf(c) !== -1);
      return kept.length ? kept : CATS.slice();
    } catch (e) {
      return CATS.slice();
    }
  }

  // Request permission exactly once per enable flow (never on page load).
  async function ensureSubscription() {
    if (!supported()) return null;
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return null;
    const [reg, publicKey] = await Promise.all([getRegistration(), getPublicKey()]);
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }
    await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'subscribe', subscription: sub.toJSON(), categories: getEnabledCategories() })
    });
    return sub;
  }

  async function unsubscribe() {
    if (!supported()) return true;
    try {
      const reg = await getRegistration();
      const sub = await reg.pushManager.getSubscription();
      let endpoint = '';
      if (sub) {
        endpoint = sub.endpoint || '';
        await sub.unsubscribe();
      }
      await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'unsubscribe', endpoint })
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  // Foreground-safe fan-out trigger. Server skips nothing; clients that have
  // the page open still get the OS notification unless they opted out locally.
  // `category` lets the server skip subscribers who opted out of that category.
  async function sendPush(title, body, url, category) {
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'send', title, body, url: url || 'feed.html', category: category || '' })
    });
    if (!res.ok) throw new Error('push send failed');
    return res.json();
  }

  window.ArcPush = {
    supported,
    ensureSubscription,
    currentSubscription,
    unsubscribe,
    sendPush,
    getEnabledCategories,
    categories: CATS
  };
})();
