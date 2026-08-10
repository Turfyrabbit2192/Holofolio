# Holofolio

An AI-assisted Pokémon card scanner, grader, price tracker, and collection
manager. Take two photos of a card and get an identification, an estimated
1–10 condition grade (with PSA/TAG/BGS/CGC-style estimates), and current
market pricing — then save it to a searchable, chart-backed collection.

This is an original design inspired by the general strengths of apps like
Collectr, Holodecks, and PriceCharting (clean collection dashboards, clear
card detail pages) — no copied logos, UI, or branding.

## Monorepo layout

```
apps/mobile/      Expo (React Native) app — iOS, Android, and web from one codebase
server/           Node.js + Express + Prisma API
packages/shared/  TypeScript types shared between the app and the API
```

## What's real vs. what needs your own API keys

Being upfront about this matters more than it sounds — the app is built to
never fabricate a grade or a price, so what you see depends on what's
configured:

| Feature | Status |
|---|---|
| Image quality checks (blur, brightness, glare, angle) | **Real**, runs on every photo via pixel-level analysis (Laplacian-variance sharpness, brightness/highlight stats, PCA-based orientation detection) |
| Auto straighten + crop | **Real**, same pipeline, axis-aligned (not a full perspective/homography correction) |
| Grading (centering, corners, edges, surface, PSA/TAG/BGS/CGC estimates) | **Real**, computed from actual pixel measurements of your photos using original heuristics inspired by each company's publicly known grading philosophy — not their real proprietary algorithms, and clearly labeled as estimates |
| Card identification from photos | Requires an **Anthropic API key** (Claude Vision). Without one, you search the card database manually |
| Raw market pricing (TCGplayer/Cardmarket) | **Real**, via the free [pokemontcg.io](https://pokemontcg.io) API |
| eBay / PriceCharting / Collectr pricing | **Pluggable, off by default.** Each shows "not configured" rather than a fake number until you add API credentials. See notes below |
| Collection storage, dashboard, grade history, search/filter | **Real**, backed by SQLite via Prisma (swap to Postgres by changing one env var) |

## Setup

### 1. Server

```bash
cd server
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

Fill in `.env`:
- `ANTHROPIC_API_KEY` — get one at console.anthropic.com to enable AI card
  identification. Without it, scanning still runs (quality checks, grading,
  pricing) but you'll confirm the card via manual search instead of
  auto-identification.
- `POKEMONTCG_IO_API_KEY` — optional, raises the rate limit on the free card
  database API.
- `EBAY_APP_ID` / `EBAY_CERT_ID`, `PRICECHARTING_API_TOKEN`,
  `COLLECTR_API_KEY` — optional pricing sources. Note the eBay integration
  pulls active listing prices via the Browse API, not confirmed sold comps
  (that needs eBay's separately-gated Marketplace Insights API). Collectr
  has no public developer API today, so that source stays "not configured."

The server listens on `:4000` and stores uploaded card images under
`server/uploads/`.

### 2. Mobile app

```bash
cd apps/mobile
cp .env.example .env
npm install
npm start
```

Leave `EXPO_PUBLIC_API_URL` blank in `.env` for local development — the app
auto-detects your dev machine's LAN IP from the Expo dev server, which works
for the iOS/Android simulators and physical devices on the same network. Set
it explicitly for a staging/production API.

Press `w` for web, or scan the QR code with Expo Go / a dev build for
iOS/Android. Camera-based scanning requires a real device or simulator with
camera support — it won't work in a plain web browser without a webcam.

## Data model

`User → CollectionItem → Scan / PriceSnapshot`, with a shared `CardCache`
table so repeated scans of the same printed card reuse one row. Every scan
(first or repeat) writes a `Scan` row, which is what powers grade history;
every priced scan writes a `PriceSnapshot`, which is what powers the
collection-value-over-time chart.

## Moving beyond local dev

- **Database:** change `provider`/`url` in `server/prisma/schema.prisma` to
  point at Postgres — nothing in the application code assumes SQLite.
- **Image storage:** `server/src/lib/storage.ts` is the only place that
  touches the filesystem. Swap it for an S3/GCS-backed implementation with
  the same function signature to move to cloud storage.
- **Native builds:** `apps/mobile` is a standard Expo project —
  `eas build` handles iOS/Android app store builds once you're ready.
