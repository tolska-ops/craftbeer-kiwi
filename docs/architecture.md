# Architecture Overview

**Last updated:** 11 July 2026

## Summary

craftbeer.kiwi is a client-rendered React app that fetches brewery data from Supabase and plots it on a Mapbox map. There's no custom backend server — Supabase's auto-generated REST API is the entire "backend," and Vercel hosts the static built frontend.

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Browser    │◄────►│    Vercel     │      │   GitHub     │
│  (the app)   │      │  (hosting)    │◄─────│ (source repo)│
└──────┬───────┘      └──────────────┘      └─────────────┘
       │  fetch breweries (read-only, public)
       ▼
┌─────────────┐
│   Supabase   │
│  (Postgres + │
│  auto REST   │
│     API)     │
└─────────────┘

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
- Per-brewery visual theming: a lookup function (`getBreweryTheme`) maps each brewery name to a colour scheme loosely reflecting its own branding (e.g. Garage Project's purple, Panhead's black-and-orange). Falls back to a default colour for any brewery not explicitly listed.

### Backend — Supabase

- Postgres database, hosted in Supabase's Sydney region (closest available region to Wellington — there's no NZ region).
- Supabase's Data API auto-generates a REST API over the schema. The frontend talks to this directly using `@supabase/supabase-js` — there's no custom API layer.
- **Row Level Security (RLS)** is enabled on all tables by default (project-level setting). Access is controlled per-table via explicit policies:
  - `breweries` — public read-only (`select` policy allowing all). No write access from the client.
  - `check_ins` — no policies yet; fully locked down until user auth is built.
- **API exposure** is also controlled per-table, separately from RLS. Only `breweries` is currently exposed via the Data API; `check_ins` exists in the schema but isn't reachable via the API yet.
- Two credential tiers: the **publishable key** (safe for frontend use, respects RLS) and the **secret key** (bypasses RLS — never used in frontend code, reserved for future server-side/Edge Function use).

### Mapping — Mapbox

- `react-map-gl` (React wrapper around Mapbox GL JS) renders the map itself.
- Base style: `mapbox://styles/mapbox/light-v11` — a clean, light style chosen over the busier default `streets-v12` for a cleaner directory-app look.
- Access via a public Mapbox token (`pk.…`), safe to expose in frontend code by design — Mapbox tokens are scoped/rate-limited, not secret credentials.

### Hosting — Vercel

- Connected directly to the GitHub repo. Every push to `main` triggers an automatic build and deploy.
- Environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MAPBOX_TOKEN`) are set manually in the Vercel dashboard — they're not pulled from `.env.local` automatically, since that file is (correctly) never committed to the repo.
- Hobby (free) plan — sufficient for current traffic levels.

## Data flow: loading the map

1. Browser loads the app from Vercel's CDN.
2. React mounts, `useEffect` fires a fetch to Supabase's REST API for all rows in `breweries` where `is_active = true` *(planned — see schema notes)*.
3. Supabase checks the request against the `breweries` table's RLS policy, returns matching rows (subject to the publishable key's permissions).
4. Frontend builds a `supercluster` index from the returned coordinates.
5. Map renders; clusters/pins recalculated on every pan/zoom based on current viewport bounds.
6. Clicking a pin opens a popup sourced from that brewery's row (name, address, description, website) — no additional network request, data's already local from step 3.

## What's not built yet

- **Authentication** — no user accounts exist. `check_ins` table exists in schema but has no policies and isn't exposed via the API.
- **Any write path from the frontend** — the app is currently fully read-only from the client's perspective. All data changes happen manually via Supabase's SQL Editor or Table Editor.
- **Automated brewery discovery/closure detection** — planned, not yet built. See `docs/automation-plan.md`. Will introduce a new component (a scheduled Supabase Edge Function) not reflected in the diagram above yet.
- **Custom domain** — currently live only at the `.vercel.app` URL; `craftbeer.kiwi` DNS not yet pointed at Vercel.
