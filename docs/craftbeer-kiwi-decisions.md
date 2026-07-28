# craftbeer.kiwi — Decisions Log

A running record of significant technical and product decisions, why they were made, and what was ruled out. Add a new entry whenever a real decision gets made — doesn't need to be exhaustive, just enough that future-you (or anyone else) can see the reasoning without reconstructing it from memory.

Format: newest first. Each entry — what was decided, why, what else was considered.

---

## National expansion: region-by-region rollout, dry-run gate mandatory per region

**Decided (28 July):** Expansion beyond Wellington will proceed region by region — not nationally in one pass — with a `dryRun` review-and-triage step mandatory before any region's discovery results go live. Phase order: Auckland and Canterbury first, then Waikato/Bay of Plenty/Otago, then remaining regions batched together. Full plan in `craftbeer-kiwi-automation-plan.md`.

**Why:** `brewery-discover`'s first live run (27 July, Wellington) returned a roughly 50% false-positive rate — in a market Andy could personally sanity-check by eye. There's no reason for that error rate to be lower in an unfamiliar region, and no personal gut-check to catch it if it isn't.

**Ruled out:** Running discovery nationally in one pass once `dryRun` exists — would produce one very large, hard-to-triage batch spanning regions Andy doesn't know well.

**Dependency created:** Makes the `dryRun` flag a hard blocker on the whole rollout — see `craftbeer-kiwi-automation-plan.md`'s "what needs building next" list.

---

## Per-brewery theming rule extended to cover automated inserts

**Decided:** The existing "every brewery needs an explicit `getBreweryTheme` entry" rule now explicitly covers breweries added by `brewery-discover`, not just manual adds. Theming becomes part of the planned `dryRun` review step: no automated row goes live without a theme entry assigned as part of the same manual review that catches bars/pubs and duplicates. Until `dryRun` exists, any live automated run needs a manual follow-up pass to add theme entries for whatever landed.

**Why:** The original rule (below) was written with manual adds in mind, where touching the theme lookup is a natural part of adding a row. `brewery-discover`'s first live run (27 July) inserted 12 breweries with no equivalent checkpoint, so they went live untheme'd — confirming the rule as written had no step covering the automated path.

**Ruled out (for now):** Adding a neutral fallback colour in `getBreweryTheme` so untheme'd pins render as generically "unthemed" rather than defaulting to whatever colour currently happens when no entry matches. Not dismissed, just not decided — this would partially reverse the original "no fallback" rule and deserves its own deliberate call rather than a quick patch.

---

## `brewery-discover` false positives: keep-and-filter (`venue_type`), not delete

**Decided:** When `brewery-discover`'s first real run (27 July) returned 7 bars/pubs alongside genuine breweries, the fix was a new `venue_type` column (`'brewery'`/`'bar'`) plus a frontend query filter (`venue_type = 'brewery'`), rather than deleting the bar rows outright.

**Why:** Keeping the rows preserves an audit trail of what discovery actually found, and prevents the same bars being silently re-discovered and re-inserted on every future run, since their `place_id` now already exists in the table.

**Ruled out:** Hard-deleting the bar rows — matches the project's existing soft-delete philosophy, and would mean re-doing the same classification work every time discovery re-finds the same bars.

---

## Near-duplicate listings: `is_active = false`, not `venue_type`

**Decided:** Garage Project Aro Taproom — a near-duplicate row for a brewery already in the directory, surfaced by the same 27 July run — was suppressed via `is_active = false` rather than reclassified via `venue_type`.

**Why:** It's a genuine brewery-owned venue, not a bar — `venue_type = 'bar'` would misrepresent what it is. `is_active = false` correctly describes the actual problem: this row shouldn't display because it's a repeat of one already represented, not because it's the wrong kind of venue.

**Ruled out:** Deleting the row (loses the record of the near-duplicate) or leaving it active (would show a redundant pin for a brewery already on the map).

**Open problem, not resolved by this:** doesn't fix the underlying cause — Places assigning a different `place_id` to what's arguably the same brand's site — so this could recur on a future run and would again need a human to spot it.

---

## `dryRun` flag: still not built before `brewery-discover`'s first live run

**Decided (by circumstance more than deliberate choice):** the first real `brewery-discover` test (27 July) ran directly against the live `breweries` table. A `dryRun` safety flag was discussed as far back as 20 July as worth adding before any real run, but hadn't been built when the Supabase key issue resolved and the first successful test became possible.

**Why this matters going forward:** this run is now the concrete example of exactly the failure mode `dryRun` was meant to prevent. It remains a to-do, but with direct evidence attached — see the national expansion decision above, where it's promoted to a hard blocker.

## `venue_type` field: retain-and-flag, not delete, for non-brewery discoveries

**Decided:** When `brewery-discover` picks up a venue that isn't actually a brewery (a bar/pub that pours craft beer, or a general venue caught by a broad search), don't delete the row. Add a `venue_type` text field (default `'brewery'`), set it to `'bar'` for these cases, and filter the frontend map query on `venue_type = 'brewery'` in addition to the existing `is_active = true`.

**Why:** Two reasons. First, deleting the row would also delete its `place_id` from the table — since dedup only checks existing `place_id`s, the exact same bar would just get rediscovered as "new" on every future `brewery-discover` run, wasting API calls and requiring the same manual triage repeatedly. Retaining the row with a flag makes it permanently "known" without needing to reappear on the map. Second, Andy raised that a "pubs & bars serving craft beer" layer/filter is a plausible future feature — a string field (rather than a plain `is_brewery` boolean) leaves room to add more categories later (`bottle_shop`, `festival`, etc.) without another schema migration, and the excluded venues are already sitting there correctly labelled if that feature gets built.

**Ruled out:** Deleting non-brewery rows outright — simpler in the moment, but actively counterproductive given how dedup works. A plain boolean (`is_brewery`) — technically sufficient for today's two categories, but foreclosed the "pubs as their own thing" possibility Andy specifically flagged as being of interest down the track.

**Tested first in `craftbeer-kiwi-DEV`:** column added and frontend filter tested there before the equivalent change was made in production, consistent with the project's dev/prod workflow.

---

## Edge Function secret-key auth: named keys are required, not optional

**Decided (root cause, not really a "decision" — a bug fix):** `@supabase/server`'s secret-key auth mode must be written as `auth: "secret:<name>"`, where `<name>` matches the label given to the key in Supabase's dashboard (Settings → API Keys). Both `brewery-sync` and `brewery-discover` were originally written with just `auth: "secret"` — no name — which the SDK can't resolve to any actual key, so it correctly (if unhelpfully) rejected every request with a generic "invalid credentials" 401, regardless of which valid `sb_secret_...` key was sent.

**Why this took a week to find:** the error message ("Invalid credentials" / `INVALID_CREDENTIALS`) looked identical whether the problem was a wrong key, a missing header, or (the actual cause) a missing key-name in the auth config — there was no signal pointing specifically at the code's own auth mode being incomplete. Ruled out along the way, in order: the Supabase platform's separate legacy `verify_jwt` gateway check (already correctly disabled); sending the key in the wrong header (`Authorization` instead of `apikey` — a real, documented common mistake, but not what was happening here); a stale/rotated key mismatch (ruled out once a second, freshly-generated key produced the identical error). The actual fix was found by reading Supabase's own "Securing Edge Functions" documentation in full, specifically the table describing `@supabase/server`'s auth modes — it explicitly requires `'secret:<name>'`, not bare `'secret'`.

**Fix:** both functions changed to `auth: "secret:brewery_sync_v2"` (the name of the currently-active key) and redeployed. Confirmed working via the dashboard's test panel.

**Lesson for future Edge Functions:** always specify a named key in `auth: 'secret:<name>'` mode, never bare `'secret'` — and when troubleshooting a generic-looking 401 from `@supabase/server`, check the function's own `auth` configuration string itself before assuming the problem is external (wrong key, platform bug, expired credential).

---

## Documentation process: proactive tracking over ad-hoc updates


**Decided:** Formalised how the living docs (README, architecture, automation-plan, retrospective, decisions) get maintained: proactively prompt to update the relevant doc(s) whenever a session involves a schema change, architecture change, major feature, or significant decision — rather than waiting to be asked. Added alongside this: in-session mismatch flagging (raise it the moment something contradicts an uploaded doc, not just at the end), a "pending re-upload" log so a doc regenerated for download isn't wrongly assumed to have made it back into project knowledge, an end-of-session git status/unpushed-work check, and a prompt to regenerate any committed doc as a PDF for Andy's Dropbox folder.

**Why:** Doc drift had become a recurring, named pattern by 20 July (see `retrospective.md` block 7) — several sessions had discovered docs had fallen behind actual state, or that edits made in one place hadn't persisted to another. Treating doc maintenance as a tracked process rather than a one-off fix was judged worth the overhead.

**Ruled out:** Leaving it as an informal "update docs at the end if there's time" habit — this was the status quo that produced the drift in the first place (`architecture.md` sat unupdated from 11 July to 27 July as a direct result).

---

## Map theming: `themeId` + registry, not a dark-mode boolean

**Decided:** Replace the earlier `darkMode` boolean with a `themeId` string and a `THEMES` registry object (accent colour, header background/text, Mapbox `mapStyle` URL per theme), selected via a `<select>` dropdown in the header.

**Why:** A boolean only scales to two states. The product direction (playful, brand-driven map themes — Dive Bar, Hop Explosion — beyond just light/dark) needed an extensible structure from the start rather than a rewrite later.

**Trade-off accepted:** Two of the four themes (Dive Bar, Hop Explosion) shipped structurally complete but visually unfinished — placeholder Mapbox style URLs — because a suitable style wasn't found in Mapbox's community gallery. Judged better to ship the extensible structure now and finish the visuals in a dedicated session than to hold up the whole feature.

---

## Domain: A record, not nameserver switch

**Decided:** Point `craftbeer.kiwi` at Vercel via an A record at host `@`, not by switching nameservers to Vercel.

**Why:** Andy plans to set up email on the domain (e.g. `hello@craftbeer.kiwi`), managed through Discount Domains. Switching nameservers to Vercel would hand over DNS control entirely and complicate adding mail records (MX etc.) later.

**Ruled out:** Nameserver switch — simpler for pure hosting, but loses easy email setup.

**Implementation note (27 July):** the domain's nameservers turned out to already be pointed at Fastmail (a dormant setup from the original 2016 registration), not Discount Domains itself, which blocked adding the A record until resolved. Andy confirmed the unused Fastmail email setup could be broken to fix this — nameservers were switched back to Discount Domains' own, and the A record was added there as originally decided above. See `retrospective.md` block 11.

---

## Dev/prod environments: Option B, not Option C

**Decided:** Use two separate free-tier Supabase projects (dev + prod) with environment-based config (`.env.local` for dev, Vercel dashboard env vars for prod), rather than Supabase's native database branching.

**Why:** Branching is a paid-plan feature only (Pro plan, $25/month minimum, plus per-branch cost) — real recurring cost for a project that's currently $0 to run. It earns its keep with multiple contributors working in parallel; that's not the current situation. Two free Supabase projects gives the same core safety (test schema/Edge Function changes before they hit live data) at no cost.

**Ruled out:** Option A (status quo, rely on Git + backups) — no safety net for schema changes, which is the real growing risk as Edge Functions do more. Option C (native branching) — parked, not dismissed; revisit if the project ever gains a second contributor or a much faster release cadence. Option D (migration files on top of B) — the natural next step once manual dev/prod syncing starts to feel like real overhead, likely around the NZBN API integration.

**See:** `dev-prod-environments-discussion.md` for the full comparison.

**Implementation note (27 July):** built sooner than the original "wait for a real schema change" trigger — the domain going live plus Analytics tracking real visitors was judged reason enough on its own, since a bad schema change now risks affecting actual visitors, not just Andy's own testing. `craftbeer-kiwi-DEV` was created (Tokyo region — a minor, deliberate deviation from production's Sydney region), schema and RLS policy matched to production, seeded with fake test data, and verified working via `npm run dev` correctly reflecting only the dev project's data. Vercel's production environment variables were left untouched throughout. One near-miss during setup: the schema SQL was nearly run against production because the dashboard had defaulted back to that project — caught before anything wrote to the live table (the `create table` statement failed outright rather than partially succeeding), and positively confirmed via Table Editor that production was unaffected. See `retrospective.md` block 12 for the full account, including the lesson to double-check the project name in the breadcrumb before running SQL, not just before starting the session.

---

## Favourites/trails: anonymous device ID, not user accounts

**Decided:** No login system. Browser generates a random ID via `crypto.randomUUID()`, stored in `localStorage`; a `trails` table in Supabase keys off that ID, with a scheduled Edge Function deleting rows older than 7 days. Sharing a trail generates a separate public share-code rather than exposing the private device ID.

**Why:** Avoids handling any PII (no email/password) and avoids building an auth system for a feature that doesn't need identity, just persistence.

**Trade-off accepted:** This protects against casual exposure (nothing to breach, since there's no account) but not against someone who has the raw ID directly editing that data — it's obscurity via random string, not real authentication. Judged acceptable for a brewery trail list; would not be acceptable for anything sensitive.

---

## Edge Functions: `brewery-sync` and `brewery-discover` kept separate

**Decided:** Closure-check logic (`brewery-sync`) and discovery logic (`brewery-discover`) are two distinct Edge Functions, not one combined function.

**Why:** Different cost-tier exposure and different failure blast radius. A bug in discovery (which writes new rows) is a different risk profile from a bug in closure-checking (which flags/closes existing rows) — keeping them separate limits how much damage either can do on its own, and lets each be rate-limited, monitored, or paused independently.

---

## Closure detection: two-source agreement required before auto-close

**Decided:** `is_active` only flips to `false` automatically when **both** Google Places API and NZBN agree a brewery is closed. A single Places signal alone writes to `flagged_for_review` instead, for manual confirmation.

**Why:** Places API alone isn't reliable enough to trust for an irreversible-feeling change (even though `is_active` is soft-delete and reversible, wrongly hiding a live brewery is a bad user-facing failure). NZBN integration isn't built yet, so the safety rule is: no single-source auto-close until there's a second, independent source to corroborate.

**Note:** This rule was nearly lost in a doc/code mismatch — an earlier draft of the automation plan didn't state it clearly enough, and was corrected before the closure-check function was written, to keep the doc and the code consistent.

---

## Soft delete over hard delete

**Decided:** Breweries are marked inactive via an `is_active` boolean, never actually deleted from the table.

**Why:** Reversibility. A brewery flagged closed in error (or one that reopens) can be flipped back with a single update — a hard delete would need a full re-add, including re-verifying `website`, `place_id`, coordinates, and theming.

---

## Every brewery needs a `website` field and an explicit theme

**Decided:** Two standing data-quality rules: (1) `website` must never be null — check and populate on every manual add, enforce in future automation; (2) every brewery must have an explicit entry in `getBreweryTheme`, reflecting its own branding — never falls back to default orange.

**Why:** Both were found as real gaps during a 17 July audit (7 breweries had null `website`) — codifying them as rules stops the same gap reopening as new breweries get added, manually or via automation.

---

## Temporary closures are a manual-entry feature, not automatable

**Decided:** `status` / `status_note` fields (grey pin + badge + popup note) handle temporary closures, kept distinct from `is_active` (permanently gone) and `flagged_for_review` (source disagreement). Temporary closures are entered manually, not auto-detected.

**Why:** A brewery's own website won't reliably announce a temporary closure (confirmed by the Emporium Brewing/Kaikōura flood case) — there's no automatable signal to detect "closed for now" versus "closed for good," so it has to stay a manual call.

---

## Discovery misses multi-site brands — regional tourism pages fill the gap

**Finding, not yet a fix:** Name-based discovery (Places API, excise list, Brewers Guild) treats multiple venues under one brand name as duplicates, so a second site for an existing brand gets silently skipped. Regional tourism board pages surface multi-site brands more reliably than name-matching does.

**Prompted by:** Garage Project Wild Workshop being missed by discovery despite Garage Project itself already being in the directory.

**Status:** Documented as a known blind spot in the automation plan; not yet built into the discovery function.
