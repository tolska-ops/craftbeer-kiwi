# Architecture Overview

**Last updated:** 28 July 2026

## Summary

craftbeer.kiwi is a client-rendered React app that fetches brewery data from Supabase and plots it on a Mapbox map. There's no custom backend server for the frontend's own use — Supabase's auto-generated REST API is the read path, and Vercel hosts the static built frontend. Supabase Edge Functions provide a second, separate write path: scheduled/manually-triggered server-side automation that checks for closed breweries and discovers new ones. The site is now live at its own domain, with basic visitor analytics, and there's a separate dev-only Supabase project so schema/Edge Function/frontend changes can be tested without touching production data or visitors.

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  craftbeer.  │      │    Vercel     │      │   GitHub     │
│    kiwi      │◄────►│  (hosting +   │◄─────│ (source repo)│
│  (Browser)   │      │   Analytics)  │      └─────────────┘
└──────┬───────┘      └──────────────┘
       │  fetch breweries (read-only, public)
       ▼
┌─────────────┐      ┌───────────────────┐      ┌──────────────┐
│  Supabase    │◄────►│  Edge Functions    │─────►│ Google Places │
│  PRODUCTION  │      │  brewery-sync      │      │      API      │
│ (Postgres +  │      │  brewery-discover  │      └──────────────┘
│  auto REST   │      └───────────────────┘
│     API)     │
└─────────────┘
       │  map tiles / geocoding / native symbol-layer labels
       ▼
┌─────────────┐              ┌──────────────────┐
│   Mapbox     │              │  Supabase DEV     │  ← local-only,
└─────────────┘              │  (separate project,│    never touched
                              │   local .env.local  │    by Vercel
                              │   points here)       │
                              └──────────────────┘
```

## Components

### Frontend — React + Vite

- Built with Vite (switched from Create React App early on — faster dev server, simpler config).
- Single main component (`App.jsx`) currently handles data fetching, map rendering, marker clustering, theming, and popup display. No routing yet — it's a one-page app; size/complexity is becoming a factor in planning future features (e.g. search is planned to be extracted into its own `SearchBar.jsx` rather than added inline).
- Fetches brewery data once on mount via `supabase.from('breweries').select('*')`.
- Marker clustering: builds a `supercluster` index from brewery coordinates, recalculates visible clusters on map move/zoom, renders either a numbered cluster circle or an individual themed pin depending on zoom level.
- Per-brewery visual theming: a lookup function (`getBreweryTheme`) maps each brewery name to a colour scheme loosely reflecting its own branding (e.g. Garage Project's purple, Panhead's black-and-orange). Every brewery must have an explicit entry — no falling back to a default colour (standing rule, see `craftbeer-kiwi-decisions.md`).
- **Brewery name labels** (shipped 27 July): a native Mapbox `<Source>`/`<Layer>` (symbol layer) renders brewery names as text, separate from the pin `Marker` components. Built from a `labelGeoJSON` memo derived from the already zoom-aware `clusters` array (filtered to exclude anything currently absorbed into a numbered cluster bubble) rather than the raw `breweries` array — this was a real bug caught and fixed during testing, since building from raw `breweries` produced floating labels for pins hidden inside cluster circles. Labels only appear at `minzoom={14}` (deliberately tuned up from an initial `13` after testing showed the lower threshold felt crowded; `14` was chosen because it matches the existing pin-click `flyTo` zoom, so labels tend to appear right where users naturally land anyway). Styled bold, 14px, with a 2.5px halo for legibility, confirmed readable on both Light and Dark themes. Uses `text-allow-overlap: false` for genuine label-vs-label collision detection — Mapbox will hide a label rather than let it overlap another. **Known limitation:** because pins remain separate React `Marker` components entirely outside Mapbox's own rendering system, a label can still visually overlap a *neighbouring pin* (not just another label) — Mapbox's collision detection has no awareness of the pins at all. This is the accepted trade-off of keeping pins visually unchanged rather than migrating them into the symbol-layer system too; see `craftbeer-kiwi-todo.md` for the deferred full-migration option.
- **Map theme-switching system** (shipped 21 July): replaces the earlier dark-mode boolean. A `themeId` string plus a `THEMES` registry (accent/headerBg/headerText/mapStyle per theme) drives a `<select>` dropdown in the header. Light and Dark themes are live with real Mapbox style URLs (`light-v11`/`dark-v11`). Dive Bar and Hop Explosion are structurally wired up but still point at placeholder `mapStyle` URLs — visual identity for these two is a deferred, separate to-do.
- **Environment indicator badge** (added 27 July): a small red "DEV" badge renders in the header, next to the theme dropdown, whenever the app is running against a non-production environment. Driven by a single constant — `const APP_ENV = import.meta.env.VITE_APP_ENV || 'production'` — read from a new `VITE_APP_ENV` variable. Local `.env.local` sets this to `development`; Vercel's production environment variables don't set it at all, so it correctly defaults to `'production'` and the badge never renders on the live site. Added specifically to prevent the kind of mix-up that nearly caused a schema change to run against the wrong project (see `craftbeer-kiwi-retrospective.md`, block 12).
- **User location**: `GeolocateControl` plus a custom user-location marker using Andy's own hop-cone SVG artwork (replacing an earlier Claude-drawn approximation). Fly-to animation on pin click. **Fixed 27 July:** both failure paths (no geolocation support at all, and permission denied/timeout) previously set the marker to a hardcoded Wellington CBD coordinate — now they leave `userLocation` as `null`, so the marker simply doesn't render rather than showing a misleading fake position. Also switched to `enableHighAccuracy: true, maximumAge: 0, timeout: 10000` to reduce the chance of a stale/cached low-accuracy fix being used. Directly addresses the 26 July Blenheim visitor report.
- **Temporary closure status**: `status` / `status_note` fields drive a grey pin, badge, and popup note for breweries that are temporarily closed, kept distinct from `is_active` (permanently gone) and `flagged_for_review` (source disagreement). This is a manual-entry feature — a brewery's own website can't be relied on to announce a temporary closure, so there's no automated signal to detect it.
- **Known regression**: the mobile popup header-obscuring bug (fixed 17 July, confirmed on real iPhone hardware 19 July) has reappeared as of 27 July — the 21 July theme-dropdown addition made the header taller, and the popup title now slides under it again on pin tap. Not yet fixed; see `craftbeer-kiwi-todo.md`.

### Backend — Supabase (production)

- Postgres database, hosted in Supabase's Sydney region (closest available region to Wellington — there's no NZ region).
- Supabase's Data API auto-generates a REST API over the schema. The frontend talks to this directly using `@supabase/supabase-js` — there's no custom API layer for reads.
- **Row Level Security (RLS)** is enabled on all tables by default (project-level setting). Access is controlled per-table via explicit policies:
  - `breweries` — public read-only (`select` policy allowing all). No write access from the client.
  - `check_ins` — no policies yet; fully locked down until user auth/favourites is built.
- **API exposure** is also controlled per-table, separately from RLS. Only `breweries` is currently exposed via the Data API; `check_ins` exists in the schema but isn't reachable via the API yet.
- Two credential tiers: the **publishable key** (safe for frontend use, respects RLS) and the **secret key** (bypasses RLS — never used in frontend code, used by Edge Functions for automation writes).
- **`venue_type` column** (added 27 July) — a text field, default `'brewery'`, also used as `'bar'`. Lets the frontend correctly exclude venues that Google Places' discovery search legitimately returns but that aren't actually breweries (craft beer bars, pubs, general venues), without deleting the row (which would cause them to be silently rediscovered on the next `brewery-discover` run, since dedup only checks `place_id`). See `craftbeer-kiwi-decisions.md` for why a string field was chosen over a simple boolean.
- **`has_theme` / `is_published` columns and the `theme_required_to_publish` constraint** (added 28 July) — `has_theme` (boolean, default `false`) makes the standing "every brewery needs an explicit `getBreweryTheme` entry" rule visible in the schema rather than only enforced by convention. `is_published` (boolean, `not null default true`) is a separate publish gate, distinct from both `is_active` (permanent closure) and `flagged_for_review` (source disagreement) — deliberately not reusing either, since a flagged brewery per the two-source-agreement rule stays visible while under review, and conflating "closed" with "not yet ready to publish" would blur two different lifecycle states. A check constraint enforces the rule structurally rather than relying on memory: `check (not is_published or has_theme or venue_type != 'brewery')` — a brewery row cannot be set `is_published = true` without an explicit theme entry. Existing rows defaulted to `is_published = true` on migration (no disruption to the live map); new rows from `brewery-discover` are expected to land `is_published = false` until triaged and themed. See `craftbeer-kiwi-decisions.md` for the full reasoning.
- **`nzbn` / `nzbn_entity_name` / `on_watchlist` / `watchlist_note` columns** (added 28 July) — `nzbn` (text, nullable) stores each brewery's New Zealand Business Number where known; unlike trading names, an NZBN is stable across rebrands and ownership changes, and since it's entity- rather than site-level, multiple rows sharing one NZBN could become a reliable signal for the existing multi-site-brand blind spot. `nzbn_entity_name` (text, nullable, added mid-backfill) records the *registered legal name* alongside the number — added once it became clear trading names routinely diverge from legal names (e.g. "Heyday Beer Co" trading name vs. "Has Beer Limited" legal name), so the mapping is worth keeping rather than re-deriving on every future lookup. Currently populated manually; a full pass across all 23 breweries was completed 28 July (see `craftbeer-kiwi-decisions.md` for the findings). `on_watchlist` (boolean, default `false`) and `watchlist_note` (text, nullable) are a deliberately internal-only pair — never surfaced on the public map — for unconfirmed signals worth a human's attention but not yet actionable: ambiguous NZBN matches, uncertain post-acquisition ownership, liquidation status of unclear relevance. Kept generic rather than NZBN-specific, since the same shape will likely apply to other future signals too. Surfaced in the exceptions report (below) alongside the existing flagged/stale/unpublished categories.
- **Secret-key Edge Function auth — resolved 27 July.** The week-long `sb_secret_...` 401 issue was not a Supabase platform bug. `@supabase/server`'s secret-key auth mode requires a named key (`auth: "secret:<name>"`); both Edge Functions had been written with the incomplete `auth: "secret"` (no name), which the SDK couldn't resolve to any actual key. Fixed by referencing the correct named key (`brewery_sync_v2`, set in Supabase's Settings → API Keys) in both functions' code and redeploying. See `craftbeer-kiwi-decisions.md` for the full troubleshooting story and the general lesson for future Edge Functions using this auth mode.

### Backend — Supabase (dev)

Added 27 July, as a genuinely separate Supabase project rather than a branch of production (see `craftbeer-kiwi-decisions.md` for why branching was ruled out). Already proven its worth: caught a near-miss schema mix-up and two real bugs in the brewery name labels feature (see below), all before anything reached production.

- **`craftbeer-kiwi-DEV`** — a second, free-tier Supabase project. Hosted in Supabase's Tokyo region rather than production's Sydney region — a deliberate, low-stakes deviation, not worth blocking on.
- Schema mirrors production: `breweries` and `check_ins` tables, same columns/types, same RLS setup (enabled on both tables, public read-only `select` policy on `breweries`).
- Used for both backend and frontend testing: originally intended for schema/Edge Function changes, but its first real use (27 July) was testing a purely frontend feature (brewery name labels) with disposable test data — deliberately dense/overlapping test breweries and long real brewery names, both cleaned up before the final version reached production.
- **Only connected via local `.env.local`** — `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` point here when running `npm run dev` locally. Vercel's dashboard environment variables are untouched and continue to point at the production project, so production deploys are entirely unaffected by whatever's happening in dev.
- **Known constraints:** this uses the second of Andy's two free-tier Supabase project slots (the free plan allows two). Free-tier projects also auto-pause after roughly a week of inactivity and need a manual "wake" (usually just opening the dashboard) if left untouched between sessions.

### Automation infrastructure — Edge Functions

Two Supabase Edge Functions, deliberately kept as separate deployments rather than one combined function, for cost-tier isolation and failure blast-radius reasons (see `craftbeer-kiwi-decisions.md`). Both currently run against the **production** Supabase project only — neither has been pointed at or tested against the dev project yet. **Both are now proven working end-to-end** (as of 27 July), after resolving the secret-key auth issue above.

- **`brewery-sync`** (closure-check) — written using the `withSupabase`/`@supabase/server` auth pattern. Successfully tested twice: `{"checked":18,"flagged":0,"errors":[]}` (20 July) and `{"checked":19,"flagged":0,"errors":[]}` (27 July, after the auth fix). Implements the two-source-agreement safety rule: `is_active` only auto-flips to `false` when both Google Places API and NZBN agree a brewery is closed; a single Places signal alone writes to `flagged_for_review` instead. NZBN isn't wired in yet, so today this effectively means every closure signal is flagged for manual review, not auto-closed.
- **`brewery-discover`** (discovery) — written and deployed, and **successfully tested end-to-end for the first time on 27 July**: `{"found":20,"inserted":12,"skipped":8}`. Correctly dedupes against existing `place_id`s (8 skipped), but the search itself returns a broader category of results than intended — roughly half the 12 new insertions were craft beer bars/pubs rather than breweries, and one was a duplicate listing for an existing brewery under a different `place_id`. See `craftbeer-kiwi-automation-plan.md` "Discovery quality issues" for the full finding. A `dryRun` safety flag (return what would be inserted without writing to the live table) is still not implemented, despite being discussed since 20 July — the 27 July run is a concrete example of exactly the scenario it was meant to catch.
- Both functions are currently **manual-trigger only** — scheduling (`pg_cron` or Supabase's built-in cron) is planned once the discovery-quality issues above are better handled, not just once the function technically runs successfully.
- **Known blind spot:** name-based discovery (this function, plus the Places API and excise-list cross-checks) treats multiple venues under one brand as duplicates, so a second site for an existing brand can be silently skipped. Regional tourism board pages surface multi-site brands more reliably. Found via Garage Project Wild Workshop being missed despite Garage Project already being in the directory — see `craftbeer-kiwi-decisions.md`. **Related but distinct blind spot found 27 July:** `place_id`-only dedup can also miss the *reverse* case — Google returning two different listings (two different `place_id`s) for what's actually the same physical business, as happened with "Garage Project Aro Taproom" duplicating the existing Garage Project entry.

### Mapping — Mapbox

- `react-map-gl` (React wrapper around Mapbox GL JS) renders the map itself.
- Base style is now theme-dependent (see theme-switching above): `light-v11` for Light, `dark-v11` for Dark. Dive Bar and Hop Explosion are on placeholder styles pending a decision between Mapbox's Standard style (built-in Monochrome/Faded presets — architecturally different from the classic styles above, would need its own implementation) versus fully custom Mapbox Studio styles.
- Access via a public Mapbox token (`pk.…`), safe to expose in frontend code by design — Mapbox tokens are scoped/rate-limited, not secret credentials.
- Two rendering systems now coexist on the same map: brewery pins are plain React `Marker` components (DOM elements positioned over the map), while brewery name labels use Mapbox's native `Source`/`Layer` symbol-layer system (rendered on the map canvas itself). They don't share collision awareness of each other — see the frontend section above for the known limitation this causes.

### Hosting — Vercel

- Connected directly to the GitHub repo. Every push to `main` triggers an automatic build and deploy.
- Environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MAPBOX_TOKEN`) are set manually in the Vercel dashboard — they're not pulled from `.env.local` automatically, since that file is (correctly) never committed to the repo. `VITE_APP_ENV` is deliberately *not* set here, so the app defaults to `'production'` and the DEV badge stays hidden on the live site.
- Hobby (free) plan — sufficient for current traffic levels. Worth noting: Vercel's Hobby plan terms are commonly described as scoped to "personal, non-commercial" use — worth confirming against Vercel's own current terms given craftbeer.kiwi is now owned by a registered company (Craft Beer Kiwi Collective Limited) rather than personally by Andy. Not an issue while unmonetised; flagged in `craftbeer-kiwi-todo.md` as worth checking properly at some point.
- **Custom domain live:** `craftbeer.kiwi` is pointed at Vercel via an A record (`@` → Vercel's current recommended IP) at the registrar (Discount Domains), confirmed via global DNS propagation check and working on multiple real-world networks. `craftbeer-kiwi.vercel.app` continues to work as well and serves the same deployment.
- **Vercel Web Analytics** enabled (27 July) — `@vercel/analytics` package installed, `<Analytics />` component rendered in `App.jsx` (using the `@vercel/analytics/react` import, since this is a Vite project rather than Next.js). Gives basic visitor/pageview/bounce-rate numbers in the Vercel dashboard — the first real usage visibility beyond Andy's own testing.

### Security

- 2FA enabled on GitHub, Supabase, and Vercel accounts (25 July) — closes out a to-do that had been carried forward across several prior sessions.
- Google Places API key is restricted to the Places API only, stored in Bitwarden as a Secure Note. Application (IP) restriction is deliberately deferred until the Edge Functions' egress IPs are known.

## Data flow: loading the map

1. Browser loads the app from Vercel's CDN — either via `craftbeer.kiwi` or `craftbeer-kiwi.vercel.app`, both serve the same production deployment.
2. React mounts, `useEffect` fires a fetch to Supabase's REST API for all rows in `breweries` where `is_active = true`, `venue_type = 'brewery'`, and `is_published = true` (added 28 July, so unthemed/untriaged automated inserts stay off the live map until confirmed).
3. Supabase checks the request against the `breweries` table's RLS policy, returns matching rows (subject to the publishable key's permissions).
4. Frontend builds a `supercluster` index from the returned coordinates.
5. Map renders; clusters/pins recalculated on every pan/zoom based on current viewport bounds. Once zoomed past level 14, a separate Mapbox symbol layer also renders name labels for any pin that isn't currently absorbed into a cluster.
6. Clicking a pin opens a popup sourced from that brewery's row (name, address, description, website, and status/status_note if temporarily closed) — no additional network request, data's already local from step 3.

**In local dev**, steps 2-3 hit the separate `craftbeer-kiwi-DEV` Supabase project instead (per `.env.local`), so the browser shows only the fake test breweries seeded there, and a red DEV badge renders in the header as a visual reminder which environment is active.

## Data flow: automation (separate from the above)

1. `brewery-sync` is manually triggered (HTTP call to the deployed Edge Function).
2. For each active brewery, it checks status against Google Places API (NZBN not yet wired in).
3. Per the two-source-agreement rule: a "closed" signal from Places alone writes `flagged_for_review = true`, not `is_active = false`.
4. `brewery-discover` (separately triggered) searches for candidate new breweries via Places API, intended to dedupe against existing rows and insert genuinely new ones — this step is unverified pending the key issue above.

Both functions currently target the production Supabase project only.

## What's not built yet

- **Authentication / favourites** — no user accounts. Favourites/trail persistence is designed (anonymous `crypto.randomUUID()` device ID in `localStorage`, a `trails` table, scheduled cleanup, separate share-codes for sharing) but not yet built. `check_ins` table exists in schema but has no policies and isn't exposed via the API.
- **Any write path from the frontend** — the app is currently fully read-only from the client's perspective. All manual data changes happen via Supabase's SQL Editor or Table Editor; automated writes happen only via the Edge Functions above.
- **Scheduling for the Edge Functions** — both are manual-trigger only today.
- **NZBN API integration** — second verification source for closure-check; once wired in, `brewery-sync` can upgrade from single-source `flagged_for_review` to real two-source auto-close. First candidate planned to actually exercise the dev/prod split for a backend/schema change specifically (the labels feature above tested the split for a frontend change).
- **Name search** — client-side filtering, planned as a dedicated `SearchBar.jsx` component.
- **Edge Functions running against the dev Supabase project** — currently both `brewery-sync` and `brewery-discover` only exist as deployments against production; there's no dev-environment version of either yet.
- **Full pin+label symbol-layer migration** — would resolve the one known limitation of the current brewery name labels (a label can still overlap a neighbouring pin, since pins and labels currently live in two separate, mutually-unaware rendering systems). Would require pre-rendered themed pin images per brewery/colour combination rather than the current live SVG/CSS `Marker` approach — a bigger job, deferred since it's a minor visual issue rather than a functional one.
