# 🚀 NEURAL PAC-MAN RUNNER — VERCEL EDITION

> Express + Vercel Postgres + Vercel Blob. Deploy in ~5 minutes.

## Deploy

```bash
npm i -g vercel
cd vercel_edition

vercel link
vercel env add POSTGRES_URL
vercel env add BLOB_READ_WRITE_TOKEN
vercel --prod
```

### Get your credentials
- `POSTGRES_URL` → Vercel Dashboard → Storage → Create → **Postgres** → `.env.local`
- `BLOB_READ_WRITE_TOKEN` → Vercel Dashboard → Storage → Create → **Blob** → `.env.local`

## Local dev against Vercel Postgres

```bash
npm install
cp .env.example .env.local
# fill in real values
vercel env pull .env.local
vercel dev   # runs at http://localhost:3000
```

## Structure

```
vercel_edition/
├── api/
│   └── index.js      Express serverless handler
├── public/
│   ├── index.html    Landing page
│   ├── game.html     Game (Three.js + MediaPipe)
│   ├── leaderboard.html
│   └── css/
│       └── style.css
├── vercel.json       Routing
└── package.json      express + @vercel/postgres
```

## DB tables (auto-created on first cold start)

| Table | Contents |
|---|---|
| `pac_scores` | Leaderboard entries |
| `pac_face_caps` | Blob URLs of face snapshots |
