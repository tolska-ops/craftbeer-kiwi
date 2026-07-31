# craftbeer.kiwi — Automated Brewery Discovery & Closure Detection

**Written:** 11 July 2026 · **Updated:** 31 July 2026 (added "Ongoing automation output: exceptions-only" section, formalising `DEC-032`)
**Purpose:** Living reference for the automation build — why it exists, the architecture, current status, and what's still ahead. Earlier versions of this doc were a forward-looking build plan; as of 20 July the core of both Edge Functions is written and deployed, and as of 27 July both have been successfully tested end-to-end for the first time — this version describes what's actually built, what's actually been proven to work, and what's still planned.

---

## Why this exists

All 23 breweries in the database were originally added by hand, plus a handful discovered by automation as of 27 July — researched and verified for most. That's fine at this scale. It doesn't scale to 200+ (a full national directory) without a lot of ongoing manual upkeep, and breweries genuinely do close, move, and change hands regularly — several early corrections (Fortune Favours closed, Tuatara relocated, Boneface changed owners) confirmed this isn't a hypothetical risk.

The goal: scheduled jobs that periodically check for new breweries and status changes on existing ones, so the directory stays current without Andy manually re-Googling every business every few months.

## The one deliberate trade-off

Full automation means changes publish to the live site without a human looking at them first. This is faster and hands-off, but it means:
- Google's `business_status` data can lag real-world closures by weeks
- A brewery temporarily closed (renovation, flood, etc.) could get flagged the same as permanently closed
- Google Places' search results are scoped to "anything matching this search," not "anything matching your exact category" — the first live discovery run (below) confirmed this in practice, not just in theory
- There's no way to fully eliminate these risks while staying hands-off — they're inherent to trusting third-party data without a review step

The safeguard built in regardless: **never hard-delete a brewery row.** Use an `is_active` flag instead. Automation can flip it to `false`, but the data isn't destroyed — a bad signal is a one-line fix, not lost work. See `craftbeer-kiwi-decisions.md` for the full soft-delete rationale.

---

## Ongoing automation output: exceptions-only

**Standing principle, `DEC-032` (31 July):** once initial buildout — national coverage, core schema, core features — is done, every recurring/scheduled check this project runs should default to reporting **only what changed or needs a human look**, not a full status dump of everything checked.

This already describes how `brewery-sync` was built (`flagged_for_review` plus the exceptions-report query below), but it wasn't written down as a rule until now — it was true of the first check almost by accident, not by design. Making it explicit means every future recurring check inherits the same shape without having to independently arrive at it:

- **`brewery-sync` (closure detection)** — already exceptions-only in practice: `{"checked":19,"flagged":0,"errors":[]}` is a small enough summary to be fine as-is, and the real "what needs a look" list lives in the `flagged_for_review` query, not the run's own log output.
- **Data-drift monitoring (planned, `concept-data-drift.md`)** — whatever this becomes, its output should be "these N brewery attributes look like they may have changed," not a full re-listing of every brewery's current data each run.
- **`brewery-discover`, once scheduled post-rollout** — should report new candidates found (ideally close to zero on most runs, once national coverage is real), not a "searched X, found Y existing, Z new" verbose log every time by default.
- **Periodic NZBN re-verification** (once NZBN is wired into `brewery-sync`) — same shape: report entities whose status changed since last check, not a full re-print of every brewery's NZBN standing.

**What this does *not* change:** the two-source-agreement gate on auto-closing a brewery (`DEC-005`) still applies regardless of output format — this principle is about what a check *reports*, not what it's allowed to *act on* unattended. A quiet, exceptions-only log is still only ever allowed to flag, not silently close, on a single-source signal.

**In practice:** default output/log format is the short exceptions list; a verbose "everything checked" mode can still exist behind an explicit parameter for debugging or a first-run sanity check, the same way `brewery-discover`'s `dryRun` is opt-out rather than removed entirely.

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

### NZBN API — registration submitted, awaiting approval
Account created at api.business.govt.nz (29 July), under Andy's personal RealMe login with "Craft Beer Kiwi Collective Limited" recorded as the organisation. Subscribed to the NZBN – v5 product via the subscription-key method (static key, no end-user OAuth needed — correct fit, since this is a server-side read-only lookup, not something requiring a logged-in user's consent to update records). Both a production and sandbox key were requested together under one subscription, state currently "Submitted" pending MBIE's approval (may include an API Agreement to sign). Once approved: sandbox key goes into `craftbeer-kiwi-DEV`'s config first, per the existing dev-first workflow; production key only ever touches the live Edge Function's environment, never committed to GitHub — same handling as the Places API key. This remains the single biggest gap between the current closure-check logic and its originally designed two-source-agreement standard (see below) until it's actually wired into `brewery-sync`.

### Supabase Edge Functions — both now successfully tested end-to-end

Two separate functions, deliberately kept apart (see `craftbeer-kiwi-decisions.md` for the cost-tier/blast-radius reasoning). **The `sb_secret_...` 401 issue that blocked testing for a week (see below) is now resolved for both.**

**`brewery-sync`** (closure-check) — written using the `withSupabase`/`@supabase/server` auth pattern. Successfully tested end-to-end twice: `{"checked":18,"flagged":0,"errors":[]}` (20 July, before Garage Project Wild Workshop was added by hand) and `{"checked":19,"flagged":0,"errors":[]}` (27 July, after the auth fix, matching the brewery count at that point in the session — before `brewery-discover`'s own run later the same day brought the total to 23). Logic:
1. For every brewery with a `place_id`, call the Places API's place details endpoint and read `businessStatus`.
2. Per the two-source-agreement rule (see `craftbeer-kiwi-decisions.md`): a `CLOSED_PERMANENTLY` signal from Places alone writes `flagged_for_review = true`, **not** `is_active = false`, because NZBN isn't wired in yet to corroborate.
3. `last_verified` is updated regardless of outcome.

**`brewery-discover`** (discovery) — written and deployed, and as of 27 July **successfully tested end-to-end for the first time**: `{"found":20,"inserted":12,"skipped":8}`. Logic as originally built:
1. Call the Places API text search (`brewery`-style query, biased to the Wellington region).
2. For each result, check if its `place_id` already exists → skip if so (8 skipped this run — existing breweries correctly recognised).
3. If new: insert a row with name, address, lat/long, website, `place_id`, `is_active = true`, `last_verified = now()`.

**Updated 31 July** — step 3 now geocodes each candidate's address via Mapbox rather than storing Places' own coordinates/address directly (Google's Maps Platform terms don't allow displaying Places content on a non-Google map, and craftbeer.kiwi uses Mapbox — see `craftbeer-kiwi-decisions.md`, `DEC-033`, for the full reasoning). The insert now also explicitly sets `is_published = false`/`has_theme = false`, fixing a separate bug where these were previously left unset and would have failed the `theme_required_to_publish` constraint on the next live run. Re-tested dry-run against both `craftbeer-kiwi-DEV` (20 found, 0 errors) and production (20 found, 18 correctly deduped, 2 genuine new candidates, cleanly geocoded) — confirms both the geocoding fix and the existing dedup logic work correctly.

The `dryRun` safety flag (return what would be inserted without writing to the live table) was discussed back on 20 July as worth adding before the first real run — **this did not get built before the 27 July run happened, and the results from that run are exactly the scenario it was meant to catch.** It was subsequently built 28 July as dry-run-by-default (`?live=true` forces a real write) — see `craftbeer-kiwi-decisions.md` `DEC-014`/`DEC-018` — though a 29 July security audit found the actual shipped code still read the flag opt-in rather than opt-out, fixed the same day (see `craftbeer-kiwi-security.md`). All dry-run testing referenced above (31 July) confirms this default-safe behaviour is genuinely working, not just documented as working.

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

This is the first, concrete example of the "Ongoing automation output: exceptions-only" principle above — built before that principle was written down as a standing rule, now the reference pattern for every future check.

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

### OpenStreetMap / Overpass API — candidate discovery cross-check, not yet actioned (found 29 July)

Surfaced while looking at what other providers (beyond Google and MBIE) offer relevant API access. OpenStreetMap is a free, crowdsourced global map database, entirely separate from Google's Places index — different contributors, different data model, queried via the free Overpass API (Overpass QL, its own query language, well documented).

**Why it's a genuinely different signal, not a duplicate of Places:** OSM has purpose-built tags for this exact distinction — `craft=brewery` / `microbrewery=yes` for actual breweries, versus `amenity=pub` / `amenity=bar` for venues that just sell beer. That's the same brewery-vs-bar problem `venue_type` was built to solve after the fact from Places' broader search results — OSM's tagging model draws the line at the source, for anyone who's bothered to tag it correctly.

**Proposed use — cross-check, not replacement:** run an Overpass query for `craft=brewery`/`microbrewery=yes` in a region alongside the existing `brewery-discover` Places run, and diff the two result sets. Three useful outcomes: (1) OSM has a brewery Places missed entirely — worth a manual look; (2) Places has one OSM doesn't — expected, since OSM coverage depends on volunteer tagging; (3) both agree — mild extra confidence on an already-found brewery. Not proposed as a primary source, since coverage is patchy by nature (crowdsourced, no guarantee any given NZ brewery has been tagged, let alone tagged correctly).

**Cost:** genuinely free — no per-request billing, unlike every Places-side option considered so far (Text Search, Aggregate). Public Overpass instances do rate-limit (10,000 queries/day, 5GB/day, 180s query timeout), which is nowhere near a constraint at this project's scale.

**Not yet actioned:** no NZ coverage quality check has been done yet — worth a quick manual Overpass Turbo query against Wellington's known 23 breweries as a first test, to see how many are actually tagged correctly before relying on it for anything. If Wellington's coverage (a market Andy can personally verify) turns out patchy, that's a reasonable proxy for what to expect elsewhere.

### RateBeer — candidate closure-status cross-check, not yet actioned (found 29 July)

Surfaced while checking whether Untappd had any real alternatives, after confirming Untappd's own API has been closed to new applicants for years despite genuine NZ usage (NZ-specific badges, an NZ top-rated-breweries page, real check-in activity at NZ venues). RateBeer, by contrast, still runs an open, self-service API request process (GraphQL, `api.r8.beer`, sandbox + production environments, ~5,000 calls/month starting allowance, 7–10 business day turnaround) — a live option Untappd no longer is.

**Why it's more relevant than a typical beer-rating platform:** RateBeer's New Zealand brewery listing explicitly tracks **236 active and 103 closed** breweries, tagged as such per entry — not just ratings and reviews, an actual maintained active/closed status per brewery. That's the same distinction `is_active` exists to capture, from a source with no relationship to Places or NZBN, and (unlike BeerAdvocate, whose own NZ pages admit their dataset is too small for a complete top-100 list) apparently enough NZ volume to be worth a look.

**Proposed use — same cross-check pattern as OSM, not a primary source:** if the API (or even manual lookup) can return a brewery's active/closed status, that's a fourth possible input alongside Places, NZBN, and Insolvency Register — most useful as a tie-breaker or extra confidence signal, not something to wire into the two-source-agreement auto-close logic on its own. Crowd-maintained data carries the same caveat as OSM: accuracy depends on RateBeer's own community bothering to mark a brewery closed, not a guarantee.

**Not yet actioned:** haven't yet checked how many of Wellington's 23 breweries actually appear in RateBeer's NZ list, or how current the active/closed tagging looks in practice — "236 active, 103 closed" confirms real volume exists nationally, but says nothing yet about Wellington-specific coverage or freshness. Worth a manual spot-check (browsing the NZ breweries list, no API request needed for that) before deciding whether requesting API access is worth the 7–10 day wait.

## Phase 2 (future enhancement, not part of the current build)

Ministry of Justice — Register of Licences & Certificates, as a third, even-stronger verification signal. A brewery legally cannot sell alcohol without an active on-licence or off-licence under the Sale and Supply of Alcohol Act 2012 — so a brewery dropping off this register is about as authoritative a "no longer trading" signal as exists.

Not part of the current build because it's a bulk file (updated quarterly — Feb/May/Aug/Nov), not a live API — a different integration pattern (download + parse + match) from the live Places/NZBN API calls. Worth adding once the core two-source system is working and proven, as a periodic extra cross-check rather than something the scheduled job queries directly.

### MBIE Insolvency Register API — candidate third source, live API (found 29 July)

While registering for the NZBN API, a wider look at MBIE's API portal (`api.business.govt.nz`) surfaced the **Insolvency Register API** as a genuinely relevant addition, distinct from the other MBIE APIs reviewed (Companies Register, IPONZ, LBP, MVTR, NZP&M, PPSR, RSM, Tenancy Services, CERT NZ — all assessed and ruled out as not applicable to this project).

**What it does:** an on-demand, name/number search against NZ's public insolvency and debt repayment order registers. Unlike NZBN's company-status field (which can show a stale or superseded "In Liquidation" status without indicating whether that's the *current* trading entity — see Boneface below), this queries the insolvency register directly for active cases.

**Why it's worth adding:** directly resolves the exact ambiguity the 28 July NZBN backfill ran into with Boneface Brewing Co — NZBN shows "In Liquidation" but it's unclear whether that reflects the current entity or a pre-ownership-change record (watchlisted, not actioned, per `craftbeer-kiwi-decisions.md` DEC-021). A live insolvency-register check could turn that from "watchlisted, unclear" into either "confirmed active insolvency case, escalate" or "no active case, clear the watchlist flag" — same value for any future ambiguous NZBN liquidation status.

**Fit with the existing two-source-agreement rule:** doesn't replace NZBN in that rule, but strengthens it — could act as a tie-breaker specifically for liquidation-status ambiguity, or eventually as a genuine third source alongside Places + NZBN for the closure-check logic once NZBN itself is wired into `brewery-sync`.

**Integration effort:** low incrementally — same MBIE API portal, same account already used for the NZBN registration (see "NZBN API" status above). MBIE's own guidance is to query on-demand rather than mirror the register locally, which matches the project's existing pattern (no local copy of Places/NZBN data either, beyond what's cached in `breweries`).

**Sequencing:** add to the same subscription request once the NZBN sandbox key comes through, rather than treating it as separate scope. Not a blocker on anything currently in progress.

### Other MBIE APIs reviewed and ruled out (29 July)

For completeness — `api.business.govt.nz` hosts APIs beyond NZBN and Insolvency Register, all checked and not a fit for this project:

- **Companies Register API** — sounds relevant, but it's for *creating/maintaining* companies a user has authority over (filing annual returns, updating directors), not for looking up other businesses. MBIE's own docs point back to the NZBN API for lookups, which is already the plan.
- **IPONZ** (trademarks/patents) — could theoretically check brand trademark registration, but that's a brand-dispute use case, not closure detection. Not pursued.
- **PPSR** (security interests over property/equipment) — a brewery's equipment showing a registered security interest doesn't reliably mean financial distress (most commercial financing shows up here); too noisy a signal for the effort of integrating.
- **CERT NZ, LBP, MVTR, NZP&M, RSM, Tenancy Services** — no plausible connection to a brewery directory (cybersecurity incident reporting, building practitioners, motor vehicle dealers, petroleum/minerals, radio spectrum, residential tenancy).

## National expansion: phased regional rollout

**Decided 28 July:** expansion beyond Wellington will proceed region by region, with a mandatory dry-run + manual triage gate per region before anything goes live. This supersedes the "region scope" open question below — national-from-the-start was rejected as too risky given the 27 July run's ~50% false-positive rate in a market Andy knows personally; that error rate has no reason to be lower in unfamiliar regions, and there'd be no personal gut-check to catch it.

### Prerequisites (block the entire rollout, not just region 2 onwards)

**ID convention:** each prerequisite below carries a permanent `AP-PREREQ-N` ID, assigned once and never renumbered - same pattern as `craftbeer-kiwi-decisions.md`'s `DEC-NNN` and `craftbeer-kiwi-todo.md`'s `TD-NNN` IDs. Added 30 July after these items were already being referenced elsewhere by plain position number ("prerequisite #3"), which is exactly the kind of reference that breaks if this list is ever reordered.

1. **`AP-PREREQ-1` — `dryRun` flag on `brewery-discover`.** Already a standing to-do; now a hard blocker rather than a nice-to-have. Must return candidate rows without writing to the live table. **Resolved 28 July, re-confirmed working 31 July** — dry-run is now the default (`?live=true` forces a real write); dry-run tested against both DEV and production on 31 July alongside the Mapbox re-sourcing fix (`craftbeer-kiwi-decisions.md`, `DEC-033`).
2. **`AP-PREREQ-2` — Query narrowing decision.** Investigate whether Places' text search API supports excluding bar/pub categories, to reduce the false-positive rate before multiplying it across 10+ regions. If it can't be narrowed at the API level, the manual-triage step per region needs to be budgeted as real time in each region's rollout, not treated as a formality.
3. **`AP-PREREQ-3` — Region boundary definition.** Decide whether "a region" means a Places API geographic bounding box or a text-query bias per city/district (current Wellington query uses the latter). This determines how many separate `brewery-discover` runs a full national rollout actually is. **Resolved 30 July** — `region` column added and backfilled using the Brewers Guild of NZ's own regional groupings rather than inventing a bespoke boundary scheme. See `craftbeer-kiwi-decisions.md` (`DEC-026`) for the full writeup, and its flagged Guild-taxonomy-vs-rollout-phase naming mismatch (Guild groups Northland+Auckland together and keeps Waikato/Bay of Plenty separate, while the rollout phases below group "Auckland and Canterbury" together then "Waikato, Bay of Plenty, Otago" as a second batch) - a rollout-phase-to-region lookup will be needed at expansion time, not yet built.

None of the phase work below should start until `AP-PREREQ-2` is resolved (`AP-PREREQ-1` and `AP-PREREQ-3` are now done).

**Candidate tool for `AP-PREREQ-3` — Places Aggregate API (found 29 July).** Google's Places Aggregate API (formerly Places Insights API, GA as of early 2026) returns place counts/density for a given area and place type, rather than individual results — could answer "how many brewery-type places does Google think exist in Auckland" as a single query before running a full `brewery-discover` pass there. Two possible uses: (1) sizing the manual-triage workload for a region ahead of time, so the per-region workflow's triage step isn't a surprise; (2) a cheap completeness check — comparing Aggregate's count against what Text Search actually returned, to catch a region where discovery silently missed a chunk. **Not yet actioned:** it's a separate billed API on top of existing Places usage, and NZ coverage / per-request pricing haven't been confirmed against the Cloud Console — needs checking before it's relied on, not assumed from Google's marketing pages. Now that `AP-PREREQ-3` itself is resolved via the Guild taxonomy, this tool is optional supplementary tooling rather than blocking - worth revisiting only if a completeness check against Places' own counts becomes useful later.

### Phase order

Ordered by brewery density and how well Andy can personally sanity-check results, not alphabetically or by population:

1. **Auckland and Canterbury (Christchurch)** — largest brewery scenes, highest volume-per-dry-run-effort. Less personally familiar than Wellington, so treat the first dry run here as a genuine test of the whole process, not a formality — expect the false-positive rate to need real scrutiny.
2. **Waikato, Bay of Plenty, Otago** — smaller batches, lower risk if something slips through undetected.
3. **Remaining regions** — likely batched together in one or two dry runs rather than one region at a time, since brewery density won't justify a dedicated session each.

### Per-region workflow

1. Run `brewery-discover` in dry-run mode for the region; review candidate rows.
2. Manually triage: genuine breweries vs. bars/pubs (`venue_type`) vs. near-duplicates of existing multi-site brands. Per the known multi-site blind spot, cross-check against a regional tourism board page or similar for the region, not just the Places results — name-based matching alone has already been shown to both miss and duplicate multi-site brands unpredictably.
3. Insert triaged rows to the live table.
4. Add `getBreweryTheme` entries immediately for every new brewery — do not let a region go live with entries falling back to the default theme, per the existing standing rule.
5. Update brewery counts and region status in `craftbeer-kiwi-todo.md` and `README.md` before starting the next region.

### Related risks flagged for this rollout specifically

- **Discovery automation's cost/benefit case changes.** The "Timing of further automation investment" open question below assumed discovery only pays off once new breweries arrive faster than by hand — national expansion is plausibly the point where that becomes true, which strengthens the case for finishing `dryRun` now rather than deferring it further.
- **Theme colour uniqueness doesn't scale automatically.** `getBreweryTheme`'s per-brewery colour assignment is currently manual and eyeballed for distinctiveness. That gets harder to keep meaningfully distinct well past current brewery counts. Worth deciding on an assignment strategy (e.g. algorithmic hue rotation with manual override for brand-colour matches) before this becomes a slog of comparing similar oranges across regions — not yet designed, flagged here as a dependency of the rollout rather than solved.
- **Distribution has no plan yet**, per the existing to-do — worth sequencing alongside expansion rather than after it.
- **Multi-country domain/branding strategy stays parked** — this rollout only concerns NZ regions, not the Australia question.

---

## Open questions

- **Region scope:** *(original question: start with Wellington-only automation, or build for national from the start?)* **Resolved 28 July** — region-by-region rollout with a dry-run gate per region, per the National Expansion Plan above.
- **Schedule frequency:** weekly is a reasonable default once both functions are proven, but worth deciding based on how "urgent" catching a closure feels vs. API cost.
- **Manual override:** should there be a simple way to force `is_active = false` on a brewery manually (e.g. if a closure is heard about before automation catches it)? Doing it via Supabase's Table Editor directly is fine for now — no need to build UI for this yet.
- **Timing of further automation investment:** raised 25 July — `brewery-sync`/`brewery-discover` were built for a directory of 19 breweries; automating discovery only really pays off once new breweries are being added faster than by hand, which isn't the case yet. Not a reason to abandon what's built, but worth weighing against instrumentation/distribution work when planning the next session's effort (see `craftbeer-kiwi-todo.md`).
- **New, added 27 July — should discovery search be narrowed to reduce bar false-positives?** Worth considering a tighter Places text-search query (e.g. explicitly excluding "bar"/"pub" category results, if the API supports that kind of filter) versus continuing to rely on manual triage after each run. Not yet investigated which approach is actually feasible with Places' search API.
- **New, added 27 July — is there a future product case for a distinct "pubs & bars serving craft beer" layer/filter?** Andy floated this as a possible future feature, which is part of why `venue_type` was designed as an open string field rather than a simple `is_brewery` boolean — the excluded venues stay in the database with the right label, ready to support that if it's ever built, rather than needing to be rediscovered from scratch.
- **New, added 28 July — should the MoJ Register of Licences & Certificates also feed the discovery cross-reference step, not just closure verification?** Originally scoped in Phase 2 purely as a third closure-verification signal, but it's arguably a stronger discovery source too — a real legal record (active on/off-licence) rather than a search-relevance guess, which beats the already-known-stale Brewers Association list and is more authoritative than the tourism-page cross-check. Not free, though: it's a quarterly bulk file, not a live API, so using it means download + parse + fuzzy name/address matching against candidates — closer in effort to a small version of `brewery-discover` itself than to just adding a box to the cross-reference step. If pursued, sequencing idea: use the most recent quarterly file at rollout time rather than waiting on it, then periodically re-run it as a standing re-verify pass per region once a newer file drops — which also doubles as ongoing input to the closure-detection use case it was originally scoped for.
- **New, added 28 July, resolved 28 July — should `breweries` get an `nzbn` column, and should populating it ever be automated?** Column added (`nzbn` text, plus `nzbn_entity_name` text for the registered legal name). **Automation question answered by doing the manual pass first:** all 23 breweries checked by hand, several genuinely ambiguous (multiple candidate entities, trading name diverging from legal name, conglomerate-owned brands) requiring judgment calls a simple name search couldn't have made automatically. Confirms the original estimate — this would have been a real, separate build, not a quick add-on. Manual lookup during triage remains the right approach; automating it isn't worth revisiting unless brewery volume grows enough to make manual lookup itself the bottleneck. Full findings, including two confirmed multi-site NZBN matches and two conglomerate-ownership complications, in `craftbeer-kiwi-decisions.md`.

- **New, added 29 July — should the Insolvency Register API be subscribed to alongside NZBN, or held back until NZBN itself is wired into `brewery-sync`?** Leaning towards subscribing now (same account, low marginal effort) but not wiring it into any automated logic until NZBN's own two-source-agreement upgrade is live and proven — avoids building against a third source before the second one is actually working end-to-end. Not yet decided for certain.

## What needs building next, in order

1. *Resolve the Supabase `sb_secret_...` key issue* — **done 27 July.** Root cause was an incomplete `auth: "secret"` mode missing the required key name; fixed to `auth: "secret:brewery_sync_v2"` on both functions.
2. *Successfully test `brewery-discover` end-to-end* — **done 27 July**, `{"found":20,"inserted":12,"skipped":8}`, followed by manual triage of all 12 new rows.
3. **Add the `dryRun` flag to `brewery-discover`** — now a hard blocker on the national expansion rollout above, not just a nice-to-have for the next Wellington run.
4. Resolve the query-narrowing and region-boundary questions in the National Expansion Plan above.
5. Run the first regional dry run (Auckland or Canterbury) and validate the per-region workflow before treating it as repeatable.
6. Register for the NZBN API and wire it into `brewery-sync`, upgrading closure detection to real two-source auto-close. **Registration submitted 29 July, awaiting MBIE approval** — once approved, wire the sandbox key into `craftbeer-kiwi-DEV` first.
7. Add the Anthropic description-generation step for newly-discovered breweries.
8. Schedule both functions (`pg_cron` or Supabase's built-in cron) — now that both have a proven successful run, but given the discovery quality findings, worth holding off on scheduling `brewery-discover` specifically until either the `dryRun` flag or a narrower search query is in place.
