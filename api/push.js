import { Redis } from '@upstash/redis';
import webPush from 'web-push';

// ARC Web Push endpoint (Vercel serverless).
//   GET  /api/push?action=key  -> { publicKey } (VAPID public key for subscribe)
//   POST /api/push { op:'subscribe', subscription }   -> store subscription
//   POST /api/push { op:'unsubscribe', endpoint }     -> remove subscription
//   POST /api/push { op:'send', title, body, url }    -> fan-out to all stored
// Subscriptions live in Redis list `acrcy-push-subs`, separate from board state.

const url =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL;
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN;

const redis = new Redis({ url, token });
const SUBS_KEY = 'acrcy-push-subs';
const MAX_SUBS = 500;

function vapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || 'mailto:arc@example.org';
  return { publicKey, privateKey, subject };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const { publicKey } = vapid();
    if (!publicKey) return res.status(500).json({ error: 'Push not configured' });
    return res.status(200).json({ publicKey });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const { op } = req.body || {};

    const endpointOf = (s) => (s && (s.endpoint || (s.subscription && s.subscription.endpoint))) || '';

    if (op === 'subscribe') {
      const subscription = req.body && req.body.subscription;
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Missing "subscription"' });
      }
      // null categories = all categories (default + legacy records).
      const cats = Array.isArray(req.body.categories) && req.body.categories.length
        ? req.body.categories.filter((c) => typeof c === 'string').slice(0, 20)
        : null;
      const current = (await redis.get(SUBS_KEY)) || [];
      const list = Array.isArray(current) ? current : [];
      const without = list.filter((s) => endpointOf(s) !== subscription.endpoint);
      without.push({ endpoint: subscription.endpoint, subscription, categories: cats });
      await redis.set(SUBS_KEY, without.slice(-MAX_SUBS));
      return res.status(200).json({ ok: true, count: without.length });
    }

    if (op === 'unsubscribe') {
      const endpoint = (req.body && req.body.endpoint) || '';
      const current = (await redis.get(SUBS_KEY)) || [];
      const list = Array.isArray(current) ? current : [];
      const next = endpoint ? list.filter((s) => endpointOf(s) !== endpoint) : [];
      await redis.set(SUBS_KEY, next);
      return res.status(200).json({ ok: true, count: next.length });
    }

    if (op === 'send') {
      const { publicKey, privateKey, subject } = vapid();
      if (!publicKey || !privateKey) {
        return res.status(500).json({ error: 'Push not configured' });
      }
      const title = String((req.body && req.body.title) || 'ARC Alert').slice(0, 120);
      const body = String((req.body && req.body.body) || 'New operational dispatch.').slice(0, 200);
      const targetUrl = String((req.body && req.body.url) || 'feed.html').slice(0, 200);
      const category = String((req.body && req.body.category) || '');
      webPush.setVapidDetails(subject, publicKey, privateKey);
      const current = (await redis.get(SUBS_KEY)) || [];
      const list = Array.isArray(current) ? current : [];
      // Normalize legacy bare-subscription records (all categories).
      const records = list.map((s) => {
        if (s && s.subscription && s.subscription.endpoint) return s;
        if (s && s.endpoint) return { endpoint: s.endpoint, subscription: s, categories: null };
        return null;
      }).filter(Boolean);
      const targets = category
        ? records.filter((r) => !r.categories || r.categories.indexOf(category) !== -1)
        : records;
      // Badge count: announcements currently on the board.
      let boardTotal = 0;
      try {
        const feed = (await redis.get('acrcy-feed-state')) || {};
        if (Array.isArray(feed.announcements)) boardTotal = feed.announcements.length;
      } catch (e) {}
      const payload = JSON.stringify({ title, body, url: targetUrl, total: boardTotal });
      let sent = 0;
      const alive = [];
      for (const rec of targets) {
        try {
          await webPush.sendNotification(rec.subscription, payload);
          sent += 1;
          alive.push(rec);
        } catch (err) {
          // Drop dead subscriptions (410 Gone / 404 Not Found), keep the rest.
          const status = err && err.statusCode;
          if (status !== 410 && status !== 404) alive.push(rec);
        }
      }
      // Preserve opted-out records untouched.
      const untouched = records.filter((r) => targets.indexOf(r) === -1);
      await redis.set(SUBS_KEY, alive.concat(untouched).slice(-MAX_SUBS));
      return res.status(200).json({ ok: true, sent, total: targets.length });
    }

    return res.status(400).json({ error: 'Unknown "op"' });
  } catch (err) {
    console.error('Push failed:', err);
    return res.status(500).json({ error: 'Push failed' });
  }
}
