# Architecture Overview

**Last updated:** 17 July 2026

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
- Fetches brewery data once on mount via `supabase.from('breweries').select('*').eq('is_active', true)`.
- Marker clustering: builds a `supercluster` index from brewery coordinates, recalculates visible clusters on map move/zoom, renders either a numbered cluster circle or an individual themed pin depending on zoom level.
- Per-brewery visual theming: a lookup function (`getBreweryTheme`) maps each brewery name to a colour scheme loosely reflecting its own branding (e.g. Garage Project's purple, Panhead's black-and-orange). Falls back to a default colour for any brewery not explicitly listed. As of 17 July, all 18 active breweries have an explicit entry in the `themes` lookup — this is a standing rule going forward: any newly-added brewery (manual or automated) should get an explicit theme entry reflecting its own branding rather than relying on the default fallback.
- **Light/dark map mode** (added 17 July): a `darkMode` state toggle swaps the Mapbox base style at runtime between `light-v11` and `dark-v11`. Defaults to the visitor's OS-level `prefers-color-scheme` on first load; an explicit user choice (via the header toggle button) is persisted in `localStorage` under the `mapTheme` key and takes priority over the system default on repeat visits. This is a device-level preference, not user account data, so it deliberately isn't stored in Supabase. Brewery pin colours (`getBreweryTheme`) needed no changes to support this — every pin already carries a white (`#FFF`) stroke outline, which keeps all 18 brewery colours legible against both the light and dark base styles without any dark-mode-specific palette.
- **Fly-to on pin click** (added 17 July): clicking an individual brewery pin now smoothly animates the camera to centre on it (`mapRef.current.flyTo`), reusing the same pattern already used for cluster-expansion zoom. Zoom only increases if the current view is more zoomed-out than 14 (`Math.max(zoom, 14)`), so clicking a pin while already close doesn't yank the view in further than needed.
- **Geolocate control** (added 17 July): a `GeolocateControl` from `react-map-gl` sits top-right on the map, letting a visitor centre the map on their actual position (prompts for browser location permission). Chosen over purely decorative map features (3D terrain was trialled and reverted the same session — see note below) because it directly serves the "find a brewery near me" use case rather than being visual polish.
- **Popup close button fix** (added 17 July): Mapbox's default `.mapboxgl-popup-close-button` was effectively invisible at rest against the white popup card (only appeared on hover, which doesn't exist on touch devices — a real usability gap given brewery visitors are likely on mobile). Rebuilt in `App.css` with an explicit 28×28px circular tap target, visible resting-state colour, and a subtle hover background — prioritising touch usability over a purely visual fix.
- **3D terrain — trialled and reverted (17 July)**: `map.setTerrain()` with a raster-DEM source was built and tested, giving Wellington's hills genuine 3D elevation on tilt/rotate. Reverted after evaluation: it didn't serve the core "find a brewery" wayfinding task, added real mobile rendering cost, and looked more gimmicky than polished even at reduced exaggeration. Noted here so the idea isn't re-investigated from scratch later — the code is fully removed, not just disabled.

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
2. React mounts, `useEffect` fires a fetch to Supabase's REST API for all rows in `breweries` where `is_active = true`.
3. Supabase checks the request against the `breweries` table's RLS policy, returns matching rows (subject to the publishable key's permissions).
4. Frontend builds a `supercluster` index from the returned coordinates.
5. Map renders; clusters/pins recalculated on every pan/zoom based on current viewport bounds.
6. Clicking a pin opens a popup sourced from that brewery's row (name, address, description, website) — no additional network request, data's already local from step 3.

## What's not built yet

- **Authentication** — no user accounts exist. `check_ins` table exists in schema but has no policies and isn't exposed via the API.
- **Any write path from the frontend** — the app is currently fully read-only from the client's perspective. All data changes happen manually via Supabase's SQL Editor or Table Editor.
- **Automated brewery discovery/closure detection** — planned, not yet built. See `docs/automation-plan.md`. Will introduce a new component (a scheduled Supabase Edge Function) not reflected in the diagram above yet.
- **Custom domain** — currently live only at the `.vercel.app` URL; `craftbeer.kiwi` DNS not yet pointed at Vercel.
