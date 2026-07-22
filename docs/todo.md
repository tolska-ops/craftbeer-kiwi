# craftbeer.kiwi - To-Do List

**Last updated:** 22 July 2026
**Purpose:** Single source of truth for what's outstanding on the project, so this doesn't only live in session memory. Update this whenever something here gets done, or something new gets added - same standing-instruction treatment as the other living docs (architecture.md, craftbeer-kiwi-automation-plan.md, retrospective.md).

Status key: 🔴 Blocked · 🟡 In progress / recommended, not started · ⚪ Not started · ✅ Done (kept briefly for context, remove once stale)

---

## Blocked

- 🔴 **Supabase secret-key 401 issue.** New-format `sb_secret_...` keys consistently return `401 INVALID_CREDENTIALS` against both deployed Edge Functions (`brewery-sync`, `brewery-discover`), confirmed via two independently generated keys and three test methods. Genuine platform-side issue, not a code problem. Next step: Andy to read Supabase's GitHub API-keys migration thread first, then raise a support ticket if unresolved. Blocks manual testing of `brewery-discover` specifically.
- 🔴 **craftbeer.kiwi domain not pointed at Vercel.** Discount Domains' unlock flow has a confirmed portal bug (no checkboxes shown on the "select services to unlock" page, reproduced in incognito). Next step: call Discount Domains support (+64 9 925 5553) to unlock manually. Once unlocked: add an A record at host `@` pointing to Vercel's current IP (reconfirm live value, was `216.198.79.1` as of 18 July). Deliberately not switching nameservers, since Andy plans to run email on the domain via Discount Domains.

## In progress / recommended, not yet actioned

- 🟡 **`brewery-discover` end-to-end test.** Written and deployed (20 July), but no confirmation yet it correctly finds/dedupes/inserts breweries — blocked by the Supabase key issue above. A `dryRun` safety flag (return what would be inserted without writing) was discussed as worth adding before the first real run, given it writes to the live `breweries` table - not yet implemented.
- 🟡 **Set up a second free Supabase project as a dev environment.** Recommendation from `docs/dev-prod-environments-discussion.md` (21 July): two free Supabase projects, local dev pointing at the dev one via `.env.local`, production unchanged (Option B, confirmed over native branching — see `decisions.md`). **Parked 22 July, revisit Monday or Tuesday next week.** Suggested trigger to actually build it: do this when there's an actual schema change to test (NZBN integration, description-generation columns, or the new `venue_type` column below are all candidates), not speculatively now.
- 🟡 **Dive Bar / Hop Explosion theme visuals.** Theme-switching system is fully built and shipped (21 July) - Light/Dark work correctly, these two are structurally wired up but still on placeholder Mapbox style URLs. A search through Mapbox's community style gallery didn't converge (several styles had no "Add to Studio" option; one that worked was an unsuitable globe-projection style). Two paths for next time: (1) Mapbox's own Standard style with Monochrome/Faded themes - note this is architecturally different from the current classic `light-v11`/`dark-v11` styles and needs its own implementation; (2) build fully custom styles in Mapbox Studio from scratch.

## Not started

- ⚪ **Add pubs as a venue type (scoped 22 July, not built).** Goal: choose to view breweries, pubs, or both on the map. Scope:
  1. **Schema:** add `venue_type` column to `breweries` table (`'brewery'` / `'pub'`, default `'brewery'` — no backfill needed for existing rows). One table, not a split, since pubs share nearly every field with breweries.
  2. **Map filter:** two independent toggle chips ("Breweries" / "Pubs"), both on by default, filtering the in-memory array by `venue_type` before it hits supercluster — build alongside the name-search feature below since both touch the same filtering logic.
  3. **Pin theming:** pubs need their own distinct pin icon (not a brewery pin with different text), per the existing per-brewery theming rule.
  4. **Copy pass:** check UI text/popups/headers for "brewery" wording that would read wrong on a pub entry.
  5. **Automation scope:** pubs start as manual-entry only — `brewery-sync`/`brewery-discover` are brewery-specific by design (Places keyword matching on "brew") and extending them to pubs is separate future work, not a side effect of this change.
  6. **Test data:** once the column exists, add 2 real Wellington pubs as test rows (website populated, explicit theme — same rules as breweries). SQL insert to be drafted once pubs are chosen.
- ⚪ **2FA on GitHub, Supabase, and Vercel accounts.** Flagged repeatedly across multiple sessions without being actioned - genuinely small task, worth just doing.
- ⚪ **Add Garage Project Wild Workshop as brewery entry #19.** 7 Furness Lane, Te Aro, Wellington 6011; website garageproject.co.nz. Distinct barrel-ageing/mixed-fermentation taproom, separate from the existing Aro Street and Leeds Street Garage Project sites. Still need: `place_id` and lat/long before inserting. Draft SQL prepared in an earlier session.
- ⚪ **NZBN API integration.** Second verification source for the closure-check logic - once wired in, `brewery-sync` can upgrade from single-source `flagged_for_review` writes to real two-source auto-close, per the automation plan's original design.
- ⚪ **Anthropic API description-generation step.** Auto-draft a 1-2 sentence description for newly-discovered breweries. Likely lands inside `brewery-discover` once its core discovery logic is proven working, but not decided for certain.
- ⚪ **Schedule the Edge Functions** (`pg_cron` or Supabase's built-in cron) - once each has a proven successful manual test run. Currently both are manual-trigger only.
- ⚪ **Favourites / brewery trail persistence without user accounts.** Design discussed 21 July: browser-generated `crypto.randomUUID()` in `localStorage`, a `trails` table keyed to that ID, a scheduled Edge Function deleting rows older than 7 days, and a separate public share-code (not the private device ID) for sharing a trail. Nothing built yet.
- ⚪ **Name search feature.** Client-side filtering of the in-memory breweries array by name (possibly address), applied before the supercluster index so results recluster correctly. Likely extracted as its own `SearchBar.jsx` component given `App.jsx`'s existing size. Region/suburb filter chips and geocoding/address search both explicitly deferred until there's a reason for them.
- ⚪ **Google Cloud API key IP restriction.** Currently the Places API key has no application (IP) restriction - deferred until the Edge Functions' egress IPs are known, since that's needed to set it correctly.
- ⚪ **Multi-country domain/branding strategy.** Deliberately parked - revisit only once Wellington is proven and national NZ coverage is actively underway, well before any Australia expansion is real.
- ⚪ **README references `docs/schema.md`, which doesn't exist.** Found 22 July while chasing an .md sync issue — `docs/schema.md` and `docs/decisions.md` were referenced in the README's file structure but never actually created. `decisions.md` has now been written (see below); `schema.md` was deliberately parked. Fix: either write `schema.md` too, or edit the README so it stops promising a file that isn't there.

---

## Recently done (context only - safe to trim once this feels stale)

- ✅ `decisions.md` drafted (22 July) — ADR-style log of key technical/product decisions made so far (two-source-agreement rule, Option B for dev/prod, soft-delete, Edge Function separation, etc.). Needs saving to `docs/decisions.md` and pushing.
- ✅ Full mobile popup bug triage (header obscuring, tap-to-close, long-name overlap) - all three found 17 July, fixed and confirmed on real iPhone hardware 19 July.
- ✅ `brewery-sync` closure-check logic - written, deployed, and tested 20 July (`checked:18, flagged:0, errors:[]`).
- ✅ Multi-site brand blind-spot section merged into the automation plan, alongside the `brewery-sync`/`brewery-discover` restructure (20 July).
- ✅ Website field audit - all 18 breweries confirmed to have a populated `website` field (17 July).
- ✅ Theme-switching system built and shipped, replacing the old dark-mode toggle (21 July).
- ✅ Custom user-location marker with Andy's own hop-cone artwork, shipped 21 July.
- ✅ Map-not-filling-browser bug found and fixed (leftover `#root` width cap from the original template) - 21 July.
