# craftbeer.kiwi - To-Do List

**Last updated:** 27 July 2026
**Purpose:** Single source of truth for what's outstanding on the project, so this doesn't only live in session memory. Update this whenever something here gets done, or something new gets added - same standing-instruction treatment as the other living docs (architecture.md, craftbeer-kiwi-automation-plan.md, retrospective.md).

Status key: 🔴 Blocked · 🟡 In progress / recommended, not started · ⚪ Not started · ✅ Done (kept briefly for context, remove once stale)

---

## Regressions

- 🟡 **Mobile popup header-obscuring bug has come back.** Fixed 17 July (forced `Popup anchor="bottom"`) and confirmed on real iPhone 19 July - but the 21 July theme-dropdown addition made the header taller, and the popup title now slides up under the header again on pin tap (confirmed via screenshots, 27 July). retrospective.md and this file previously marked it ✅ fixed; that needs correcting once this is re-actioned. Likely fix: base the popup/map-container offset on the header's actual current height (e.g. `ref.current.offsetHeight`, or a padding-top matching header height) rather than the value hardcoded before the dropdown existed. Needs a desktop session to view/edit `App.jsx`.

## Blocked

- 🔴 **Supabase secret-key 401 issue.** New-format `sb_secret_...` keys consistently return `401 INVALID_CREDENTIALS` against both deployed Edge Functions (`brewery-sync`, `brewery-discover`), confirmed via two independently generated keys and three test methods. Genuine platform-side issue, not a code problem. Next step: Andy to read Supabase's GitHub API-keys migration thread first, then raise a support ticket if unresolved. Blocks manual testing of `brewery-discover` specifically.
- 🔴 **craftbeer.kiwi domain not pointed at Vercel.** Discount Domains' unlock flow has a confirmed portal bug (no checkboxes shown on the "select services to unlock" page, reproduced in incognito). Next step: call Discount Domains support (+64 9 925 5553) to unlock manually. Once unlocked: add an A record at host `@` pointing to Vercel's current IP (reconfirm live value, was `216.198.79.1` as of 18 July). Deliberately not switching nameservers, since Andy plans to run email on the domain via Discount Domains.

## In progress / recommended, not yet actioned

- 🟡 **`brewery-discover` end-to-end test.** Written and deployed (20 July), but no confirmation yet it correctly finds/dedupes/inserts breweries — blocked by the Supabase key issue above. A `dryRun` safety flag (return what would be inserted without writing) was discussed as worth adding before the first real run, given it writes to the live `breweries` table - not yet implemented.
- 🟡 **Set up a second free Supabase project as a dev environment.** Recommendation from `docs/dev-prod-environments-discussion.md` (21 July): two free Supabase projects, local dev pointing at the dev one via `.env.local`, production unchanged. Suggested trigger: do this when there's an actual schema change to test (NZBN integration or description-generation columns are the likely first candidates), not speculatively now.
- 🟡 **Dive Bar / Hop Explosion theme visuals.** Theme-switching system is fully built and shipped (21 July) - Light/Dark work correctly, these two are structurally wired up but still on placeholder Mapbox style URLs. A search through Mapbox's community style gallery didn't converge (several styles had no "Add to Studio" option; one that worked was an unsuitable globe-projection style). Two paths for next time: (1) Mapbox's own Standard style with Monochrome/Faded themes - note this is architecturally different from the current classic `light-v11`/`dark-v11` styles and needs its own implementation; (2) build fully custom styles in Mapbox Studio from scratch.

## Not started

- ⚪ **Geolocation fallback bug.** Found 26 July: a visitor in Blenheim saw the user-location marker placed at the Wellington CBD fallback coordinates instead of their actual location. Suspect cause: `navigator.geolocation.getCurrentPosition` called without options, so the browser may be returning a cached position or silently hitting the permission-denied fallback. Fix: pass `{ enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }` as the options argument, and confirm the permission-denied path isn't being hit unexpectedly. Needs a desktop session to view/edit `App.jsx`.
- ⚪ **Zoom-dependent pin name labels.** Near-term idea: show brewery names as labels next to pins once zoomed in far enough, rather than only on click/tap.
- ⚪ **Mapbox GL symbol-layer / label-collision migration.** Longer-term: if pin name labels (above) or general marker density grows, migrate from the current plain marker approach to Mapbox GL's symbol-layer system, which handles label collision detection natively.
- ⚪ **NZBN API integration.** Second verification source for the closure-check logic - once wired in, `brewery-sync` can upgrade from single-source `flagged_for_review` writes to real two-source auto-close, per the automation plan's original design.
- ⚪ **Anthropic API description-generation step.** Auto-draft a 1-2 sentence description for newly-discovered breweries. Likely lands inside `brewery-discover` once its core discovery logic is proven working, but not decided for certain.
- ⚪ **Schedule the Edge Functions** (`pg_cron` or Supabase's built-in cron) - once each has a proven successful manual test run. Currently both are manual-trigger only.
- ⚪ **Favourites / brewery trail persistence without user accounts.** Design discussed 21 July: browser-generated `crypto.randomUUID()` in `localStorage`, a `trails` table keyed to that ID, a scheduled Edge Function deleting rows older than 7 days, and a separate public share-code (not the private device ID) for sharing a trail. Nothing built yet.
- ⚪ **Name search feature.** Client-side filtering of the in-memory breweries array by name (possibly address), applied before the supercluster index so results recluster correctly. Likely extracted as its own `SearchBar.jsx` component given `App.jsx`'s existing size. Region/suburb filter chips and geocoding/address search both explicitly deferred until there's a reason for them.
- ⚪ **Google Cloud API key IP restriction.** Currently the Places API key has no application (IP) restriction - deferred until the Edge Functions' egress IPs are known, since that's needed to set it correctly.
- ⚪ **Multi-country domain/branding strategy.** Deliberately parked - revisit only once Wellington is proven and national NZ coverage is actively underway, well before any Australia expansion is real.
- ⚪ **Basic usage instrumentation.** There's currently no analytics or usage tracking on craftbeer-kiwi.vercel.app - no visibility into whether the core loop (browse map, check in) is actually being used. Even a crude pageview/check-in count would give more signal than another round of visual polish.
- ⚪ **Distribution plan.** The domain isn't pointed at Vercel yet, and there's no plan for how Wellington beer drinkers would actually find the site. Worth deciding on at least a first, low-effort step (e.g. get the domain live and tell a handful of actual Wellington beer people about it).

---

## Recently done (context only - safe to trim once this feels stale)

- ✅ 2FA enabled on GitHub, Supabase, and Vercel accounts (25 July) - closed out after being flagged across several prior sessions.
- ✅ Garage Project Wild Workshop added as brewery entry #19 - data inserted and theme entry added, committed 25 July.
- ✅ `brewery-sync` closure-check logic - written, deployed, and tested 20 July (`checked:18, flagged:0, errors:[]`).
- ✅ Multi-site brand blind-spot section merged into the automation plan, alongside the `brewery-sync`/`brewery-discover` restructure (20 July).
- ✅ Theme-switching system built and shipped, replacing the old dark-mode toggle (21 July).
- ✅ Custom user-location marker with Andy's own hop-cone artwork, shipped 21 July.
- ✅ `concept-cron.md` and `concepts-index.md` created, starting a "concept snapshot" reference series (24 July).
- ✅ README.md brewery count corrected from 17 to 19 (27 July).
