# craftbeer.kiwi

**Last updated:** 29 July 2026
**Note:** This is the single source of truth for the current brewery count and live status — other docs (todo.md, automation-plan.md, retrospective.md) should reference this file rather than restate the count.

An interactive directory and map of Wellington-region craft breweries, with plans for brewery-trail check-ins and gamified badges.

**Live site:** [craftbeer.kiwi](https://craftbeer.kiwi) (also reachable via [craftbeer-kiwi.vercel.app](https://craftbeer-kiwi.vercel.app))

---

## What this is

craftbeer.kiwi is a personal side project — a functional brewery directory app and a hands-on way of learning the modern web stack (React, Supabase, Mapbox, Vercel) at the same time. Inspiration comes from established brewery-trail concepts overseas (e.g. the South Shore and Idaho Brewery Trails).

Current state: a live, deployed map showing 23 verified Wellington-region breweries, each with a custom-themed pin, marker clustering for dense areas (e.g. Upper Hutt's Brewtown, which hosts four separate breweries at one address), and a styled popup with brewery details.

Planned next: automated brewery discovery/closure detection, user check-ins, digital passports, and tiered rewards.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) |
| Mapping | Mapbox GL JS via `react-map-gl`, clustering via `supercluster` |
| Backend / database | Supabase (Postgres, Sydney region) |
| Hosting | Vercel (Hobby plan) |
| Source control | GitHub (`tolska-ops/craftbeer-kiwi`) |

See `craftbeer-kiwi-architecture.md` for how these pieces fit together.

## Running locally

```powershell
git clone https://github.com/tolska-ops/craftbeer-kiwi.git
cd craftbeer-kiwi
npm install
```

Create a `.env.local` file in the project root with:

```
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-publishable-key
VITE_MAPBOX_TOKEN=your-mapbox-public-token
```

(Never commit this file — it's already covered by `.gitignore` via the `*.local` pattern.)

Then:

```powershell
npm run dev
```

Visit `http://localhost:5173`.

## Deployment

Connected to Vercel via GitHub — pushing to `main` triggers an automatic redeploy. Environment variables are configured separately in the Vercel dashboard (Project Settings → Environment Variables) and must be kept in sync manually with `.env.local` if they change.

## Documentation

All craftbeer-kiwi-*.md files live together in one folder (`C:\craftbeer-kiwi\docs` locally; mirrored in project knowledge) — no nested subfolders.

- `craftbeer-kiwi-architecture.md` — how the pieces fit together, data flow
- `craftbeer-kiwi-decisions.md` — key technical/product decisions and why (canonical record for anything logged with a DEC-XXX ID)
- `craftbeer-kiwi-automation-plan.md` — plan and current status for automated brewery discovery and closure detection
- `craftbeer-kiwi-retrospective.md` — project retrospective, session-by-session
- `craftbeer-kiwi-todo.md` — outstanding work, single source of truth for what's left to do
- `craftbeer-kiwi-security.md` — security audit log and standing checklist
- `craftbeer-kiwi-concept-*.md` — one-page reference explainers on specific concepts (cron, Google Places, etc.), indexed in `craftbeer-kiwi-concepts-index.md`

## Status

MVP live and deployed. Actively adding features incrementally, roughly 5–8 hours/week.
