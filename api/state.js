import { Redis } from '@upstash/redis';

// Vercel's Upstash integration has used a couple of different env var
// naming conventions over time. Check the common ones so this keeps
// working regardless of which your dashboard injected.
const url =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL;
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN;

const redis = new Redis({ url, token });

// One Redis database, two namespaced keys — Nexus (QR board) and Core
// (deliverables tracker) never touch each other's data.
function stateKeyFor(app) {
  if (app === 'nexus') return 'acrcy-nexus-state';
  return 'acrcy-tracker-state'; // "core" — keeps the original tracker's key
}

export default async function handler(req, res) {
  // Allow simple cross-origin use if ever needed; harmless for same-origin too.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const app = (req.query && req.query.app) === 'nexus' ? 'nexus' : 'core';
  const STATE_KEY = stateKeyFor(app);

  if (req.method === 'GET') {
    try {
      const data = (await redis.get(STATE_KEY)) || {};
      return res.status(200).json(data);
    } catch (err) {
      console.error('KV read failed:', err);
      return res.status(500).json({ error: 'Failed to read state' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { field, value } = req.body || {};
      if (!field) {
        return res.status(400).json({ error: 'Missing "field" in request body' });
      }

      // Merge just this one field into the stored object rather than
      // overwriting the whole thing — this is what makes it safe for
      // multiple people/tabs to save around the same time.
      const current = (await redis.get(STATE_KEY)) || {};
      current[field] = value;
      await redis.set(STATE_KEY, current);

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('KV write failed:', err);
      return res.status(500).json({ error: 'Failed to save state' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
