# Architecture Overview

**Last updated:** 27 July 2026

## Summary

craftbeer.kiwi is a client-rendered React app that fetches brewery data from Supabase and plots it on a Mapbox map. There's no custom backend server for the frontend's own use — Supabase's auto-generated REST API is the read path, and Vercel hosts the static built frontend. Supabase Edge Functions provide a second, separate write path: scheduled/manually-triggered server-side automation that checks for closed breweries and discovers new ones. The site is now live at its own domain, with basic visitor analytics, and there's a separate dev-only Supabase project so schema/Edge Function changes can be tested without touching production data.

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
       │  map tiles / geocoding
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
- **Map theme-switching system** (shipped 21 July): replaces the earlier dark-mode boolean. A `themeId` string plus a `THEMES` registry (accent/headerBg/headerText/mapStyle per theme) drives a `<select>` dropdown in the header. Light and Dark themes are live with real Mapbox style URLs (`light-v11`/`dark-v11`). Dive Bar and Hop Explosion are structurally wired up but still point at placeholder `mapStyle` URLs — visual identity for these two is a deferred, separate to-do.
- **Environment indicator badge** (added 27 July): a small red "DEV" badge renders in the header, next to the theme dropdown, whenever the app is running against a non-production environment. Driven by a single constant — `const APP_ENV = import.meta.env.VITE_APP_ENV || 'production'` — read from a new `VITE_APP_ENV` variable. Local `.env.local` sets this to `development`; Vercel's production environment variables don't set it at all, so it correctly defaults to `'production'` and the badge never renders on the live site. Added specifically to prevent the kind of mix-up that nearly caused a schema change to run against the wrong project (see `craftbeer-kiwi-retrospective.md`, block 12).
- **User location**: `GeolocateControl` plus a custom user-location marker using Andy's own hop-cone SVG artwork (replacing an earlier Claude-drawn approximation). Fly-to animation on pin click. A known bug (found 26 July, not yet fixed): the geolocation fallback can place the marker at a hardcoded Wellington CBD coordinate instead of the visitor's real position, likely because `getCurrentPosition` is called without options and is returning a cached or permission-denied result.
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
- **Outstanding platform issue:** newly generated `sb_secret_...` keys consistently return `401 INVALID_CREDENTIALS` against both deployed Edge Functions, confirmed across two independently generated keys and three test methods (PowerShell, curl, dashboard test panel). Confirmed as a genuine Supabase platform-side issue, not a code problem — blocks manual testing of `brewery-discover` specifically. This is a production-project-specific instance of a platform-level issue; the separate dev project below is unaffected but offers no workaround for it, since it's not project-specific. See `craftbeer-kiwi-todo.md`.

### Backend — Supabase (dev)

Added 27 July, as a genuinely separate Supabase project rather than a branch of production (see `craftbeer-kiwi-decisions.md` for why branching was ruled out).

- **`craftbeer-kiwi-DEV`** — a second, free-tier Supabase project. Hosted in Supabase's Tokyo region rather than production's Sydney region — a deliberate, low-stakes deviation, not worth blocking on.
- Schema mirrors production: `breweries` and `check_ins` tables, same columns/types, same RLS setup (enabled on both tables, public read-only `select` policy on `breweries`).
- Seeded with 3 fake test breweries (not real data), including one deliberately `is_active = false`, so the `is_active` filter can be exercised locally without touching real brewery records.
- **Only connected via local `.env.local`** — `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` point here when running `npm run dev` locally. Vercel's dashboard environment variables are untouched and continue to point at the production project, so production deploys are entirely unaffected by whatever's happening in dev.
- **Purpose:** lets schema changes and Edge Function updates get tested against throwaway data before they touch the live `breweries` table — the intended first real use is the NZBN API integration.
- **Known constraints:** this uses the second of Andy's two free-tier Supabase project slots (the free plan allows two). Free-tier projects also auto-pause after roughly a week of inactivity and need a manual "wake" (usually just opening the dashboard) if left untouched between sessions.

### Automation infrastructure — Edge Functions

Two Supabase Edge Functions, deliberately kept as separate deployments rather than one combined function, for cost-tier isolation and failure blast-radius reasons (see `craftbeer-kiwi-decisions.md`). Both currently run against the **production** Supabase project only — neither has been pointed at or tested against the dev project yet.

- **`brewery-sync`** (closure-check) — written using the `withSupabase`/`@supabase/server` auth pattern (a mid-project Supabase platform change that superseded the automation plan's original manual-client approach). Deployed and successfully tested end-to-end (`{"checked":18,"flagged":0,"errors":[]}`). Implements the two-source-agreement safety rule: `is_active` only auto-flips to `false` when both Google Places API and NZBN agree a brewery is closed; a single Places signal alone writes to `flagged_for_review` instead. NZBN isn't wired in yet, so today this effectively means every closure signal is flagged for manual review, not auto-closed.
- **`brewery-discover`** (discovery) — written and deployed, but not yet successfully tested end-to-end due to the `sb_secret_...` key issue above. No confirmation yet that it correctly finds, dedupes, and inserts new breweries. A `dryRun` safety flag (return what would be inserted without writing to the live table) was discussed and is worth adding before the first real run, given it writes directly to the live `breweries` table.
- Both functions are currently **manual-trigger only** — scheduling (`pg_cron` or Supabase's built-in cron) is planned once each has a proven successful manual run.
- **Known blind spot:** name-based discovery (this function, plus the Places API and excise-list cross-checks) treats multiple venues under one brand as duplicates, so a second site for an existing brand can be silently skipped. Regional tourism board pages surface multi-site brands more reliably. Found via Garage Project Wild Workshop being missed despite Garage Project already being in the directory — see `craftbeer-kiwi-decisions.md`.

### Mapping — Mapbox

- `react-map-gl` (React wrapper around Mapbox GL JS) renders the map itself.
- Base style is now theme-dependent (see theme-switching above): `light-v11` for Light, `dark-v11` for Dark. Dive Bar and Hop Explosion are on placeholder styles pending a decision between Mapbox's Standard style (built-in Monochrome/Faded presets — architecturally different from the classic styles above, would need its own implementation) versus fully custom Mapbox Studio styles.
- Access via a public Mapbox token (`pk.…`), safe to expose in frontend code by design — Mapbox tokens are scoped/rate-limited, not secret credentials.

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
2. React mounts, `useEffect` fires a fetch to Supabase's REST API for all rows in `breweries` where `is_active = true`.
3. Supabase checks the request against the `breweries` table's RLS policy, returns matching rows (subject to the publishable key's permissions).
4. Frontend builds a `supercluster` index from the returned coordinates.
5. Map renders; clusters/pins recalculated on every pan/zoom based on current viewport bounds.
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
- **NZBN API integration** — second verification source for closure-check; once wired in, `brewery-sync` can upgrade from single-source `flagged_for_review` to real two-source auto-close. First candidate planned to actually exercise the new dev/prod split.
- **Name search** — client-side filtering, planned as a dedicated `SearchBar.jsx` component.
- **Edge Functions running against the dev Supabase project** — currently both `brewery-sync` and `brewery-discover` only exist as deployments against production; there's no dev-environment version of either yet, so testing changes to them still means editing and redeploying against production directly (carefully) rather than a true dev-first workflow.
