# craftbeer.kiwi

An interactive directory and map of Wellington-region craft breweries, with plans for brewery-trail check-ins and gamified badges.

**Live site:** [craftbeer-kiwi.vercel.app](https://craftbeer-kiwi.vercel.app) (custom domain `craftbeer.kiwi` pending)

---

## What this is

craftbeer.kiwi is a personal side project — a functional brewery directory app and a hands-on way of learning the modern web stack (React, Supabase, Mapbox, Vercel) at the same time. Inspiration comes from established brewery-trail concepts overseas (e.g. the South Shore and Idaho Brewery Trails).

Current state: a live, deployed map showing 19 verified Wellington-region breweries, each with a custom-themed pin, marker clustering for dense areas (e.g. Upper Hutt's Brewtown, which hosts four separate breweries at one address), and a styled popup with brewery details.

Planned next: automated brewery discovery/closure detection, user check-ins, digital passports, and tiered rewards.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) |
| Mapping | Mapbox GL JS via `react-map-gl`, clustering via `supercluster` |
| Backend / database | Supabase (Postgres, Sydney region) |
| Hosting | Vercel (Hobby plan) |
| Source control | GitHub (`tolska-ops/craftbeer-kiwi`) |

See [`docs/architecture.md`](./docs/architecture.md) for how these pieces fit together.

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

- [`docs/architecture.md`](./docs/architecture.md) — how the pieces fit together, data flow
- [`docs/schema.md`](./docs/schema.md) — database schema reference *(to be written)*
- [`docs/decisions.md`](./docs/decisions.md) — key technical/product decisions and why
- [`docs/craftbeer-kiwi-automation-plan.md`](./docs/craftbeer-kiwi-automation-plan.md) — plan for automated brewery discovery and closure detection
- [`docs/retrospective.md`](./docs/retrospective.md) — project retrospective, session-by-session
- [`docs/todo.md`](./docs/todo.md) — outstanding work, single source of truth

## Status

MVP live and deployed. Actively adding features incrementally, roughly 5–8 hours/week.
