# craftbeer.kiwi — Automated Brewery Discovery & Closure Detection

**Written:** 11 July 2026 · **Updated:** 27 July 2026
**Purpose:** Living reference for the automation build — why it exists, the architecture, current status, and what's still ahead. Earlier versions of this doc were a forward-looking build plan; as of 20 July the core of both Edge Functions is written and deployed, and as of 27 July both have been successfully tested end-to-end for the first time — this version describes what's actually built, what's actually been proven to work, and what's still planned.

---

## Why this exists

All 19 breweries in the database were originally added by hand — researched, verified, and typed in manually. That's fine at 19. It doesn't scale to 200+ (a full national directory) without a lot of ongoing manual upkeep, and breweries genuinely do close, move, and change hands regularly — several early corrections (Fortune Favours closed, Tuatara relocated, Boneface changed owners) confirmed this isn't a hypothetical risk.

The goal: scheduled jobs that periodically check for new breweries and status changes on existing ones, so the directory stays current without Andy manually re-Googling every business every few months.

## The one deliberate trade-off

Full automation means changes publish to the live site without a human looking at them first. This is faster and hands-off, but it means:
- Google's `business_status` data can lag real-world closures by weeks
- A brewery temporarily closed (renovation, flood, etc.) could get flagged the same as permanently closed
- Google Places' search results are scoped to "anything matching this search," not "anything matching your exact category" — the first live discovery run (below) confirmed this in practice, not just in theory
- There's no way to fully eliminate these risks while staying hands-off — they're inherent to trusting third-party data without a review step

The safeguard built in regardless: **never hard-delete a brewery row.** Use an `is_active` flag instead. Automation can flip it to `false`, but the data isn't destroyed — a bad signal is a one-line fix, not lost work. See `craftbeer-kiwi-decisions.md` for the full soft-delete rationale.

---

## Current status (as of 27 July)

### Schema — done, now includes `venue_type`
All automation-support columns are live on `breweries`:

```sql
alter table breweries add column is_active boolean default true;
alter table breweries add column last_verified timestamp with time zone default now();
alter table breweries add column place_id text;
alter table breweries add column flagged_for_review boolean default false;
alter table breweries add column venue_type text not null default 'brewery';
```

- `is_active` — soft-delete flag; the app filters `where is_active = true`.
- `last_verified` — timestamp of the last automated check.
- `place_id` — Google's unique ID per place, backfilled for all breweries. Lets automated syncs match reliably instead of fragile name/address text matching. **Known limitation, confirmed 27 July:** this only catches exact re-finds of the same Places listing — it doesn't catch Google returning a *second, different* `place_id` for what's actually the same physical business (see "Discovery quality issues" below).
- `flagged_for_review` — set when verification sources disagree, or a brewery's freshly auto-inserted. Surfaced by the exceptions report (below).
- `venue_type` — added 27 July, directly in response to the first live discovery run. Values so far: `'brewery'` (default) and `'bar'`. Lets the frontend correctly exclude venues that Places' search legitimately returned but that aren't actually breweries (see below), without deleting the row or losing the `place_id` (which would cause them to be rediscovered on the next run).

`status` / `status_note` columns were added separately to support temporary-closure display (grey pin, badge, popup note) — see `craftbeer-kiwi-decisions.md`. These are manual-entry only, distinct from the automated `is_active`/`flagged_for_review` fields.

### Google Cloud + Places API — done
Set up as a business account under Craft Beer Kiwi Collective Limited: project created, billing enabled, Places API (New) enabled, restricted API key generated and stored in Bitwarden as a Secure Note. Application (IP) restriction is deliberately deferred until the Edge Functions' egress IPs are known.

### NZBN API — not started
Registration and subscription-key setup at business.govt.nz hasn't happened yet. This remains the single biggest gap between the current closure-check logic and its originally designed two-source-agreement standard (see below).

### Supabase Edge Functions — both now successfully tested end-to-end

Two separate functions, deliberately kept apart (see `craftbeer-kiwi-decisions.md` for the cost-tier/blast-radius reasoning). **The `sb_secret_...` 401 issue that blocked testing for a week (see below) is now resolved for both.**

**`brewery-sync`** (closure-check) — written using the `withSupabase`/`@supabase/server` auth pattern. Successfully tested end-to-end twice: `{"checked":18,"flagged":0,"errors":[]}` (20 July, before Garage Project Wild Workshop was added by hand) and `{"checked":19,"flagged":0,"errors":[]}` (27 July, after the auth fix, matching the current brewery count). Logic:
1. For every brewery with a `place_id`, call the Places API's place details endpoint and read `businessStatus`.
2. Per the two-source-agreement rule (see `craftbeer-kiwi-decisions.md`): a `CLOSED_PERMANENTLY` signal from Places alone writes `flagged_for_review = true`, **not** `is_active = false`, because NZBN isn't wired in yet to corroborate.
3. `last_verified` is updated regardless of outcome.

**`brewery-discover`** (discovery) — written and deployed, and as of 27 July **successfully tested end-to-end for the first time**: `{"found":20,"inserted":12,"skipped":8}`. Logic (as built and now confirmed working):
1. Call the Places API text search (`brewery`-style query, biased to the Wellington region).
2. For each result, check if its `place_id` already exists → skip if so (8 skipped this run — existing breweries correctly recognised).
3. If new: insert a row with name, address, lat/long, website, `place_id`, `is_active = true`, `last_verified = now()`.

A `dryRun` safety flag (return what would be inserted without writing to the live table) was discussed back on 20 July as worth adding before the first real run — **this did not get built before the first run happened, and the results below are exactly the scenario it was meant to catch.** Still worth building before any future unsupervised run.

**Fixed 27 July — the actual root cause of the `sb_secret_...` 401 issue:** not a Supabase platform bug after all. `@supabase/server`'s secret-key auth mode requires a *named* key — the code must specify `auth: "secret:<name>"`, where `<name>` matches the label given to the key in Supabase's Settings → API Keys screen. Both functions were originally written with just `auth: "secret"` (no name), which the SDK can't match to anything, producing a generic "invalid credentials" 401 regardless of which valid key was sent. Fixed by changing both functions to `auth: "secret:brewery_sync_v2"` (the name of the currently-active secret key) and redeploying. Confirmed working via the dashboard's test panel, sending the key only in the `apikey` header (not `Authorization` — that header is reserved for user-JWT auth mode, a different pattern entirely, and sending an API key there is a documented common mistake per Supabase's own docs).

### Discovery quality issues — found during the first live run, 27 July

The first successful `brewery-discover` run surfaced two real gaps, both worth documenting properly rather than treating as one-off cleanup:

**1. Places' text search returns bars/pubs alongside actual breweries.** Of the 12 newly-inserted rows, roughly half turned out to be craft beer bars — venues that pour a wide range of beers (sometimes including a specific brand's beer prominently) but don't brew on-site themselves: The Malthouse, Little Beer Quarter, Golding's Free Dive, The Rogue & Vagabond, Churly's Willis Lane, and Shed 22 (a general function-venue, not beer-related at all). This isn't a bug in Places — a "craft beer"-style search query is a legitimately broad match for Google's index, and these venues are genuinely relevant results for that search. It's a scope mismatch between what the API answers and what the directory actually wants. Fixed reactively this time by adding `venue_type` and manually setting these six to `'bar'`. Longer-term, worth considering a tighter search query or a keyword-based post-filter (e.g. excluding results whose Places category is "bar" rather than "brewery"), to reduce how much manual triage each future discovery run needs.

**2. `place_id`-only dedup misses same-business duplicate listings.** "Garage Project Aro Taproom" (91 Aro Street) was inserted as a "new" brewery, but is almost certainly the same physical location as the existing "Garage Project" entry (68 Aro Street, same suburb) — Places appears to have a second listing for the same taproom under a different name, with its own distinct `place_id`. Since dedup only checks "does this exact `place_id` already exist," it had no way to catch this. Fixed by setting `is_active = false` on the duplicate row (not `venue_type = 'bar'` — it correctly stays labelled as a brewery, since it is one, just a duplicate entry for one already in the directory) — this keeps its `place_id` "known" so it won't be silently re-flagged as new on a future run, while hiding it from the map. This is a distinct blind spot from the already-known "multi-site brands get missed by name-matching" issue (Garage Project Wild Workshop, 17 July) — that one was about *missing* a genuinely separate site; this one is about a *single* site getting counted twice under two different listings.

**Three ambiguous cases resolved by manual judgement, not automatable rules:** Panhead Tory Street, Three Sisters Brewery Ltd (Wellington outpost), and Double Vision Brewing's Island Bay site were all confirmed (two by Andy's local knowledge, all consistent with the pattern) to be genuine brand-operated taprooms rather than independent third-party venues, despite functioning more like bars/restaurants day-to-day and not brewing on-site themselves. Kept as `venue_type = 'brewery'`. Worth noting for consistency: this is the same underlying situation as the six excluded bars above (a venue that sells a brand's beer, doesn't brew it) — the distinguishing factor used was *is this venue actually operated by the brewery itself*, not *does brewing happen on-site*. This distinction isn't something Places' data can answer directly; it required outside knowledge or research each time.

Neither function is scheduled yet — both are manual-trigger only, and now that both have a proven successful run, the discovery quality findings above are a stronger reason to keep discovery manual-trigger-only a while longer (so each run's new insertions can be triaged) rather than the earlier "trigger only once proven working" reasoning, which is now technically satisfied but doesn't fully cover the quality issue.

### Anthropic API description-generation step — not started
Planned to auto-draft a 1-2 sentence description for newly-discovered breweries, likely inside `brewery-discover` once its core discovery logic is proven working. Not decided for certain that it lands there rather than as a separate step.

### Known blind spot: multi-site brands
Name-based discovery (this function, plus the Places API and excise-list cross-checks) treats multiple venues under one brand as duplicates, so a second site for an existing brand can be silently skipped. Regional tourism board pages surface multi-site brands more reliably than name-matching does. Found via Garage Project Wild Workshop being missed by discovery despite Garage Project already being in the directory (added by hand as brewery #19 instead). See `craftbeer-kiwi-decisions.md` for the full finding. See also "Discovery quality issues" above for the related-but-distinct duplicate-listing blind spot found 27 July.

---

## Exceptions report

Rather than `flagged_for_review` sitting quietly in the table, one saved query surfaces everything worth a human look:

```sql
select name, address, is_active, venue_type, last_verified, flagged_for_review
from breweries
where flagged_for_review = true
   or last_verified < now() - interval '14 days'
order by last_verified asc;
```

(Updated 27 July to include `venue_type` in the output, so a reviewer can see at a glance whether a flagged row has already been triaged as a bar/duplicate or still needs a decision.)

This catches three distinct situations in one place:
- **Source disagreement** — Places and NZBN didn't agree on a closure (once NZBN is wired in), so nothing was auto-published, but it's flagged for a manual check.
- **Newly auto-inserted breweries** — worth a quick eyeball before fully trusting an automated insert, at least while the system's new and unproven. The 27 July run confirmed this isn't just a theoretical precaution — roughly half the new insertions needed reclassifying.
- **Stale rows** — anything the automation failed to successfully check recently (API error, rate limit, name-matching failure), so nothing silently unverified is being trusted.

Kept as a saved SQL query in Supabase's SQL Editor for now rather than a dedicated admin page — a proper review UI is a nice-to-have once the underlying automation is proven reliable, not a day-one requirement.

---

## Other sources investigated, and why they didn't make the automated design

- **Ministry of Justice Register of Licences & Certificates** — the strongest signal in principle (a brewery can't legally sell alcohol without an active on/off-licence), but it's a quarterly bulk file, not a live API. Filed as a Phase 2 enhancement below.
- **Untappd** — good for a human to manually spot-check whether a brewery's still trading, but its public API has been largely closed to new developers for some years. Not usable as an automated pipeline input.
- **Facebook / Instagram** — same story: good manual check, no realistic API path for a small side project (Meta requires business app review).
- **Brewers Guild of NZ / NZ Ale Trail** — a real industry body with a member directory, useful for manual discovery cross-checks, but no API and not appropriate to scrape.
- **Brewers Association of NZ national list** (brewers.org.nz/beer-in-nz) — confirmed stale (dated 2016 at the bottom of the page; missing Waitoa and Fortune Favours; includes mainstream corporate brands alongside genuine craft breweries). Not a data source to trust directly, but worth a manual scan as a name checklist when expanding beyond Wellington.
- **NZ Customs Excise CCA list** — cross-checked once against all 18 (at the time) breweries; caveat identified: it records manufacturing addresses only, not public-facing taprooms, so address mismatches against it aren't reliable error signals on their own.

## Phase 2 (future enhancement, not part of the current build)

Ministry of Justice — Register of Licences & Certificates, as a third, even-stronger verification signal. A brewery legally cannot sell alcohol without an active on-licence or off-licence under the Sale and Supply of Alcohol Act 2012 — so a brewery dropping off this register is about as authoritative a "no longer trading" signal as exists.

Not part of the current build because it's a bulk file (updated quarterly — Feb/May/Aug/Nov), not a live API — a different integration pattern (download + parse + match) from the live Places/NZBN API calls. Worth adding once the core two-source system is working and proven, as a periodic extra cross-check rather than something the scheduled job queries directly.

## Open questions

- **Region scope:** start with Wellington-only automation (matches current data), or build for national from the start? Recommendation stands: keep Wellington-scoped for now, it's simpler to verify correctness — expand the search query's geographic bounds later once trusted.
- **Schedule frequency:** weekly is a reasonable default once both functions are proven, but worth deciding based on how "urgent" catching a closure feels vs. API cost.
- **Manual override:** should there be a simple way to force `is_active = false` on a brewery manually (e.g. if a closure is heard about before automation catches it)? Doing it via Supabase's Table Editor directly is fine for now — no need to build UI for this yet.
- **Timing of further automation investment:** raised 25 July — `brewery-sync`/`brewery-discover` were built for a directory of 19 breweries; automating discovery only really pays off once new breweries are being added faster than by hand, which isn't the case yet. Not a reason to abandon what's built, but worth weighing against instrumentation/distribution work when planning the next session's effort (see `craftbeer-kiwi-todo.md`).
- **New, added 27 July — should discovery search be narrowed to reduce bar false-positives?** Worth considering a tighter Places text-search query (e.g. explicitly excluding "bar"/"pub" category results, if the API supports that kind of filter) versus continuing to rely on manual triage after each run. Not yet investigated which approach is actually feasible with Places' search API.
- **New, added 27 July — is there a future product case for a distinct "pubs & bars serving craft beer" layer/filter?** Andy floated this as a possible future feature, which is part of why `venue_type` was designed as an open string field rather than a simple `is_brewery` boolean — the excluded venues stay in the database with the right label, ready to support that if it's ever built, rather than needing to be rediscovered from scratch.

## What needs building next, in order

1. ~~Resolve the Supabase `sb_secret_...` key issue~~ — **done 27 July.** Root cause was an incomplete `auth: "secret"` mode missing the required key name; fixed to `auth: "secret:brewery_sync_v2"` on both functions.
2. Add the `dryRun` flag to `brewery-discover` — still not built, and the 27 July run is a concrete example of why it's worth doing before the *next* live run, not just the first one.
3. ~~Successfully test `brewery-discover` end-to-end~~ — **done 27 July**, `{"found":20,"inserted":12,"skipped":8}`, followed by manual triage of all 12 new rows.
4. Consider narrowing the discovery search query to reduce bar/pub false-positives (see Open Questions above) — not yet investigated.
5. Register for the NZBN API and wire it into `brewery-sync`, upgrading closure detection to real two-source auto-close.
6. Add the Anthropic description-generation step for newly-discovered breweries.
7. Schedule both functions (`pg_cron` or Supabase's built-in cron) — now that both have a proven successful run, but given the discovery quality findings, worth holding off on scheduling `brewery-discover` specifically until either the `dryRun` flag or a narrower search query is in place, so future runs don't silently insert unreviewed bar listings on autopilot.
