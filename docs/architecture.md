# Architecture Overview

**Last updated:** 25 July 2026

## Summary

craftbeer.kiwi is a client-rendered React app that fetches brewery data from Supabase and plots it on a Mapbox map. There's no custom backend server for the main app — Supabase's auto-generated REST API is the read path, and Vercel hosts the static built frontend. Data maintenance (finding new breweries, catching closures) runs separately via two scheduled Supabase Edge Functions.

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Browser    │◄────►│    Vercel     │      │   GitHub     │
│  (the app)   │      │  (hosting)    │◄─────│ (source repo)│
└──────┬───────┘      └──────────────┘      └─────────────┘
       │  fetch breweries (read-only, public)
       ▼
┌─────────────┐      ┌──────────────────┐
│   Supabase   │◄─────│  brewery-sync     │  (closure-check)
│  (Postgres + │      │  Edge Function    │
│  auto REST   │      └──────────────────┘
│     API)     │      ┌──────────────────┐
│              │◄─────│  brewery-discover │  (new brewery discovery)
└─────────────┘      │  Edge Function    │
                       └──────────────────┘
       │  map tiles / geocoding
       ▼
┌─────────────┐
│   Mapbox     │
└─────────────┘
```

## Components

### Frontend — React + Vite

- Built with Vite (switched from Create React App early on — faster dev server, simpler config).
- Single main component (`App.jsx`) currently handles data fetching, map rendering, marker clustering, and popup display. No routing yet — it's a one-page app.
- Fetches brewery data once on mount via `supabase.from('breweries').select('*')`.
- Marker clustering: builds a `supercluster` index from brewery coordinates, recalculates visible clusters on map move/zoom, renders either a numbered cluster circle or an individual themed pin depending on zoom level.
- Per-brewery visual theming: a lookup function (`getBreweryTheme`) maps each brewery name to a colour scheme loosely reflecting its own branding (e.g. Garage Project's purple, Panhead's black-and-orange). Falls back to a default colour for any brewery not explicitly listed. Every brewery must have an explicit entry — no relying on the default.

### Frontend — map theming

- Shipped 21 July, replacing the old boolean `darkMode` toggle with a `themeId` string and a `THEMES` registry, selected via a `<select>` dropdown in the header.
- Each theme entry defines `mapStyle`, `accent`, `headerBg`, and `headerText`.
- **Light** and **Dark** themes are fully implemented with real Mapbox style URLs (`light-v11` / `dark-v11`).
- **Dive Bar** and **Hop Explosion** are structurally wired up (selectable, switch state correctly) but still point at placeholder `mapStyle` URLs — visual identity for these two is a deferred, separate to-do. Two candidate approaches are under consideration: Mapbox's Standard style with its Monochrome/Faded presets (a different architecture from the current classic styles — 3D buildings, light presets — so not a drop-in URL swap), or fully custom styles built from scratch in Mapbox Studio.

### Backend — Supabase

- Postgres database, hosted in Supabase's Sydney region (closest available region to Wellington — there's no NZ region).
- Supabase's Data API auto-generates a REST API over the schema. The frontend talks to this directly using `@supabase/supabase-js` — there's no custom API layer for reads.
- **Row Level Security (RLS)** is enabled on all tables by default (project-level setting). Access is controlled per-table via explicit policies:
  - `breweries` — public read-only (`select` policy allowing all) from the frontend. Writes happen only via Edge Functions (using the secret key, which bypasses RLS) or manually via the SQL/Table Editor.
  - `check_ins` — no policies yet; fully locked down until user auth is built.
- **API exposure** is also controlled per-table, separately from RLS. Only `breweries` is currently exposed via the Data API; `check_ins` exists in the schema but isn't reachable via the API yet.
- Two credential tiers: the **publishable key** (safe for frontend use, respects RLS) and the **secret key** (bypasses RLS — never used in frontend code, used server-side by the Edge Functions below).
- `breweries` schema now includes `is_active`, `last_verified`, `place_id`, and `flagged_for_review` columns (added 13 July) in addition to the original fields — see the automation plan for detail.

### Backend — Supabase Edge Functions (brewery data maintenance)

Two separate scheduled functions, deliberately kept apart rather than combined into one, for cost-tier isolation and to limit the blast radius of a bug in either:

- **`brewery-sync`** (closure-check) — written and deployed 20 July, and successfully tested end-to-end (`{"checked":18,"flagged":0,"errors":[]}`). For each brewery with a `place_id`, checks Google Places' `businessStatus`. Per the two-source-agreement rule, a single Places "closed" signal writes to `flagged_for_review` rather than auto-flipping `is_active` — full auto-close is planned once the NZBN API is wired in as a second source.
- **`brewery-discover`** (new brewery discovery) — written and deployed 20 July, but **not yet successfully tested end-to-end**: no confirmation yet that it correctly finds, dedupes, and inserts new breweries. A `dryRun` safety flag (return what would be inserted without writing to the live table) was discussed and is worth adding before the first real run, but isn't implemented yet.
- Both functions are currently blocked from manual testing by a Supabase platform issue: new-format `sb_secret_...` keys return `401 INVALID_CREDENTIALS` against both functions, confirmed as a genuine platform-side bug, not a code problem. See the automation plan for the current status and next step.
- Neither function is scheduled yet — both are manual-trigger only until proven.

### Mapping — Mapbox

- `react-map-gl` (React wrapper around Mapbox GL JS) renders the map itself.
- Base style depends on the active theme (see Theming above) — `light-v11` and `dark-v11` are live; Dive Bar/Hop Explosion styles are placeholders pending design work.
- Access via a public Mapbox token (`pk.…`), safe to expose in frontend code by design — Mapbox tokens are scoped/rate-limited, not secret credentials.
- Custom hop-cone SVG marker for the user's own location, replacing the earlier pulsing blue circle (shipped 21 July).

### Hosting — Vercel

- Connected directly to the GitHub repo. Every push to `main` triggers an automatic build and deploy.
- Environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MAPBOX_TOKEN`) are set manually in the Vercel dashboard — they're not pulled from `.env.local` automatically, since that file is (correctly) never committed to the repo.
- Hobby (free) plan — sufficient for current traffic levels.

## Data flow: loading the map

1. Browser loads the app from Vercel's CDN.
2. React mounts, `useEffect` fires a fetch to Supabase's REST API for all rows in `breweries` where `is_active = true`.
3. Supabase checks the request against the `breweries` table's RLS policy, returns matching rows (subject to the publishable key's permissions).
4. Frontend builds a `supercluster` index from the returned coordinates.
5. Map renders, styled according to the currently selected theme; clusters/pins recalculated on every pan/zoom based on current viewport bounds.
6. Clicking a pin opens a popup sourced from that brewery's row (name, address, description, website) — no additional network request, data's already local from step 3.

## Data flow: automated maintenance (separate from the above)

1. `brewery-sync` runs (currently manual-trigger only), checks each brewery with a `place_id` against Google Places, and either updates `last_verified`, flags for review, or (once NZBN is wired in) auto-closes on two-source agreement.
2. `brewery-discover` runs (currently manual-trigger only, unproven), searches Places for new breweries in the target region, and inserts any not already matched by `place_id`.
3. Neither function currently generates descriptions for new inserts — that step (via the Anthropic API) is planned but not yet built.

## What's not built yet

- **Authentication** — no user accounts exist. `check_ins` table exists in schema but has no policies and isn't exposed via the API.
- **Any write path from the frontend** — the app itself is still fully read-only from the client's perspective. All writes happen via Edge Functions or manually via Supabase's SQL Editor/Table Editor.
- **`brewery-discover` end-to-end verification** — written and deployed, but blocked from testing by the Supabase key issue noted above.
- **NZBN API integration** — the second verification source needed to upgrade closure-check from single-source flagging to real two-source auto-close.
- **Anthropic API description-generation step** for newly-discovered breweries.
- **Scheduling** — both Edge Functions are manual-trigger only; `pg_cron`/Supabase's built-in cron scheduling hasn't been set up yet.
- **Dive Bar / Hop Explosion theme visuals** — structurally wired up, real style URLs still pending.
- **Favourites / brewery trail persistence** — design decided (anonymous `crypto.randomUUID()` in `localStorage`, a `trails` table, 7-day expiry via a scheduled function, separate public share-codes), nothing built yet.
- **Name search** — planned as client-side filtering before the supercluster index, likely a new `SearchBar.jsx` component; not started.
- **Custom domain** — currently live only at the `.vercel.app` URL; `craftbeer.kiwi` DNS not yet pointed at Vercel (blocked on a Discount Domains portal bug — see the to-do list).
