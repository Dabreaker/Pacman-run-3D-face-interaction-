/**
 *  ╔══════════════════════════════════════════╗
 *  ║   NEURAL PAC-MAN RUNNER — VERCEL EDITION ║
 *  ║   Express + Vercel Postgres               ║
 *  ║   Deploy: vercel --prod                   ║
 *  ╚══════════════════════════════════════════╝
 */

'use strict';

const express = require('express');
const path    = require('path');
const https   = require('https');
const { sql } = require('@vercel/postgres');

// ── Config ─────────────────────────────────────────────────────────────────
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';
const BLOB_BASE  = 'https://blob.vercel-storage.com';

// ── DB Bootstrap ───────────────────────────────────────────────────────────
// Called once per cold start — idempotent
let dbReady = false;
async function ensureDB() {
  if (dbReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS pac_scores (
      id               SERIAL PRIMARY KEY,
      player_name      TEXT    NOT NULL,
      score            INTEGER NOT NULL DEFAULT 0,
      max_speed        TEXT    DEFAULT '1.0',
      coins_collected  INTEGER DEFAULT 0,
      ghosts_eaten     INTEGER DEFAULT 0,
      timestamp        TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS pac_face_caps (
      id          SERIAL PRIMARY KEY,
      player_id   TEXT      NOT NULL,
      blob_url    TEXT      NOT NULL,
      timestamp   TIMESTAMP DEFAULT NOW()
    )
  `;
  dbReady = true;
}

// Try boot (non-fatal on cold start without DB)
if (process.env.POSTGRES_URL) {
  ensureDB().catch(e => console.warn('[ensureDB]', e.message));
}

// ── Blob upload helper ──────────────────────────────────────────────────────
function uploadToBlob(buffer, filename) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BLOB_BASE}/${filename}`);
    const opts = {
      hostname: url.hostname,
      path:     url.pathname,
      method:   'PUT',
      headers: {
        'Authorization':  `Bearer ${BLOB_TOKEN}`,
        'Content-Type':   'image/jpeg',
        'x-content-type': 'image/jpeg',
        'Content-Length':  buffer.length,
      }
    };
    const req = https.request(opts, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); } catch { resolve({ url: `${BLOB_BASE}/${filename}` }); }
        } else {
          reject(new Error(`Blob ${res.statusCode}: ${body.slice(0,200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

// ── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Clean-URL page routes
const ROOT = path.join(__dirname, '..', 'public');
[['/', 'index'], ['/game', 'game'], ['/leaderboard', 'leaderboard']].forEach(([route, file]) => {
  app.get(route, (_req, res) => res.sendFile(path.join(ROOT, `${file}.html`)));
});

// ── Score API ───────────────────────────────────────────────────────────────
app.post('/api/score', async (req, res) => {
  try {
    await ensureDB();
    const { name='Anonymous', score=0, speed='1.0', coins=0, ghosts=0 } = req.body;
    const pname = String(name).slice(0,20).toUpperCase();
    const sc    = parseInt(score)  || 0;
    const co    = parseInt(coins)  || 0;
    const gh    = parseInt(ghosts) || 0;
    const sp    = String(speed);

    await sql`INSERT INTO pac_scores (player_name, score, max_speed, coins_collected, ghosts_eaten)
              VALUES (${pname}, ${sc}, ${sp}, ${co}, ${gh})`;

    const { rows } = await sql`SELECT COUNT(*) AS cnt FROM pac_scores WHERE score > ${sc}`;
    const rank = parseInt(rows[0].cnt) + 1;
    res.json({ status:'ok', rank });
  } catch(e) {
    console.error('[POST /api/score]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Leaderboard API ─────────────────────────────────────────────────────────
app.get('/api/leaderboard', async (req, res) => {
  try {
    await ensureDB();
    const { rows } = await sql`
      SELECT player_name, score, max_speed, coins_collected, ghosts_eaten,
             TO_CHAR(timestamp, 'YYYY-MM-DD HH24:MI') AS timestamp
      FROM pac_scores
      ORDER BY score DESC
      LIMIT 50
    `;
    res.json(rows);
  } catch(e) {
    console.error('[GET /api/leaderboard]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Face Snapshot API ────────────────────────────────────────────────────────
app.post('/api/face-snap', async (req, res) => {
  if (!BLOB_TOKEN) {
    return res.status(503).json({ error: 'BLOB_READ_WRITE_TOKEN not configured on Vercel' });
  }
  const { player_id='anonymous', image='' } = req.body;
  if (!image) return res.status(400).json({ error: 'No image data' });

  const b64  = image.includes(',') ? image.split(',')[1] : image;
  const buf  = Buffer.from(b64, 'base64');
  const ts   = Date.now();
  const file = `faces/${player_id}/${ts}.jpg`;

  try {
    const result = await uploadToBlob(buf, file);
    const url = result.url || `${BLOB_BASE}/${file}`;

    // Save to DB (non-fatal)
    try {
      await ensureDB();
      await sql`INSERT INTO pac_face_caps (player_id, blob_url) VALUES (${player_id}, ${url})`;
    } catch(dbErr) {
      console.warn('[face-snap db]', dbErr.message);
    }

    res.json({ status:'ok', url, filename: file });
  } catch(e) {
    console.error('[face-snap blob]', e.message);
    res.status(502).json({ error: e.message });
  }
});

// ── Get face captures for a player ──────────────────────────────────────────
app.get('/api/face-captures/:pid', async (req, res) => {
  try {
    await ensureDB();
    const { rows } = await sql`
      SELECT blob_url, TO_CHAR(timestamp,'YYYY-MM-DD HH24:MI:SS') AS timestamp
      FROM pac_face_caps
      WHERE player_id = ${req.params.pid}
      ORDER BY timestamp DESC
      LIMIT 50
    `;
    res.json(rows);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = app;
