# Architecture Overview

**Last updated:** 21 July 2026

## Summary

craftbeer.kiwi is a client-rendered React app that fetches brewery data from Supabase and plots it on a Mapbox map. There's no custom backend server for the frontend itself — Supabase's auto-generated REST API is the "backend" the app talks to, and Vercel hosts the static built frontend. As of 20 July, a second backend layer exists alongside this: two Supabase Edge Functions that keep the brewery data itself current (see "Automated backend" below) — these run independently of the app, writing to the same Supabase database the frontend reads from.

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Browser    │◄────►│    Vercel     │      │   GitHub     │
│  (the app)   │      │  (hosting)    │◄─────│ (source repo)│
└──────┬───────┘      └──────────────┘      └─────────────┘
       │  fetch breweries (read-only, public)
       ▼
┌─────────────┐      ┌──────────────────────────┐
│   Supabase   │◄────►│   Supabase Edge Functions  │
│  (Postgres + │      │   brewery-sync             │
│  auto REST   │      │   brewery-discover          │
│     API)     │      │   (manual-trigger only,      │
└─────────────┘      │   not yet scheduled)          │
       │              └──────────┬───────────────────┘
       │  map tiles / geocoding  │  Google Places API
       ▼                         ▼
┌─────────────┐         (external, not shown)
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
- **Theme-switching system** (built 21 July, replacing the earlier `darkMode` boolean toggle): a `themeId` string plus a `THEMES` registry object drives the whole visual identity — each theme bundles a Mapbox style URL, an accent colour, and header background/text colours in one place. Ships with four themes: **Light** and **Dark** (the original `light-v11`/`dark-v11` styles, now just two entries in the registry rather than a special-cased boolean), plus **Dive Bar** and **Hop Explosion** — both structurally wired up but still using placeholder Mapbox style URLs; their actual visual identity is a deferred task (see `docs/retrospective.md` for the current state of that search). Selection happens via a `<select>` dropdown in the header (replacing the old toggle button), persisted in `localStorage` under the same `mapTheme` key as before, defaulting to the visitor's OS-level `prefers-color-scheme` on first load. Brewery pin colours (`getBreweryTheme`) needed no changes — same reasoning as before, the white pin-stroke outline keeps every brewery's colour legible regardless of which base map is active.
- **Custom user-location marker** (added 21 July): rather than relying solely on `GeolocateControl`'s built-in dot (which only appears once a visitor actively clicks it), the app now fetches the browser's position once on load via `navigator.geolocation.getCurrentPosition` and renders a custom `Marker` automatically — a blue circle with a hand-drawn hop-cone icon (Andy's own SVG artwork) and a soft pulsing ring (`box-shadow`-based animation, not `transform`/`opacity`, which caused a visible strobe/flicker on first attempt). Falls back to Wellington CBD coordinates if location is denied or unsupported. This is a static "here's roughly where you are" marker, not a live-tracking dot — a deliberate simplicity choice for a directory app rather than a navigation one. Rendered at 48×48px rather than the standard 32px pin size — the hop icon's fine internal linework blurred together at 32px in testing, so the whole marker was scaled up rather than simplifying the artwork.
- **Fly-to on pin click** (added 17 July): clicking an individual brewery pin now smoothly animates the camera to centre on it (`mapRef.current.flyTo`), reusing the same pattern already used for cluster-expansion zoom. Zoom only increases if the current view is more zoomed-out than 14 (`Math.max(zoom, 14)`), so clicking a pin while already close doesn't yank the view in further than needed.
- **Geolocate control** (added 17 July): a `GeolocateControl` from `react-map-gl` sits top-right on the map, letting a visitor centre the map on their actual position (prompts for browser location permission). Chosen over purely decorative map features (3D terrain was trialled and reverted the same session — see note below) because it directly serves the "find a brewery near me" use case rather than being visual polish.
- **Popup close button fix** (added 17 July): Mapbox's default `.mapboxgl-popup-close-button` was effectively invisible at rest against the white popup card (only appeared on hover, which doesn't exist on touch devices — a real usability gap given brewery visitors are likely on mobile). Rebuilt in `App.css` with an explicit 28×28px circular tap target, visible resting-state colour, and a subtle hover background — prioritising touch usability over a purely visual fix.
- **3D terrain — trialled and reverted (17 July)**: `map.setTerrain()` with a raster-DEM source was built and tested, giving Wellington's hills genuine 3D elevation on tilt/rotate. Reverted after evaluation: it didn't serve the core "find a brewery" wayfinding task, added real mobile rendering cost, and looked more gimmicky than polished even at reduced exaggeration. Noted here so the idea isn't re-investigated from scratch later — the code is fully removed, not just disabled.
- **Temporarily-closed brewery status** (added 17 July): two new `breweries` columns — `status` (text, defaults `'active'`, constrained to `'active' | 'temporarily_closed' | 'permanently_closed'`) and `status_note` (free text, optional) — let a brewery be manually marked as temporarily shut (e.g. flood, renovation) without removing it from the map or touching `is_active`. A temporarily-closed brewery renders with a grey pin and shows a "Temporarily Closed" badge plus the status note in its popup. This is a manual-only field — there's no automated signal for *why* a brewery is closed (Places' `business_status` only distinguishes operational/permanently-closed, not temporary situations), confirmed by the real-world case that prompted this feature: Kaikoura's Emporium Brewing was closed for flood repairs with zero mention of it on their own website, showing that even a brewery's own site can't be relied on to self-report a temporary closure. Distinct from `is_active` (permanently gone, filtered off the map entirely) and `flagged_for_review` (automated sources disagree, needs a human look) — this is the third, deliberately human-curated status layer.
- **Mobile popup fixes** (added 17 July): three issues found during real-device (iPhone) testing were resolved — (1) popups near the top of the map were drifting behind the fixed header bar, fixed by forcing the Mapbox `Popup`'s `anchor="bottom"` so it never flips to render above the pin; (2) tapping between two individual brewery pins wasn't reliably swapping the open popup (cluster-to-cluster taps worked fine, individual-to-individual didn't), fixed by adding an explicit `key={selected.id}` to force React to fully remount the popup on each brewery change rather than reusing a stale DOM node; (3) long brewery names (e.g. "Duncan's Brewing Company") were overlapping the popup's close button, fixed with `padding-right` on the popup title.
- **Map not filling the full browser window — found and fixed 21 July**: `index.css`'s `#root` rule was left over from the project's original landing-page-template starting point — it capped width at a fixed `1126px` with `margin: 0 auto`, so on any monitor wider than that the map sat centred with dead space down both sides instead of filling the viewport. Fixed by replacing the whole `#root` rule with `width: 100%; height: 100svh` and dropping the leftover `text-align: center`/`border-inline` styling, neither of which made sense for a full-viewport map app. Noted here specifically so this doesn't get silently reintroduced by copying template boilerplate again later.

### Backend — Supabase

- Postgres database, hosted in Supabase's Sydney region (closest available region to Wellington — there's no NZ region).
- Supabase's Data API auto-generates a REST API over the schema. The frontend talks to this directly using `@supabase/supabase-js` — there's no custom API layer.
- **Row Level Security (RLS)** is enabled on all tables by default (project-level setting). Access is controlled per-table via explicit policies:
  - `breweries` — public read-only (`select` policy allowing all). No write access from the client.
  - `check_ins` — no policies yet; fully locked down until user auth is built.
- **API exposure** is also controlled per-table, separately from RLS. Only `breweries` is currently exposed via the Data API; `check_ins` exists in the schema but isn't reachable via the API yet.
- Two credential tiers: the **publishable key** (safe for frontend use, respects RLS) and the **secret key** (bypasses RLS — never used in frontend code; used by the two Edge Functions below, which need to write across all rows).

### Automated backend — Supabase Edge Functions (added 20 July)

Two Edge Functions keep the `breweries` table current without manual re-Googling. Full design reasoning, including why they're two separate functions rather than one combined job, lives in `docs/craftbeer-kiwi-automation-plan.md` — this section covers what's actually deployed and running.

- **`brewery-sync`** (closure-check) — ✅ deployed and tested 20 July. For every brewery with a `place_id`, checks Google Places' `businessStatus` field. A `CLOSED_PERMANENTLY` signal sets `flagged_for_review = true` — deliberately not an automatic `is_active` flip, since that only happens once a second independent source (NZBN, not yet integrated) agrees. Tested against all 18 live breweries: `{"checked":18,"flagged":0,"errors":[]}`.
- **`brewery-discover`** (discovery) — 🔄 deployed 20 July, not yet successfully tested end-to-end. Text-searches Google Places for breweries near Wellington, deduplicates against existing `place_id`s (not name — this correctly handles a brand with multiple physical sites), and inserts genuinely new finds with `flagged_for_review = true` so nothing ships to the live map unreviewed. Manual testing is currently blocked by an unresolved Supabase secret-key validation issue affecting both functions (new-format `sb_secret_...` keys returning `401 INVALID_CREDENTIALS`) — tracked as an open item, not a code problem in either function.
- **Auth pattern**: both functions use the `withSupabase` wrapper from `@supabase/server` (`auth: 'secret'` mode, `ctx.supabaseAdmin` for RLS-bypassing writes) rather than a manually-constructed `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` client. This is Supabase's current recommended pattern for service-to-service Edge Function calls as of mid-2026, superseding the older manual-client approach.
- Both share the same `GOOGLE_PLACES_API_KEY` Supabase secret — no separate key needed per function.
- **Not yet scheduled** — both are currently manual-trigger only. `pg_cron` (or Supabase's built-in Edge Function cron) is a later step, once `brewery-discover` has a proven successful test run.

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

This data flow is entirely separate from — and unaffected by — the Edge Functions above. The app always reads whatever's currently in the `breweries` table; it has no awareness of whether a row got there manually or via `brewery-discover`, or whether `brewery-sync` has run recently.

## What's not built yet

- **Authentication** — no user accounts exist. `check_ins` table exists in schema but has no policies and isn't exposed via the API.
- **Any write path from the frontend** — the app is currently fully read-only from the client's perspective. All data changes happen via Supabase's SQL Editor/Table Editor, or via the Edge Functions above.
- **Automated brewery discovery/closure detection — partially built as of 20 July.** `brewery-sync` (closure-check) is deployed and tested; `brewery-discover` (discovery) is deployed but not yet successfully tested; description generation for newly-discovered breweries isn't built at all yet; neither function is on a schedule yet. See `docs/automation-plan.md` for full status.
- **Custom domain** — currently live only at the `.vercel.app` URL; `craftbeer.kiwi` DNS not yet pointed at Vercel (blocked on a registrar-side portal bug — see automation plan / session notes for details).
