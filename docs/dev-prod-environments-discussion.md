# craftbeer.kiwi - Development & Production Environments

**Written:** 21 July 2026
**Purpose:** A discussion document, not a decision record - lays out the realistic options for separating development work from the live production site, with pros/cons and a recommendation, so a considered choice can be made rather than defaulting into whatever's easiest right now.

## The problem this solves

Right now, there is effectively **one environment**: local code talks directly to the live Supabase database, and pushing to `main` deploys straight to the live site. This has worked fine at the current scale (18 breweries, no real users depending on uptime yet), but it has two real risks as the project grows:

- **No safety net for schema changes.** Today's session added new Edge Functions and could just as easily have included an `alter table` that broke something - there'd be no way to test that against real-shaped data without touching the actual live table.
- **No safety net for frontend changes.** A broken deploy currently means the live site is broken until it's fixed and pushed again - there's no "try it somewhere first" step.

This matters more once: the Edge Functions are scheduled and unattended (a bad deploy could silently corrupt data on a timer, not just visibly break the UI), or the site has actual visitors who'd notice downtime.

## What "recoverable" actually requires

Before comparing options, worth being specific about what "controlled and recoverable" means in practice for this project:

1. A way to test a code or schema change **before** it reaches the live database or live site
2. A way to **roll back** quickly if something does go wrong in production
3. Low enough overhead that it doesn't become its own maintenance burden for a 5-8 hrs/week side project

## Options

### Option A - Do nothing differently, rely on Git history and backups

Keep the current single-environment setup. Recoverability comes entirely from `git revert` (for code) and the existing FreeFileSync backup (for local files) - there's no live rollback path for database changes beyond manually undoing an `alter table` or restoring from a Supabase backup if one exists.

**Pros:**
- Zero additional setup or ongoing cost
- Nothing new to learn or maintain
- Fine for changes that are genuinely low-risk (copy tweaks, CSS, most frontend features)

**Cons:**
- No way to test schema changes before they hit production data
- A bad Edge Function deploy runs against real data immediately
- Supabase's free tier's backup/point-in-time-recovery options are limited compared to paid tiers - worth confirming exactly what's available before leaning on this as a safety net (see "Open questions" below)

**Best fit for:** frontend-only changes with no schema impact. Not a real answer for the automation work (Edge Functions writing to the live table) that's now a growing part of the project.

### Option B - Two separate Supabase projects (dev + prod), single Vercel project with environment-based config

Create a second, free-tier Supabase project (`craftbeer-kiwi-dev` or similar) as a genuine copy of the schema, seeded with a handful of test breweries rather than real data. Local development points at this dev project via `.env.local`; Vercel's production deployment points at the real project via its dashboard-set environment variables (already the pattern in use for `VITE_SUPABASE_URL` etc.).

Confirmed via research just now: Supabase's Free plan allows **two active projects** at no cost, so this option has **no extra hosting cost** - though each free project auto-pauses after a week of inactivity, so the dev project would need an occasional manual "wake up" if it goes quiet for a stretch (a `git log`-triggered reminder, or just checking before a session, both work fine at this scale).

**Pros:**
- Genuinely free at current scale
- Schema changes, Edge Function changes, and seed-data experiments can all be tried safely before touching production
- Conceptually simple - "two of the same thing," not a new mental model
- Matches Vercel's existing environment-variable pattern already in place

**Cons:**
- Schema changes need to be applied twice (dev, then prod) - manually, unless a migration workflow is added (see Option D below for where this naturally leads later)
- Two Supabase dashboards to keep track of - easy to accidentally look at the wrong one
- Dev data can drift from prod's actual shape over time if not kept intentionally similar
- The free-tier auto-pause is a minor but real friction point

**Best fit for:** this project, right now. Genuinely free, meaningfully safer than Option A, and doesn't require learning a new tool or workflow beyond "two projects instead of one."

### Option C - Supabase's native branching feature

Supabase offers database branching tied to Git branches - push a feature branch, get an ephemeral copy of the database automatically, merge to `main`, branch tears down. This is the more "grown-up" version of Option B, with less manual duplication.

Confirmed via research: **branching is a paid-plan feature only** (Pro plan, $25/month minimum, plus roughly $0.30-0.32 per branch per day on top while a branch is active). Not available on the Free plan at all.

**Pros:**
- Automatic, no manual "keep two projects in sync" effort
- Branches are ephemeral - don't pile up as forgotten dev projects over time
- The more standard/expected approach at larger team scale

**Cons:**
- Real, recurring cost for a project that's currently $0 to run - the $25/month Pro plan minimum is a meaningful jump for a hobby project, before even counting per-branch charges
- Overkill for a solo developer doing a handful of sessions a week - this pattern earns its keep with multiple contributors working in parallel, which isn't the current situation

**Best fit for:** a later stage, if/when this project has multiple contributors or ships changes frequently enough that manual dev/prod syncing (Option B) becomes a genuine bottleneck rather than a minor inconvenience. Not justified by current usage.

### Option D - Add a lightweight migrations workflow on top of Option B

Rather than manually re-running SQL in two dashboards, track schema changes as numbered migration files in the repo (a `supabase/migrations/` folder - Supabase's CLI already supports this natively) and apply them to each environment with a command rather than by hand.

**Pros:**
- Removes the main weakness of Option B (manual double-application, drift risk)
- Schema history becomes part of Git history - a real audit trail of every `alter table` ever run, which the automation plan doc has been reconstructing by hand from memory so far
- Still free, still uses tooling already installed (`supabase` CLI)
- A natural stepping-stone toward Option C later, if it's ever needed - the migration files transfer directly

**Cons:**
- A genuinely new habit to build (writing a migration file instead of pasting SQL into the dashboard) - worth being honest that this has a real learning curve, even if each individual migration is simple
- Slightly more ceremony for very small schema tweaks

**Best fit for:** adopting once Option B's manual-sync friction starts to actually bite - not necessarily needed on day one, but worth knowing this is the natural next step rather than jumping straight to paid branching.

## Recommendation

**Start with Option B now** (two free Supabase projects, environment-based config) - it directly addresses the real risk (untested schema/Edge Function changes hitting live data) at zero cost and minimal new process. **Adopt Option D** (migration files) once manually keeping dev and prod schemas in sync starts to feel like real overhead, which will likely coincide naturally with the NZBN API integration or description-generation work, both of which will add new columns. **Option C stays parked** unless the project ever grows a second contributor or a much faster release cadence - not worth the $25/month baseline before then.

## Open questions to resolve before implementing

- **What does Supabase's Free tier actually offer for point-in-time recovery / backups on the production project?** This matters regardless of which option above gets picked - a dev environment protects against *testing* mistakes, but doesn't replace knowing what happens if production data is corrupted by something that *did* pass dev testing. Worth checking the current Supabase dashboard for `ihcvoqapgcdnoggegrcl` directly (Settings → Database → Backups) rather than assuming.
- **Vercel side:** Preview Deployments (automatic on every PR/branch push) already exist as a Vercel feature and cost nothing extra on the Hobby plan - worth confirming this is already effectively "free frontend staging," separate from the Supabase-side decision above, and just needs pointing at the new dev Supabase project's credentials to be a complete solution.
- **How much dev-project setup is worth doing up front** vs building it out only as specific upcoming work (NZBN integration, description generation) needs a safe place to test? Recommend the latter - set up the dev Supabase project when there's an actual schema change to test against it, not speculatively now.
