# craftbeer.kiwi — Decisions Log

A running record of significant technical and product decisions, why they were made, and what was ruled out. Add a new entry whenever a real decision gets made — doesn't need to be exhaustive, just enough that future-you (or anyone else) can see the reasoning without reconstructing it from memory.

Format: newest first. Each entry — what was decided, why, what else was considered.

Each entry has a unique ID (`DEC-001`, `DEC-002`, ...), assigned in chronological order — the oldest decision is `DEC-001`, regardless of where it sits in the newest-first list below. New entries get the next unused number when added, so IDs stay stable references even as the file grows.

---

## Google Places data: signal only, not source of record — coordinates/name/address to be independently sourced

**ID:** `DEC-033`

**Decided (31 July):** Google Places API content (beyond `place_id`) will no longer be treated as craftbeer.kiwi's source of record for displayed brewery data. Two specific terms drove this:
- Google's Maps Platform terms prohibit using Places content in conjunction with a non-Google map (craftbeer.kiwi uses Mapbox) — this applies regardless of how the content is obtained.
- Places' own caching exceptions only cover `place_id` (indefinite) and lat/long (30 days); everything else, including name and address, has no long-term storage allowance.

Going forward: `place_id` continues to be stored indefinitely and used for status lookups (`brewery-sync`) and dedup matching (`brewery-discover`), unchanged. Coordinates, name, and address for anything *displayed* on the map will be sourced independently — e.g. manual verification/geocoding at add-time, the same pattern already used for `description` (`DEC-030`) — rather than taken directly from a Places response and stored long-term.

**Why:** Flagged during a copyright/licensing review (31 July) — not a copyright issue as such (facts aren't copyrightable), but a real contractual risk: API key suspension if Google's automated enforcement ever flags the project. The fix also happens to match the project's existing "verify, don't trust a single source" pattern (`DEC-005`), so it's a natural extension rather than a new discipline.

**Scope not yet resolved:** exactly how re-sourcing works in practice (which geocoder, how the manual-add workflow changes, whether existing seed data needs re-verifying) is deliberately left open here — tracked as `TD-045`, not designed in this entry.

**Retroactive check completed (31 July):** built `scripts/check-geocode-drift.mjs` — read-only, re-geocodes each row's stored `address` via Mapbox and flags any row where the result disagrees with the stored `latitude`/`longitude` by more than 250m, or where Mapbox can't match the address at all. Run against `craftbeer-kiwi-DEV` first (correctly flagged all 4 fake test rows, whose placeholder addresses and coordinates were never meant to correspond — confirmed the script works before trusting it against real data), then against production: **31/31 rows checked, 0 flagged, 0 errors** — every existing brewery and bar's coordinates are already within tolerance of an independent source. The existing 23-brewery seed data did not need correcting; going forward, only the *sourcing method* changes (`brewery-discover`'s insert path, the manual-add workflow), not the historical data itself.

**`brewery-discover` re-sourcing shipped and verified (31 July):** `brewery-discover`'s insert path now geocodes each Places candidate's address via Mapbox and stores Mapbox's own address/coordinates, not Google's — `place_id` keeps its existing role as a dedup/status-lookup key only, which the caching exceptions permit indefinitely. `name` and `website` remain Places-sourced (treated as low-risk facts, and every candidate is still gated behind `flagged_for_review = true` / `is_published = false` until manually triaged, so an incorrect one is caught there regardless). Same change also fixed a separate pre-existing gap where the insert never set `is_published`/`has_theme`, which would have failed the `theme_required_to_publish` check constraint (`DEC-019`) on the next live run.

Deployed and dry-run tested against both `craftbeer-kiwi-DEV` (20 candidates found, 0 errors, all correctly Mapbox-geocoded) and production (20 candidates found, **18 correctly skipped via existing `place_id` dedup**, 2 genuine new candidates found with clean Mapbox-derived data). Confirms both the geocoding fix and the dedup logic work correctly against real data. No live run performed yet — this was dry-run verification only; an actual live insert remains a normal future use of the (now-fixed) function, not outstanding design work.

Also surfaced in production dry-run results: `Garage Project Wild Workshop`'s `place_id` was already present in the `breweries` table (`is_published: true`) — confirms dedup correctly recognized it as an existing row (added 25 July, already accurately reflected in `todo.md`'s "Recently done" log — no doc correction needed here).

**Copyright/ToS risk: closed.** Google Places content used by craftbeer.kiwi is now limited to `place_id` (used only for dedup and status lookups, which Google's caching exceptions permit indefinitely) plus `name`/`website` (treated as low-risk factual metadata, gated behind manual review before ever being published). All displayed coordinates and addresses — both the existing 23-brewery dataset and everything `brewery-discover` inserts going forward — are independently sourced via Mapbox, not stored Google output. The original concern (Places content displayed on a non-Google map, coordinates cached indefinitely past the 30-day allowance) no longer applies to any current or future data path.

**Ruled out (for now):** Switching the map itself to Google Maps JS — would fully resolve the license question but throws away the existing Mapbox/supercluster/theming build for a risk judged lower-probability than the rebuild cost. Doing nothing and monitoring — rejected as a standing position (though acceptable as a short-term stance) since it leaves a known contract breach undocumented and unaddressed indefinitely.

---

## Ongoing automation output: exceptions-only, not full reports

**ID:** `DEC-032`

**Decided (31 July):** Once initial buildout (national coverage, schema, core features) is done, recurring/scheduled automated checks should surface only exceptions — rows that are new, flagged, or changed and need a human look — rather than a full report or bulk dump on every run. Applies to `brewery-sync` (closure detection), the planned data-drift monitoring (`concept-data-drift.md`), and any future recurring check (re-running `brewery-discover` post-rollout, periodic NZBN re-verification).

**Why:** As the directory scales toward national coverage, a scheduled job that reports "checked 200, 197 unchanged, 3 flagged" every run is worse than one that reports the 3 — the noise buries the thing that actually needs attention, and it's the opposite of what makes unattended scheduling safe. This formalises the pattern `brewery-sync`'s `flagged_for_review` output already follows by design (`DEC-005`) into an explicit standing principle for every future automated check, rather than something that happens to be true of the first one built.

**What this looks like in practice:** a scheduled run's output/log should default to "what changed since last run," with full/verbose output available on demand (e.g. a manual parameter) rather than as the default. Doesn't change the two-source-agreement gate on auto-closing a brewery (`DEC-005`) — this is about what the *output* looks like, not what automation is allowed to act on unattended.

**Ruled out:** Leaving report format undecided per-feature and deciding it fresh each time a new check gets built — risked each one defaulting to a full dump simply because that's the easier first thing to write, the same way `brewery-discover`'s dry-run-by-default gap (`DEC-024`) sat unfixed until specifically audited.

---

## `parent_brewery_id` added — structural link between multi-site brand rows

**ID:** `DEC-031`

**Decided:** Added `parent_brewery_id` (nullable `uuid`, self-referencing foreign key to `breweries.id`, `on delete set null`) to the `breweries` table. Built in `craftbeer-kiwi-DEV` first, then production. Backfilled six rows across four brand groups:

| Satellite row | Points to (flagship row) |
|---|---|
| Garage Project Aro Taproom | Garage Project |
| Garage Project Leeds Street | Garage Project |
| Garage Project Wild Workshop | Garage Project |
| Panhead Tory Street | Panhead Custom Ales |
| Double Vision Brewing - DUB HUB Island Bay | Double Vision Brewing |
| Waitoa Victoria St | Waitoa |

All other rows (standalone breweries, no known multi-site relationship) stay `null` — no backfill needed, non-breaking addition.

**Why:** Andy asked whether the table had any way to represent that some breweries are related (Garage Project's four sites, specifically). It didn't — the only prior signal was `nzbn`, already found unreliable for this exact purpose (`DEC-021`: breaks down for conglomerate-owned brands like Panhead/Lion and Tuatara/DB, and the Garage Project family's `nzbn` is blank and watchlisted, `TD-024`). Site relationships were otherwise only implicit in the naming convention (`"Garage Project Leeds Street"` reads as related to `"Garage Project"` to a human, not to any query).

**Why an FK to `id`, not a `brand_group` text field:** `id` is the one thing on a row guaranteed not to drift over time — a rename, relocation, or any other edit to `name`/`address` doesn't touch it. A text field like `brand_group = 'Garage Project'` would need to be kept in sync by hand across every row in the group and could silently fall out of step if the flagship row's own name ever changed. Pointing at `id` avoids that class of drift entirely.

**Scope, deliberately narrow:** this is brand grouping, not a general hierarchy — one level (satellite → flagship), not a tree, and nothing currently reads or displays this in the frontend. It exists to make the relationship queryable and to unblock future features (grouped map display, brand-level filtering, a "same brewery, another location" popup link) without redesigning the schema when one of those gets built.

**Known boundary, not a gap:** Three Sisters Brewery Ltd stays `parent_brewery_id = null` — its actual flagship is in New Plymouth, outside this (Wellington-only) directory, so there's no row here to point at. Worth revisiting once national expansion adds a New Plymouth row for real.

**Ruled out:** A plain `brand_group` text field (see above — drift risk). A general-purpose hierarchy/tree structure — no current need beyond one level, and premature given only four brand groups exist today.

---



**ID:** `DEC-030`

**Decided:** Found and fixed a data-quality gap: 5 of 24 active brewery rows had `description = null` — Double Vision Brewing - DUB HUB Island Bay, Garage Project Aro Taproom, Panhead Tory Street, Three Sisters Brewery Ltd, and Waitoa Victoria St. Written via verified web search, one factual sentence each (location plus a distinguishing detail), matching the existing style used across the other 19 rows. All five are taproom/bar-style venues for brands brewed elsewhere - consistent with the pattern already established for Panhead Custom Ales and Tuatara Brewery.

Also added Garage Project Aro Taproom to the existing NZBN watchlist note shared by the other three Garage Project sites (`TD-024`) - it missed the 28 July NZBN backfill pass because it was `is_active = false` at the time, not because its ownership situation is any different from Leeds Street or Wild Workshop.

**How found:** Andy noticed some breweries had no description while reviewing the map. A full null-content audit was run across all columns (not just `description`) while investigating - everything else (website, coordinates, region, ownership_type, has_taproom, last_verified) was fully populated; the 4 missing `nzbn` values were already known/watchlisted except for Aro Taproom, which was a genuine small gap.

**Worth noting:** Three Sisters Brewery Ltd's description makes explicit that it's a Wellington outpost of a New Plymouth-founded brewery, not a locally-founded one - confirmed via web search (Andy already aware). `region`/`ownership_type` currently treat it the same as locally-founded independents; whether an out-of-region parent brand should be flagged any differently is not currently tracked and hasn't been raised as a product question.

**Ruled out:** Nothing rejected here - this was a straightforward gap-fill following the existing `website`-null-audit pattern (`DEC-003`), not a new design decision.

---

## Mobile popup header-overlap fixed via measured header height; `GeolocateControl` moved off top-right

**ID:** `DEC-029`

**Decided:** Replaced the brewery pin's hardcoded `padding: { top: 120, ... }` fly-to value with a runtime measurement — `const headerHeight = headerRef.current?.offsetHeight || 120` — read fresh on every pin click and used as `top: headerHeight + 20`. Separately, moved Mapbox's `GeolocateControl` from `position="top-right"` to `position="bottom-right"`.

**Why:** `TD-001` (the popup-header-overlap regression) had the same root cause both times it appeared: a hardcoded pixel offset tuned against the header's height at the time, which silently went stale the next time the header grew (first the 21 July theme-dropdown addition, this time nothing new — the bug had simply never been properly fixed, only patched to match one specific header height). Reading `offsetHeight` at click time makes the fix self-correcting against any future header change, rather than requiring someone to remember to retune a number. While testing this fix, a second, previously-unnoticed instance of the identical underlying problem was found: `GeolocateControl`'s own built-in positioning (`top: 10px` from the map container) also placed it underneath the header, making the button unreachable — same header-overlay-on-map root cause, different element, never touched by any prior fix because nobody had tried to click it while investigating the popup bug specifically.

**Why `bottom-right` over measuring `GeolocateControl` too:** the popup fix needs the header height because the popup's position is meaningfully tied to *which pin was clicked* (its fly-to target). `GeolocateControl` has no such per-click positioning need — it's a static button — so moving it to a corner the header never reaches is a simpler, permanent fix with no dynamic measurement required at all. Applying the same `headerRef.current?.offsetHeight` pattern here would have worked but added complexity (custom CSS override of Mapbox's internal `.mapboxgl-ctrl-top-right` class) for no real benefit over a one-line position change.

**Confirmed:** both fixes tested and working in production (30 July) - real pin clicks clear the header correctly, `GeolocateControl` reachable and centring correctly at bottom-right.

**Ruled out:** Leaving `GeolocateControl` at `top-right` and adding a dynamic margin/offset to match the header height - more moving parts for a control that doesn't need per-click positioning logic.

---

## Theme picker limited to Light/Dark; DEV `is_published`/`has_theme` backfill drift found and fixed

**ID:** `DEC-028`

**Decided:** Changed the map theme `<select>` in `App.jsx` to render only `THEMES` entries whose ID appears in a new `VISIBLE_THEME_IDS = ['light', 'dark']` constant, rather than listing every key in `THEMES`. Dive Bar and Hop Explosion stay fully defined in the registry exactly as before — nothing rebuilt or lost — they just don't appear as selectable options until they have real Mapbox style URLs (`TD-023`).

**Why:** The two placeholder themes were visible and selectable in production despite pointing at non-existent Mapbox style IDs (`PLACEHOLDER/decimal-style-id`, `PLACEHOLDER/finland-topo-style-id`) — a visitor picking either would get a broken map. Hiding them at the picker level (rather than removing them from `THEMES`) keeps `DEC-010`'s original registry structure intact for when the real styles are ready.

**Second issue found during testing, same session:** testing the change against `craftbeer-kiwi-DEV` showed zero brewery pins with no console/UI error. Traced to `is_published` and `has_theme` (added 28 July, `DEC-019`) never having been backfilled to DEV's two active test breweries (Test Brewery Alpha, Test Brewery Beta) — both defaulted to `false`, so they silently failed the frontend's `is_published = true` publish-gate filter. Fixed via direct SQL:

```sql
update breweries
set is_published = true, has_theme = true
where name in ('Test Brewery Alpha', 'Test Brewery Beta');
```

Both columns had to be set together because of the `theme_required_to_publish` constraint (`DEC-019`) — setting `is_published = true` alone would have violated it.

**Why this matters beyond the fix itself:** this is the second confirmed instance of the same drift pattern — a column added and backfilled in production without an equivalent backfill in DEV, discovered only by tripping over it rather than by any proactive check. First instance was `region`/`ownership_type`/`has_taproom` earlier the same day. `TD-043` added to `todo.md` to audit DEV against prod for other quiet gaps, rather than continuing to find them one at a time.

**Ruled out:** Deleting `diveBar`/`hopExplosion` from `THEMES` entirely — would mean re-entering the same accent/header colour data later for no reason, since the picker-level filter achieves the same visible result without losing anything.

---

## Trend-driven filters: low/no-alcohol logged as a candidate; sustainability, style innovation, and premiumization deliberately not pursued

**ID:** `DEC-027`

**Decided:** Reviewed several current craft beer market trends (30 July) against whether they should become filterable brewery attributes. Only the low/no-alcohol trend was logged as a candidate (see `todo.md`, "Not started" — low priority, deferred until post-Wellington). Sustainability, style innovation (hazy IPAs, sours, cold IPAs, coffee stouts), and premiumization were considered and explicitly not pursued as filters or schema additions.

**Why low-alc qualifies but the others don't:** a good filter candidate needs to be (a) a stable fact about the *brewery*, not a rotating fact about its current tap list, and (b) discriminating — genuinely true for some breweries and not others, so filtering on it actually narrows results for a visitor.

- **Sustainability** fails the discriminating test — most craft breweries can plausibly claim some version of it (local sourcing, reduced packaging), so a filter wouldn't meaningfully narrow anything.
- **Style innovation** (sours, hazy IPA, cold IPA, coffee stout etc.) fails the stability test — this is a fact about an individual beer/tap list, not the brewery itself, and turns over far faster than the directory could keep accurate. Flagging a brewery as "does sours" would carry the same "on tap today vs sometimes" staleness risk already identified as the real weakness of trend-driven filters generally.
- **Premiumization** isn't a fact about a specific brewery at all — it's a market-positioning observation, with no natural yes/no to attach to a row.

Low/no-alcohol survives both tests: whether a brewery produces a 0%/low-alc beer as part of its core range is a reasonably stable, genuinely binary fact, and — per the market research behind this decision — a real and growing search motivation (NZ non-alc share estimated at roughly 2.4-4% of beer sold and climbing, versus ~10-15% in more mature markets like the UK/Netherlands/Germany/Spain).

**Ruled out:** Building a general-purpose `tags` array now to hold all four trends loosely. Considered, but rejected for the same reason as the individual filters — three of the four candidate tags don't have a stable, discriminating fact to store in the first place, so building the field early wouldn't be premature optimisation so much as a home for data that doesn't answer a real visitor question. If a general `tags` field is needed later, low-alc is a reasonable first (and possibly only, for now) entry — worth revisiting shape then rather than speculatively designing it around trends that didn't pass the test.

**Why this matters beyond these four specific trends:** establishes a repeatable test (stable-to-the-brewery + discriminating) for evaluating future trend-driven feature requests, rather than re-litigating "is this worth building" from scratch each time a new market trend comes up.

**ID:** `DEC-026`

**Decided:** Added three new `breweries` columns, built and backfilled in `craftbeer-kiwi-DEV` first, then production (30 July):

- **`region`** (text, nullable) — populated from the Brewers Guild of NZ's own regional groupings (e.g. `'Wellington, Wairarapa & Manawatū'`), rather than inventing a bespoke boundary scheme. All 24 current brewery rows and all 7 bar rows set to the same Wellington-region value, since region is a geographic fact independent of `venue_type`.
- **`ownership_type`** (text, nullable, check constraint `independent`/`corporate-subsidiary`) — reuses the corporate-ownership findings already surfaced during the 28 July NZBN backfill (`DEC-021`): Panhead Custom Ales, Panhead Tory Street, and Tuatara Brewery set to `corporate-subsidiary` (Lion/Kirin and DB/Heineken respectively), all other 21 brewery rows set to `independent`. Left `null` on bar rows — not a meaningful attribute for a venue that isn't itself a brewery.
- **`has_taproom`** (boolean, nullable) — whether the brewery has a public, visitable premises. Checked individually via web search for every current brewery rather than assumed from name/address alone (a few looked genuinely ambiguous going in — Duncan's Brewing, Kereru Brewing, North End Brewing). **Finding: all 24 current brewery rows have confirmed public taproom access** — nothing in the Wellington directory is currently production-only or distribution-only. Left `null` on bar rows.

**Why prompted:** Andy supplied a Brewers Guild of NZ member-breweries-by-region listing (30 July) as a cross-reference source. Recognised as directly resolving `automation-plan.md`'s `AP-PREREQ-3` (region boundary definition) — using an industry body's own regional taxonomy avoids inventing one from Places API geometry. `ownership_type` and `has_taproom` were added in the same migration since they're cheap (mostly already-known data, or a quick verification pass) and both matter for the planned trail/passport feature — a brewery with no public premises isn't trail-relevant regardless of how good its beer is.

**Nullable by default, not defaulted to a guess:** all three columns default to `null` for new rows (matching the existing `nzbn`/`watchlist` pattern) rather than a plausible-looking default like `ownership_type = 'independent'` or `has_taproom = true`. Both would have been correct for every row today, but a default that happens to be right 100% of the time on current data is still an unverified guess for the next automated insert — same reasoning already applied to `nzbn` (`DEC-021`) and the two-source-agreement closure rule (`DEC-005`): don't let "true so far" become "assumed true."

**Numbering note (resolved 30 July):** this entry is numbered `DEC-026`, one ahead of `DEC-025`, because at the time it was drafted `DEC-025` (craft-curation policy) appeared to be missing from this file despite being referenced as actioned in `concept-benchmarks.md`. `DEC-025` has since been located/reconstructed below — see its own entry's "Documentation note" — so the gap this note originally flagged is closed. Numbering left as-is (`DEC-026` after `DEC-025`) rather than renumbered, since IDs are meant to stay stable references once assigned.

**Region/rollout-phase naming mismatch, flagged not resolved:** the Brewers Guild's regional groupings don't map 1:1 onto `automation-plan.md`'s phased rollout order — Guild combines Northland+Auckland as one region and keeps Waikato/Bay of Plenty separate, while the rollout phases group "Auckland and Canterbury" together, then "Waikato, Bay of Plenty, Otago" as a second batch. `region`'s values will follow Guild's taxonomy (per Andy's confirmed choice); a rollout-phase-to-region lookup will be needed at expansion time rather than assuming the two schemes line up automatically.

**Ruled out:** A bespoke region-boundary scheme (Places API bounding boxes or manual district definitions) — the Guild listing was already sitting there as a ready-made, industry-curated taxonomy; no reason to build a second one. Defaulting `ownership_type`/`has_taproom` to their current-universal values — see "Nullable by default" above.

**Data-quality caveat carried over:** per the concept snapshot this list came from, the Brewers Guild directory is a paying-member list, so it undercounts smaller/independent breweries — useful as a cross-reference and regional taxonomy source, not a ground-truth completeness check.

**Count clarification (31 July):** "24 current brewery rows" above counts all `venue_type = 'brewery'` rows in the table, not just live/`is_active = true` ones — at the time this was written, that included Garage Project Aro Taproom, then still suppressed (`is_active = false`) under the original `DEC-015` near-duplicate call. Other docs (README, most of `todo.md`) quoted 23 for the same period, meaning the live count. See `DEC-015`'s correction: Aro Taproom has since been confirmed as a genuine second site and reactivated, so as of 31 July the live count and the total row count are both back to 24, and this note is no longer a live discrepancy — kept for the record.

---

## Craft-curation policy: corporately-owned breweries stay in, on the same footing as independents

**ID:** `DEC-025`

**Decided:** `craftbeer.kiwi`'s directory includes corporately-owned but independently-branded breweries — specifically Panhead Custom Ales (owned by Lion NZ Limited / Kirin) and Tuatara Brewery (owned by DB Breweries / Heineken) — on the same footing as independent breweries. Inclusion criterion is beer quality and whether it's a genuine brewery-run venue, not ownership structure.

**Why:** Surfaced as an open product question during the 28 July NZBN backfill (`DEC-021`), when both breweries' corporate ownership was confirmed for the first time. Resolved during a 29 July research session that reviewed comparable NZ/AU platforms — notably BrewMap.com.au, which explicitly positions itself as "independent breweries only." Andy confirmed `craftbeer.kiwi` deliberately does not take that position: a curated stance excluding corporately-owned brands is a defensible market position (BrewMap proves that), but not the one this project wants, since Panhead and Tuatara are genuinely brewery-run venues making beer worth visiting for, regardless of who owns the parent company.

**Related but distinct, not resolved by this decision:** Sprig + Fern raised a different question the same day (28 July, Nelson dry run) — independently owned (no corporate parent, confirmed via NZBN) but grown into a multi-region pub chain from a single Richmond brewery. Whether multi-region chain structure should be treated differently from single-site independents is still open; this decision only settles the corporate-ownership axis.

**Ruled out:** An "independent breweries only" curation policy (BrewMap's positioning) — considered directly as a comparison, not adopted.

**Documentation note:** this entry was reconstructed 30 July after being found missing from both the project-knowledge and local master copies of this file, despite being referenced as actioned in `craftbeer-kiwi-concept-benchmarks.md` and in a later session's own summary of its output. The original 29 July session did generate and describe this entry, but it evidently never made it into a saved version of this file — a gap in the re-upload-tracking workflow the doc-versioning cleanup (29 July) was meant to catch, that slipped through anyway. Reconstructed from the concept-benchmarks.md cross-reference and past-conversation history rather than from a lost draft.

---

## First security audit: legacy Supabase key disabled, `dryRun` default gap found and fixed

**ID:** `DEC-024`

**Decided:** Ran the first formal security audit (29 July) against the standing checklist in `craftbeer-kiwi-security.md`. Two real findings, both fixed and verified same session:

1. **Legacy `service_role` API key was still active.** This key bypasses RLS entirely and wasn't referenced anywhere in the current codebase (migration to the named `brewery_sync_v2` secret key happened 27 July, see `DEC-012`), but remained live and valid — an unused credential with maximum privilege. Disabled via Supabase's "Disable JWT-based API keys."

2. **`brewery-discover`'s dry-run-by-default decision (`DEC-014`) had never actually shipped.** `DEC-014` was marked "Update (28 July): built," but that referred to the *opt-in* `dryRun` flag from `DEC-022`, not the separate 28 July decision that dry-run should be the *default* unless a parameter forces a live run. The deployed code still read `const dryRun = url.searchParams.get("dryRun") === "true"` — opt-in, not opt-out. A plain, unparameterised call to the function would have written directly to `breweries`. Fixed to `const forceLive = url.searchParams.get("live") === "true"; const dryRun = !forceLive;`, deployed, and verified: a test call with no parameters returned `dryRun: true, inserted: 0`, correctly surfacing one new candidate in `wouldInsert` without writing it.

**Why this matters beyond the two fixes themselves:** this is a concrete example of doc/reality drift surviving multiple "done" markers — `DEC-014`, `automation-plan.md`, and `todo.md` had all recorded the dry-run-default decision as settled, but none of them had actually checked the deployed function code against it. The gap was only caught by verifying live configuration directly during the audit, not by re-reading docs more carefully. Reinforces the standing lesson from `craftbeer-kiwi-retrospective.md` about doc drift, extended to code: a decision being logged is not the same as a decision being shipped.

**Ruled out:** Treating the `dryRun` gap as low-severity because "nothing bad happened yet" — same reasoning already rejected once for this exact function (see `DEC-014`'s own history), so it was fixed immediately rather than logged as a lower-priority to-do.

**Full audit findings, checklist pass/fail detail:** `craftbeer-kiwi-security.md`, Audit log, "First audit — 29 July 2026."

---

## Regional dry-run pagination added — confirmed not the cause of the Thorndon/Petone gap

**ID:** `DEC-023`

**Decided:** Added pagination to `brewery-discover`'s Text Search calls, looping via `nextPageToken` up to `MAX_PAGES = 4` (up to 80 candidates per run instead of a hard 20). Kept, even though it turned out not to explain the specific gap that prompted it — genuinely useful for larger regions ahead of national expansion, particularly Auckland, where 20 results is a much more plausible real ceiling than it is for Wellington.

**Why this was investigated:** A Nelson region dry run (28 July, part of testing ahead of the phased rollout) surfaced Sprig + Fern as a known national pub chain with multiple non-brewing locations — prompting a check of whether Sprig + Fern's own Wellington pubs (Thorndon, 342 Tinakori Road; Petone, 146 Jackson Street) were missing from Wellington's existing discovery results due to the same 20-result-per-request cap that (wrongly) seemed like the likely explanation at the time.

**Finding: it wasn't a volume problem.** After deploying pagination and re-running the Wellington dry run, `found` stayed at exactly 20 — meaning Google's Text Search genuinely has no `nextPageToken` to offer for this query; there simply aren't more than 20 places Google considers relevant matches for `"brewery in Wellington, New Zealand"`. Thorndon and Petone aren't being cut off by a limit — they're not being returned at all, at any page.

**Actual explanation:** the same pattern already identified in Nelson. Thorndon and Petone are marketed and reviewed everywhere as pubs/taverns that pour Sprig + Fern beer, not as breweries — Google's own relevance ranking for a "brewery" query correctly doesn't surface them, the same way `primaryType` correctly tags Nelson's non-Richmond Sprig + Fern locations as `pub`/`bar`. This isn't a `brewery-discover` defect; a pub serving a brand's beer isn't a brewery, and the tool is behaving correctly by not returning it. Getting these into the directory (if desired at all) is a manual/product decision, same as any other bar or pub venue — not something discovery should be expected to surface on its own.

**Ruled out:** Treating the missing Wellington locations as a bug to keep chasing via query tuning — the pagination test was the right way to rule out the volume explanation definitively, and having done so, further tuning would be solving a problem that doesn't actually exist for Wellington specifically.

**See also:** `DEC-022` (the `includedType`/`strictTypeFiltering` revert) and the Nelson dry-run findings — all three point to the same underlying lesson: Google's own place-type signals (whether `includedType` filtering or plain relevance ranking) reliably distinguish "brews beer" from "sells/pours beer under a brand name," which is exactly the distinction `craftbeer.kiwi` needs and shouldn't try to override.

---



**Decided:** Tried filtering `brewery-discover`'s Places Text Search using the new (Feb 2026) `brewery`/`brewpub` type categories — `includedType: "brewery"` with `strictTypeFiltering: true` — to cut bar/pub false positives at the API level instead of relying entirely on post-classification via `venue_type`. Reverted after testing via `dryRun`: kept `primaryType` in the field mask and `primary_type` as a stored column for triage reference, dropped `includedType` and `strictTypeFiltering` from the request entirely.

**Why reverted:** `strictTypeFiltering: true` returned only 8 results against Wellington, of which every single one was either a known bar/pub with "Brewery"/"Brewer" in its own venue name (Fork and Brewer, Heyday Brewery & Bar, Parrotdog Brewery & Bar) or a Garage Project taproom variant — and **15 of the 23 known breweries in the table didn't come back at all**, including straightforward, unambiguous ones like Panhead, Boneface, and Three Sisters. Removing just `strictTypeFiltering` and keeping `includedType: "brewery"` alone produced an identical result, confirming the problem was `includedType` itself, not strict mode specifically. Removing `includedType` entirely restored the original broad-query behaviour (`found: 20`, matching the shape of the 27 July run).

**Conclusion:** Google's `brewery`/`brewpub` type categories are too new and too unevenly applied to NZ listings to use as a filter — false negatives (a real brewery silently never appearing) are a worse failure mode than false positives (a bar appearing and needing manual exclusion), since a missed brewery never surfaces for review at all.

**Kept anyway:** `places.primaryType` in the field mask, and a new `primary_type` column on `breweries` (added 28 July, both DEV and prod), populated from Google's classification on every discovered candidate — not used as a filter, but genuinely useful as triage metadata. Proved its worth immediately: the first candidate found after reverting, "Teddy's Tacos: Taproom & Taqueria," carried `primary_type: "restaurant"` — a taproom serving craft beer, not a brewery, correctly left in `dryRun` output rather than the live table, exactly as designed.

**Also delivered from this session:** the `dryRun` flag itself — `brewery-discover` now accepts `?dryRun=true`, returning `wouldInsert`/`skippedNames` without writing to `breweries`. This was the mechanism that let the `strictTypeFiltering` problem get caught and disproven before it ever touched live data, rather than repeating the 27 July pattern of finding out after the fact.

**Ruled out:** Keeping `strictTypeFiltering` with a narrower/different query string — not investigated further once the false-negative rate against known breweries made the whole approach look structurally unreliable rather than just mistuned.

---

## NZBN backfill: findings from the full 23-brewery pass

**ID:** `DEC-021`

**Decided:** Manually looked up and recorded NZBN + registered legal name for all 23 breweries (bars excluded — scope is `venue_type = 'brewery'` only), rather than automating the search-and-match step now. Confirms the earlier open question in `craftbeer-kiwi-automation-plan.md`: manual lookup during a one-off pass was the right call at this volume — automation would have needed to solve every ambiguous case below algorithmically, which wasn't close to justified by the effort.

**Why manual, not automated:** As anticipated, registered legal names routinely diverge from trading names (Heyday Beer Co / Has Beer Limited, Mean Doses / K&D Sessions Limited, Choice Bros / Choice Bros Brewing Wellington Limited), and several searches returned multiple plausible candidates requiring judgment — industry classification, registered address, registration date, and cross-referencing the brewery's own web presence, not a single deterministic signal. This is exactly the fuzzy-matching problem flagged when the open question was logged; nothing here suggests it would have been solvable by a simple automated name search.

**Findings on the multi-site-NZBN theory (the original motivation for adding the column):**
- **Confirmed working, twice:** Waitoa (Hataitai + Victoria St) and Double Vision (Miramar + DUB HUB Island Bay) both resolved to a single NZBN across their two rows — genuine, positive evidence the signal can work for catching multi-site brands.
- **Complicated by corporate ownership, twice:** Panhead (both sites) and Tuatara both resolved to major-multinational parent entities — Lion NZ Limited (Kirin-owned) and DB Breweries Limited (Heineken-owned) respectively — rather than a brand-specific entity. Both are correct matches, but the shared-NZBN signal here means "same corporate owner," not "same trading brand," and DB Breweries Limited in particular would give a false-positive multi-site match against *any* other DB-owned brand, not just Tuatara. The theory only holds when the shared entity is the brand itself, not when it's a conglomerate parent.
- **Unresolved:** Garage Project (Aro Street, Leeds Street, Wild Workshop) — traced to a real corporate structure (Brewwell Holdings Limited, industry-coded Breweries, registered at the Aro Street address, itself the parent of at least one subsidiary, Garage Project Pavilion Limited) but the actual operating entity is very likely a sibling "Brewwell Limited" that wasn't confirmed. All three rows left `nzbn` blank and `on_watchlist = true` rather than guessing.
- **Net assessment:** the multi-site signal is real but not universal — worth using as one input for future duplicate/multi-site detection, never as the sole or automatic trigger.

**Other findings, not part of the original goal but surfaced along the way:**
- **Boneface** — NZBN shows "In Liquidation." Given a known prior ownership change already logged for this brewery, this may reflect a superseded pre-change entity rather than current status. Watchlisted, not treated as a closure signal.
- **Heyday** — NZBN entity (Has Beer Limited) matches on address/website but predates the acquisition by Abandoned already noted in this brewery's own description. Watchlisted as an ownership-currency question, not a data error.
- **Rocky Knob Brewing** — Te Aro Brewing Company Limited's NZBN record lists this as an additional trading name, but Rocky Knob is a real, separate, Tauranga-based brand (confirmed via web search, independently listed by the Brewers Guild), and its own domain no longer resolves to a brewery. Reads as stale or administrative registry data, not a hidden Wellington presence — not actioned.
- **Garage Project Pavilion Limited** — surfaced as a Brewwell Holdings subsidiary during the Garage Project search, registered 24 March 2026 at the Aro Street address, industry-classified "Bar - licensed." Reads as a new licensing entity for a space at the existing site (a beer garden/event area, going by the name) rather than a fourth physical location — not added to the directory.
- **Two breweries are corporately owned by international brewers while retaining independent branding** (Panhead/Lion/Kirin, Tuatara/DB/Heineken) — noted here as a factual finding; whether `craftbeer.kiwi`'s "craft" framing should treat this differently is a separate, not-yet-decided product question.

**Ruled out:** Guessing on any ambiguous match rather than recording it as unresolved — the entire value of `nzbn` depends on it meaning "confirmed," not "best guess," especially given the multi-site use case would be actively harmful if built on wrong data.

---

## Internal watchlist flag: separate from `status` and `flagged_for_review`

**ID:** `DEC-020`

**Decided:** Added `on_watchlist` (boolean, default `false`) and `watchlist_note` (text, nullable) — an internal-only pair, never surfaced on the public map, for unconfirmed signals worth a human's attention but not yet actionable.

**Why:** Prompted directly by looking up Boneface's NZBN and finding it shows "In Liquidation" — a genuine legal-register fact, but one of uncertain relevance, since the entity may predate a known ownership change (Boneface's ownership change is already logged as an early data correction). Neither existing field fit: `status`/`status_note` is for *confirmed* temporary closures the project is comfortable showing publicly (grey pin, badge, popup note) — showing "In Liquidation" next to a brewery that's still actively trading would be actively misleading, not just premature. `flagged_for_review` is close in spirit, but it's specifically scoped to the automated two-source-agreement closure logic — overloading it with an unrelated manual-research signal would blur what it means when it's set.

**Ruled out:** Reusing `flagged_for_review` for this — would conflate two different kinds of "needs a human look": automated source-disagreement (which already has defined semantics tied to `brewery-sync`) versus an ad-hoc manual finding with no fixed trigger. Naming it `nzbn_watchlist` or similarly specific — kept generic instead, since the same "worth watching, not yet actionable" shape will likely apply to other future signals (a stale website, a spotted-in-passing closure sign) beyond just NZBN status.

**First use:** Boneface Brewing Co flagged 28 July, NZBN `9429042455080` recorded alongside the note, pending confirmation of whether the liquidation status reflects the current trading entity.

---

## `is_published` flag + `theme_required_to_publish` constraint

**ID:** `DEC-019`

**Decided:** Added `is_published` (boolean, `not null default true`) as a dedicated publish gate, plus a check constraint — `check (not is_published or has_theme or venue_type != 'brewery')` — that makes it structurally impossible to publish a brewery row without an explicit `getBreweryTheme` entry. A companion `has_theme` boolean tracks whether that entry exists.

**Why:** The existing "every brewery needs an explicit theme" rule (see below) had no actual enforcement point for automated inserts — `brewery-discover`'s first live run put 12 untheme'd rows straight onto the live map. Rather than relying on remembering to check the exceptions report every time, the constraint makes the gap impossible to create by accident. `is_published` is deliberately separate from both existing lifecycle flags: `is_active` describes permanent closure, not publish-readiness, and `flagged_for_review` (per the two-source-agreement rule) is meant to leave a brewery *visible* while under review — reusing either for "not yet ready to show" would break that existing semantics.

**Ruled out:** A neutral fallback colour in `getBreweryTheme` so untheme'd pins render generically rather than blocking publish — partially reverses the original "no fallback" rule and deserves its own deliberate call rather than folding into this one. Relying on the exceptions report alone (no constraint) — the report only helps if someone actually checks it before every publish; the constraint holds regardless.

**Rollout note:** All 23 existing breweries defaulted to `is_published = true` on migration (verified zero constraint violations before the constraint was added), so nothing changed on the live map. New automated inserts are expected to land `is_published = false` until triaged and themed — this is now the actual enforcement mechanism behind the per-brewery theming rule extended to automated inserts (see below).

---

## National expansion: region-by-region rollout, dry-run gate mandatory per region

**ID:** `DEC-018`

**Decided (28 July):** Expansion beyond Wellington will proceed region by region — not nationally in one pass — with a `dryRun` review-and-triage step mandatory before any region's discovery results go live. Phase order: Auckland and Canterbury first, then Waikato/Bay of Plenty/Otago, then remaining regions batched together. Full plan in `craftbeer-kiwi-automation-plan.md`.

**Why:** `brewery-discover`'s first live run (27 July, Wellington) returned a roughly 50% false-positive rate — in a market Andy could personally sanity-check by eye. There's no reason for that error rate to be lower in an unfamiliar region, and no personal gut-check to catch it if it isn't.

**Ruled out:** Running discovery nationally in one pass once `dryRun` exists — would produce one very large, hard-to-triage batch spanning regions Andy doesn't know well.

**Dependency created:** Makes the `dryRun` flag a hard blocker on the whole rollout — see `craftbeer-kiwi-automation-plan.md`'s "what needs building next" list.

---

## Per-brewery theming rule extended to cover automated inserts

**ID:** `DEC-017`

**Decided:** The existing "every brewery needs an explicit `getBreweryTheme` entry" rule now explicitly covers breweries added by `brewery-discover`, not just manual adds. Theming becomes part of the planned `dryRun` review step: no automated row goes live without a theme entry assigned as part of the same manual review that catches bars/pubs and duplicates. Until `dryRun` exists, any live automated run needs a manual follow-up pass to add theme entries for whatever landed.

**Why:** The original rule (below) was written with manual adds in mind, where touching the theme lookup is a natural part of adding a row. `brewery-discover`'s first live run (27 July) inserted 12 breweries with no equivalent checkpoint, so they went live untheme'd — confirming the rule as written had no step covering the automated path.

**Ruled out (for now):** Adding a neutral fallback colour in `getBreweryTheme` so untheme'd pins render as generically "unthemed" rather than defaulting to whatever colour currently happens when no entry matches. Not dismissed, just not decided — this would partially reverse the original "no fallback" rule and deserves its own deliberate call rather than a quick patch.

---

## `brewery-discover` false positives: keep-and-filter (`venue_type`), not delete

**ID:** `DEC-016`

**Decided:** When `brewery-discover`'s first real run (27 July) returned 7 bars/pubs alongside genuine breweries, the fix was a new `venue_type` column (`'brewery'`/`'bar'`) plus a frontend query filter (`venue_type = 'brewery'`), rather than deleting the bar rows outright.

**Why:** Keeping the rows preserves an audit trail of what discovery actually found, and prevents the same bars being silently re-discovered and re-inserted on every future run, since their `place_id` now already exists in the table.

**Ruled out:** Hard-deleting the bar rows — matches the project's existing soft-delete philosophy, and would mean re-doing the same classification work every time discovery re-finds the same bars.

---

## Garage Project Aro Taproom: reactivated — genuine second site, not a duplicate

**ID:** `DEC-015`

**Originally decided (27 July):** Garage Project Aro Taproom was treated as a near-duplicate row for a brewery already in the directory, and suppressed via `is_active = false` rather than reclassified via `venue_type`.

**Correction (31 July):** This was wrong. Checking the actual addresses — Garage Project (68 Aro Street) vs. Garage Project Aro Taproom (91 Aro Street) — shows two different premises on the same street, not one site double-listed under two `place_id`s. Web search confirmed 91 Aro is Garage Project's own operating taproom, across the road from the original brewery, currently trading (Tue–Sun). Andy confirmed the brewery/taproom split is real and taprooms are in scope for the directory. Reactivated (`is_active = true`, 31 July) — `is_published`/`has_theme` were already `true` on this row, so no further gating changes were needed for it to reappear on the map. Live brewery count returns to 24.

**Why the original call was wrong:** the "same physical site, two listings" assumption was never checked against the actual address data — the two rows' street numbers were sitting right there in the table and would have shown the mismatch immediately. Worth noting as a process point: a "near-duplicate" classification should be confirmed against address (or a map check), not assumed from name similarity alone.

**Ruled out (at the time, no longer relevant):** Deleting the row, or reclassifying via `venue_type = 'bar'`.

**Still open:** the underlying dedup blind spot this was originally meant to address — Places assigning distinct `place_id`s to what can look like the same brand's site — is still real for genuine future duplicates. This correction doesn't change that; it just confirms this particular case wasn't one.

---

## `dryRun` flag: still not built before `brewery-discover`'s first live run

**ID:** `DEC-014`

**Decided (by circumstance more than deliberate choice):** the first real `brewery-discover` test (27 July) ran directly against the live `breweries` table. A `dryRun` safety flag was discussed as far back as 20 July as worth adding before any real run, but hadn't been built when the Supabase key issue resolved and the first successful test became possible.

**Why this matters going forward:** this run is now the concrete example of exactly the failure mode `dryRun` was meant to prevent. It remains a to-do, but with direct evidence attached — see the national expansion decision above, where it's promoted to a hard blocker.

**Update (28 July):** built. See `DEC-022` above for the `dryRun` implementation and its first real use, catching the `strictTypeFiltering` problem before it touched live data.

**Correction (29 July):** the build above was opt-in only (`?dryRun=true`) — this entry's own title ("should be the default") was never actually implemented in code, despite reading as resolved. Caught during the first security audit by checking deployed code directly, not docs. Fixed and verified same day — see `DEC-024`.

---

## `venue_type` field: retain-and-flag, not delete, for non-brewery discoveries

**ID:** `DEC-013`

**Decided:** When `brewery-discover` picks up a venue that isn't actually a brewery (a bar/pub that pours craft beer, or a general venue caught by a broad search), don't delete the row. Add a `venue_type` text field (default `'brewery'`), set it to `'bar'` for these cases, and filter the frontend map query on `venue_type = 'brewery'` in addition to the existing `is_active = true`.

**Why:** Two reasons. First, deleting the row would also delete its `place_id` from the table — since dedup only checks existing `place_id`s, the exact same bar would just get rediscovered as "new" on every future `brewery-discover` run, wasting API calls and requiring the same manual triage repeatedly. Retaining the row with a flag makes it permanently "known" without needing to reappear on the map. Second, Andy raised that a "pubs & bars serving craft beer" layer/filter is a plausible future feature — a string field (rather than a plain `is_brewery` boolean) leaves room to add more categories later (`bottle_shop`, `festival`, etc.) without another schema migration, and the excluded venues are already sitting there correctly labelled if that feature gets built.

**Ruled out:** Deleting non-brewery rows outright — simpler in the moment, but actively counterproductive given how dedup works. A plain boolean (`is_brewery`) — technically sufficient for today's two categories, but foreclosed the "pubs as their own thing" possibility Andy specifically flagged as being of interest down the track.

**Tested first in `craftbeer-kiwi-DEV`:** column added and frontend filter tested there before the equivalent change was made in production, consistent with the project's dev/prod workflow.

---

## Edge Function secret-key auth: named keys are required, not optional

**ID:** `DEC-012`

**Decided (root cause, not really a "decision" — a bug fix):** `@supabase/server`'s secret-key auth mode must be written as `auth: "secret:<name>"`, where `<name>` matches the label given to the key in Supabase's dashboard (Settings → API Keys). Both `brewery-sync` and `brewery-discover` were originally written with just `auth: "secret"` — no name — which the SDK can't resolve to any actual key, so it correctly (if unhelpfully) rejected every request with a generic "invalid credentials" 401, regardless of which valid `sb_secret_...` key was sent.

**Why this took a week to find:** the error message ("Invalid credentials" / `INVALID_CREDENTIALS`) looked identical whether the problem was a wrong key, a missing header, or (the actual cause) a missing key-name in the auth config — there was no signal pointing specifically at the code's own auth mode being incomplete. Ruled out along the way, in order: the Supabase platform's separate legacy `verify_jwt` gateway check (already correctly disabled); sending the key in the wrong header (`Authorization` instead of `apikey` — a real, documented common mistake, but not what was happening here); a stale/rotated key mismatch (ruled out once a second, freshly-generated key produced the identical error). The actual fix was found by reading Supabase's own "Securing Edge Functions" documentation in full, specifically the table describing `@supabase/server`'s auth modes — it explicitly requires `'secret:<name>'`, not bare `'secret'`.

**Fix:** both functions changed to `auth: "secret:brewery_sync_v2"` (the name of the currently-active key) and redeployed. Confirmed working via the dashboard's test panel.

**Lesson for future Edge Functions:** always specify a named key in `auth: 'secret:<name>'` mode, never bare `'secret'` — and when troubleshooting a generic-looking 401 from `@supabase/server`, check the function's own `auth` configuration string itself before assuming the problem is external (wrong key, platform bug, expired credential).

---

## Documentation process: proactive tracking over ad-hoc updates

**ID:** `DEC-011`

**Decided:** Formalised how the living docs (README, architecture, automation-plan, retrospective, decisions) get maintained: proactively prompt to update the relevant doc(s) whenever a session involves a schema change, architecture change, major feature, or significant decision — rather than waiting to be asked. Added alongside this: in-session mismatch flagging (raise it the moment something contradicts an uploaded doc, not just at the end), a "pending re-upload" log so a doc regenerated for download isn't wrongly assumed to have made it back into project knowledge, an end-of-session git status/unpushed-work check, and a prompt to regenerate any committed doc as a PDF for Andy's Dropbox folder.

**Why:** Doc drift had become a recurring, named pattern by 20 July (see `retrospective.md` block 7) — several sessions had discovered docs had fallen behind actual state, or that edits made in one place hadn't persisted to another. Treating doc maintenance as a tracked process rather than a one-off fix was judged worth the overhead.

**Ruled out:** Leaving it as an informal "update docs at the end if there's time" habit — this was the status quo that produced the drift in the first place (`architecture.md` sat unupdated from 11 July to 27 July as a direct result).

---

## Map theming: `themeId` + registry, not a dark-mode boolean

**ID:** `DEC-010`

**Decided:** Replace the earlier `darkMode` boolean with a `themeId` string and a `THEMES` registry object (accent colour, header background/text, Mapbox `mapStyle` URL per theme), selected via a `<select>` dropdown in the header.

**Why:** A boolean only scales to two states. The product direction (playful, brand-driven map themes — Dive Bar, Hop Explosion — beyond just light/dark) needed an extensible structure from the start rather than a rewrite later.

**Trade-off accepted:** Two of the four themes (Dive Bar, Hop Explosion) shipped structurally complete but visually unfinished — placeholder Mapbox style URLs — because a suitable style wasn't found in Mapbox's community gallery. Judged better to ship the extensible structure now and finish the visuals in a dedicated session than to hold up the whole feature.

---

## Domain: A record, not nameserver switch

**ID:** `DEC-009`

**Decided:** Point `craftbeer.kiwi` at Vercel via an A record at host `@`, not by switching nameservers to Vercel.

**Why:** Andy plans to set up email on the domain (e.g. `hello@craftbeer.kiwi`), managed through Discount Domains. Switching nameservers to Vercel would hand over DNS control entirely and complicate adding mail records (MX etc.) later.

**Ruled out:** Nameserver switch — simpler for pure hosting, but loses easy email setup.

**Implementation note (27 July):** the domain's nameservers turned out to already be pointed at Fastmail (a dormant setup from the original 2016 registration), not Discount Domains itself, which blocked adding the A record until resolved. Andy confirmed the unused Fastmail email setup could be broken to fix this — nameservers were switched back to Discount Domains' own, and the A record was added there as originally decided above. See `retrospective.md` block 11.

---

## Dev/prod environments: Option B, not Option C

**ID:** `DEC-008`

**Decided:** Use two separate free-tier Supabase projects (dev + prod) with environment-based config (`.env.local` for dev, Vercel dashboard env vars for prod), rather than Supabase's native database branching.

**Why:** Branching is a paid-plan feature only (Pro plan, $25/month minimum, plus per-branch cost) — real recurring cost for a project that's currently $0 to run. It earns its keep with multiple contributors working in parallel; that's not the current situation. Two free Supabase projects gives the same core safety (test schema/Edge Function changes before they hit live data) at no cost.

**Ruled out:** Option A (status quo, rely on Git + backups) — no safety net for schema changes, which is the real growing risk as Edge Functions do more. Option C (native branching) — parked, not dismissed; revisit if the project ever gains a second contributor or a much faster release cadence. Option D (migration files on top of B) — the natural next step once manual dev/prod syncing starts to feel like real overhead, likely around the NZBN API integration.

**See:** `dev-prod-environments-discussion.md` for the full comparison.

**Implementation note (27 July):** built sooner than the original "wait for a real schema change" trigger — the domain going live plus Analytics tracking real visitors was judged reason enough on its own, since a bad schema change now risks affecting actual visitors, not just Andy's own testing. `craftbeer-kiwi-DEV` was created (Tokyo region — a minor, deliberate deviation from production's Sydney region), schema and RLS policy matched to production, seeded with fake test data, and verified working via `npm run dev` correctly reflecting only the dev project's data. Vercel's production environment variables were left untouched throughout. One near-miss during setup: the schema SQL was nearly run against production because the dashboard had defaulted back to that project — caught before anything wrote to the live table (the `create table` statement failed outright rather than partially succeeding), and positively confirmed via Table Editor that production was unaffected. See `retrospective.md` block 12 for the full account, including the lesson to double-check the project name in the breadcrumb before running SQL, not just before starting the session.

---

## Favourites/trails: anonymous device ID, not user accounts

**ID:** `DEC-007`

**Decided:** No login system. Browser generates a random ID via `crypto.randomUUID()`, stored in `localStorage`; a `trails` table in Supabase keys off that ID, with a scheduled Edge Function deleting rows older than 7 days. Sharing a trail generates a separate public share-code rather than exposing the private device ID.

**Why:** Avoids handling any PII (no email/password) and avoids building an auth system for a feature that doesn't need identity, just persistence.

**Trade-off accepted:** This protects against casual exposure (nothing to breach, since there's no account) but not against someone who has the raw ID directly editing that data — it's obscurity via random string, not real authentication. Judged acceptable for a brewery trail list; would not be acceptable for anything sensitive.

**Update (29 July) — design refinement, not yet built:** Prompted by comparing craftbeer.kiwi against other brewery-discovery apps (the NY Craft Beer app's passport programme, Untappd's badge system), two additions are worth building into the trail feature when it's actually implemented, rather than bolted on afterwards:
1. **A completion payoff.** The current design leaves a finished trail as just a static list — worth adding something at the end (even a simple shareable "you did the [region] crawl" completion card), so the feature has a payoff rather than just being a bookmark list.
2. **Lightweight anonymous badges.** A handful of named badge definitions (e.g. "Brewtown Crawl," "CBD Five") checked against a trail's brewery contents — no new identity or privacy surface, since it's evaluated against the same anonymous `crypto.randomUUID()` a trail already uses.

Both fit the existing anonymous-ID design with no new auth requirement. No decision to build yet — captured here so the shape isn't lost before the feature's next picked up.

---

## Edge Functions: `brewery-sync` and `brewery-discover` kept separate

**ID:** `DEC-006`

**Decided:** Closure-check logic (`brewery-sync`) and discovery logic (`brewery-discover`) are two distinct Edge Functions, not one combined function.

**Why:** Different cost-tier exposure and different failure blast radius. A bug in discovery (which writes new rows) is a different risk profile from a bug in closure-checking (which flags/closes existing rows) — keeping them separate limits how much damage either can do on its own, and lets each be rate-limited, monitored, or paused independently.

---

## Closure detection: two-source agreement required before auto-close

**ID:** `DEC-005`

**Decided:** `is_active` only flips to `false` automatically when **both** Google Places API and NZBN agree a brewery is closed. A single Places signal alone writes to `flagged_for_review` instead, for manual confirmation.

**Why:** Places API alone isn't reliable enough to trust for an irreversible-feeling change (even though `is_active` is soft-delete and reversible, wrongly hiding a live brewery is a bad user-facing failure). NZBN integration isn't built yet, so the safety rule is: no single-source auto-close until there's a second, independent source to corroborate.

**Note:** This rule was nearly lost in a doc/code mismatch — an earlier draft of the automation plan didn't state it clearly enough, and was corrected before the closure-check function was written, to keep the doc and the code consistent.

---

## Soft delete over hard delete

**ID:** `DEC-004`

**Decided:** Breweries are marked inactive via an `is_active` boolean, never actually deleted from the table.

**Why:** Reversibility. A brewery flagged closed in error (or one that reopens) can be flipped back with a single update — a hard delete would need a full re-add, including re-verifying `website`, `place_id`, coordinates, and theming.

---

## Every brewery needs a `website` field and an explicit theme

**ID:** `DEC-003`

**Decided:** Two standing data-quality rules: (1) `website` must never be null — check and populate on every manual add, enforce in future automation; (2) every brewery must have an explicit entry in `getBreweryTheme`, reflecting its own branding — never falls back to default orange.

**Why:** Both were found as real gaps during a 17 July audit (7 breweries had null `website`) — codifying them as rules stops the same gap reopening as new breweries get added, manually or via automation.

---

## Temporary closures are a manual-entry feature, not automatable

**ID:** `DEC-002`

**Decided:** `status` / `status_note` fields (grey pin + badge + popup note) handle temporary closures, kept distinct from `is_active` (permanently gone) and `flagged_for_review` (source disagreement). Temporary closures are entered manually, not auto-detected.

**Why:** A brewery's own website won't reliably announce a temporary closure (confirmed by the Emporium Brewing/Kaikōura flood case) — there's no automatable signal to detect "closed for now" versus "closed for good," so it has to stay a manual call.

---

## Discovery misses multi-site brands — regional tourism pages fill the gap

**ID:** `DEC-001`

**Finding, not yet a fix:** Name-based discovery (Places API, excise list, Brewers Guild) treats multiple venues under one brand name as duplicates, so a second site for an existing brand gets silently skipped. Regional tourism board pages surface multi-site brands more reliably than name-matching does.

**Prompted by:** Garage Project Wild Workshop being missed by discovery despite Garage Project itself already being in the directory.

**Status:** Documented as a known blind spot in the automation plan; not yet built into the discovery function.
