# craftbeer.kiwi — Automated Brewery Discovery & Closure Detection

**Written:** 11 July 2026 · **Updated:** 25 July 2026
**Purpose:** Pick-up guide for ongoing work on brewery data automation. Covers why this is being built, the architecture, current build status, and open questions.

## 25 July update — where things actually stand

The single combined Edge Function originally planned below (§3) was **split into two separate functions** when it came time to build it, for cost-tier isolation and to limit the blast radius of a bug in either one:

- **`brewery-sync`** (closure-check only) — written, deployed, and successfully tested end-to-end on 20 July: `{"checked":18,"flagged":0,"errors":[]}`. Implements the two-source-agreement logic below correctly — a lone Google Places "closed" signal writes to `flagged_for_review` rather than auto-flipping `is_active`, since NZBN isn't wired in yet.
- **`brewery-discover`** (new brewery discovery only) — written and deployed 20 July, but **not yet confirmed working end-to-end** — no test run has verified it correctly finds, dedupes, and inserts new breweries. A `dryRun` safety flag (return what would be inserted without writing to the live table) was discussed as worth adding before the first real run, given it writes directly to the live `breweries` table. Not yet implemented — Andy's call once testing is unblocked.
- The Anthropic description-generation step (§3, item 3 below) hasn't been built into either function yet; likely lands in `brewery-discover` once its core logic is proven, but not decided for certain.

**Blocking issue:** new-format `sb_secret_...` Supabase keys consistently return `401 INVALID_CREDENTIALS` against both deployed functions — confirmed with two independently generated keys, tested via PowerShell, curl, and the Supabase dashboard test panel. This has been confirmed as a genuine Supabase platform-side issue (project ref `ihcvoqapgcdnoggegrcl`), not a code problem, and is the reason `brewery-discover` can't yet be manually tested. Next step: read Supabase's GitHub API-keys migration thread, then raise a support ticket if unresolved.

## 13 July update — progress made ahead of schedule, and a design upgrade

In an unplanned bonus session, several steps from this plan were already completed:

- **Schema changes done** — `is_active`, `last_verified`, `place_id` columns added to `breweries`, and `App.jsx` updated to filter on `is_active`. Both committed and pushed.
- **`place_id` backfilled for all breweries** — looked up and verified for the full brewery list (spot-checked via the `?q=place_id:` Google Maps URL pattern — click-and-eyeball, no API key needed for this manual check).
- **Two data corrections found and fixed**: Waitoa (Hātaitai) was missing from the directory entirely despite being active — added. Mean Doses' website was incorrectly recorded as null — it has one (`meandoses.co.nz`), now corrected.

**Design upgrade — don't rely on Google Places alone for closure detection.** Research turned up a second free, live, authoritative source: the **NZBN API** (business.govt.nz), which returns a business's actual legal status (`Registered`, `Removed`, `In liquidation`, `In receivership`). This is a government record, not a crowd-maintained listing, so it's a meaningfully stronger signal than Places' `business_status` alone.

**Revised closure-detection logic for the Edge Function:**
- Google Places says closed + NZBN says Removed/Liquidation → **high confidence, safe to auto-close** (flip `is_active = false`)
- Only one of the two flags it → **don't auto-publish** — write to a `flagged_for_review` boolean (or similar lightweight field) instead, so it surfaces next time the data's checked, rather than the system acting on a single possibly-stale signal
- Neither flags it → no action

This means the NZBN API needs its own free subscription key (same admin-task category as the Google Places key) and its own lookup step in the Edge Function, matching by business/trading name rather than `place_id` (NZBN doesn't share Google's ID system) — a bit more matching logic than a pure Places-only design, but a meaningfully more defensible "only auto-publish when independent sources agree" standard.

**Other sources investigated, and why they didn't make the automated design:**
- **Ministry of Justice Register of Licences & Certificates** — the *strongest* signal in principle (a brewery genuinely can't legally sell alcohol without an active on/off-licence), but it's a quarterly bulk file, not a live API. Filed as a **Phase 2 enhancement** below, not part of the initial build.
- **Untappd** — excellent for a human to manually spot-check whether a brewery's genuinely still trading (recent check-in dates are a strong "still alive" signal), but its public API has been largely closed to new developers for some years. Not usable as an automated pipeline input — flagged here so future-you doesn't waste time trying.
- **Facebook / Instagram** — same story as Untappd: good manual check (recent posts = still open), no realistic API path for a small side project (Meta requires business app review for this kind of lookup).
- **Brewers Guild of NZ / NZ Ale Trail** — a real industry body with a member directory, useful for manual discovery cross-checks (worth searching before adding a new region), but no API and not appropriate to scrape into an automated job.
- **Brewers Association of NZ national list** (brewers.org.nz/beer-in-nz) — a full regional breakdown of NZ breweries, but explicitly dated "2016" at the bottom of the page. Confirmed stale (missing both Waitoa and Fortune Favours, includes mainstream corporate brands like Tui/Monteith's/Speight's alongside genuine craft breweries). Not a data source to trust directly — but worth a manual scan as a name checklist next time doing a discovery pass (e.g. expanding beyond Wellington), cross-checking every name against Places/NZBN before adding anything, same as today's approach with the 18 Wellington breweries.

---

## Why this exists

Right now, most breweries in the database were added by hand — researched, verified, and typed in manually. That's fine at 18. It doesn't scale to 200+ (a full national directory) without a lot of ongoing manual upkeep, and breweries genuinely do close, move, and change hands regularly.

The goal: scheduled jobs that periodically check for new breweries and status changes on existing ones, so the directory stays current without Andy manually re-Googling every business every few months.

## The one deliberate trade-off

Full automation means changes publish to the live site without a human looking at them first. This is faster and hands-off, but it means:
- Google's `business_status` data can lag real-world closures by weeks
- A brewery temporarily closed (renovation, etc.) could get flagged the same as permanently closed
- There's no way to fully eliminate this risk while staying hands-off — it's inherent to trusting third-party data without a review step

**The one safeguard being built in regardless:** never hard-delete a brewery row. Use an `is_active` flag instead. Automation can flip it to `false`, but the data isn't destroyed — a bad signal is a one-line fix (`is_active = true` again), not lost work.

---

## What needs building, in order

### 1. Schema changes — ✅ done 13 July

```sql
alter table breweries add column is_active boolean default true;
alter table breweries add column last_verified timestamp with time zone default now();
alter table breweries add column place_id text;
alter table breweries add column flagged_for_review boolean default false;
```

- `is_active` — the soft-delete flag. The app filters `where is_active = true`.
- `last_verified` — timestamp of the last automated check. Useful for spotting rows the automation hasn't successfully checked in a while.
- `place_id` — Google's own unique ID for each place, backfilled for all existing breweries. This is what lets automated syncs match reliably, instead of trying to match on name/address text (fragile — e.g. "Fork & Brewer" vs "Fork and Brewer").
- `flagged_for_review` — set to `true` when the two verification sources disagree, or a brewery's freshly auto-inserted. Surfaced by the exceptions report (§3b) rather than acted on automatically.

`App.jsx`'s Supabase fetch filters on `is_active` — done.

### 2. Google Cloud account + Places API setup — ✅ done

- Google Cloud project `craftbeer-kiwi-automation` created, under the Craft Beer Kiwi Collective Limited business entity.
- Places API (New) enabled, billing set up.
- API key `brewery-sync-places-key` generated, restricted to Places API only, stored in Bitwarden. Application (IP) restriction deliberately deferred until the Edge Functions' egress IPs are known.

### 2b. NZBN API setup (second verification source) — ⚪ not started

- Register at [business.govt.nz](https://portal.api.business.govt.nz) and subscribe to the **NZBN API product** (free, subscription-key method — no OAuth needed for basic search/lookup).
- Store the subscription key alongside the Places key as a Supabase secret.
- Note: matching is by business/trading name, not `place_id` — some breweries' registered legal entity name may differ from their trading name (e.g. "Choice Bros Brewing" vs. whatever name they're actually incorporated under), so this step may need a bit of manual name-mapping for a handful of entries rather than a clean automatic match for all 18.
- Once wired in, `brewery-sync` upgrades from single-source `flagged_for_review` writes to real two-source auto-close, per the design above.

### 3. Supabase Edge Functions — the core automation

Built as **two separate functions** rather than one combined function as originally planned here — see the 25 July update at the top of this doc for why.

**`brewery-sync` (closure-check) — ✅ written, deployed, and tested 20 July**

For every row in `breweries` that has a `place_id`, calls the Places API's place details endpoint, reads the `businessStatus` field. Applies the two-source-agreement rule: a lone Places "closed" signal writes to `flagged_for_review` rather than auto-closing (since NZBN isn't wired in yet). Updates `last_verified` regardless of outcome. Test result: `{"checked":18,"flagged":0,"errors":[]}`.

**`brewery-discover` (new brewery discovery) — 🟡 written and deployed 20 July, not yet verified working**

Calls the Places API text search (`brewery` as the query, biased to the target region — Wellington first). For each result: checks if its `place_id` already exists in the table (skip if so); if new, inserts a row with `name`, `address`, `latitude`, `longitude`, `website` (if Places has one), `place_id`, `is_active = true`, `last_verified = now()`. Blocked from end-to-end testing by the `sb_secret_...` key issue above. A `dryRun` flag (return what would be inserted, don't write) is recommended before the first live run — not yet implemented.

**Description generation — ⚪ not started**

Planned: call the Anthropic API with a newly-discovered brewery's name, address, and any editorial summary Places provides, to draft a 1-2 sentence description matching the tone of existing entries, written into the `description` column. Likely lands inside `brewery-discover` once its core logic is proven, but not decided for certain.

### 3b. Exceptions report — a single place to see what needs a human look

Rather than a `flagged_for_review` value sitting quietly in the table, give it a proper, glanceable output. After each automated run, one query surfaces everything worth a look:

```sql
select name, address, is_active, last_verified, flagged_for_review
from breweries
where flagged_for_review = true
   or last_verified < now() - interval '14 days'
order by last_verified asc;
```

This catches three distinct situations in one place:
- **Source disagreement** — Places and NZBN didn't agree on a closure, so nothing was auto-published, but it's flagged for you to check by hand
- **Newly auto-inserted breweries** — worth a quick eyeball before fully trusting an automated insert, at least while the system's new and unproven
- **Stale rows** — anything the automation failed to successfully check recently (API error, rate limit, name-matching failure), so you're not silently trusting data that's actually gone unverified

Keep this as a saved SQL query in Supabase's SQL Editor for now rather than building a dedicated admin page — a proper review UI is a nice-to-have once the underlying automation is proven reliable, not a day-one requirement.

### 4. Backfill `place_id` for the existing breweries — ✅ done 13 July

### 5. Schedule the functions — ⚪ not started

Once each function has a proven successful manual test run, use Supabase's scheduled triggers (`pg_cron` extension, or Supabase's built-in cron for Edge Functions) to run it on a cadence — weekly is a reasonable starting point, adjustable later. Currently both functions are manual-trigger only.

---

## Multi-site brand blind spot

**Finding:** name-based discovery methods — Places API text search, the NZ Customs Excise CCA list, the Brewers Guild directory — tend to treat multiple venues run by the same brand as duplicates, or miss the second site entirely, because they key on the business/brand name rather than the individual venue. A brand with two distinct taprooms under one legal entity can easily end up represented as a single directory entry, silently dropping a real, separate, publicly-visitable location.

**How this was found:** Garage Project's Wild Workshop — a distinct barrel-ageing/mixed-fermentation taproom at 7 Furness Lane, Te Aro — is a separate public venue from Garage Project's existing Aro Street and Leeds Street sites, but didn't surface as a distinct entry through the automated discovery sources above. It was caught manually and is queued as brewery entry #19 (see the to-do list).

**Mitigation:** regional tourism board pages surface multi-site brands more reliably than name-keyed business sources, since they list venues/experiences rather than legal entities. Worth a manual cross-check against regional tourism listings when discovery-scanning a new area, in addition to the automated Places/NZBN sources — this isn't something the automated pipeline currently does or is likely to catch on its own.

**Related caveat — excise CCA address matching:** the NZ Customs Excise CCA list records manufacturing addresses only, not public-facing taprooms. An address mismatch against this list is not a reliable signal that something's wrong with a brewery's listed address — the CCA address and the taproom address are often legitimately different places for the same business.

---

## Phase 2 (future enhancement, not part of the initial build)

**Ministry of Justice — Register of Licences & Certificates**, as a third, even-stronger verification signal. A brewery legally cannot sell alcohol without an active on-licence or off-licence under the Sale and Supply of Alcohol Act 2012 — so a brewery dropping off this register is about as authoritative a "no longer trading" signal as exists.

Not part of the first build because it's a bulk file (updated quarterly — Feb/May/Aug/Nov), not a live API — a different integration pattern (download + parse + match) from the live Places/NZBN API calls. Worth adding once the core two-source system is working and proven, as a periodic (quarterly) extra cross-check rather than something the scheduled weekly job queries directly.

## Open questions to think about

- **Region scope**: start with Wellington-only automation (matches current data), or build for national from the start since the code doesn't really care? (Recommend: keep Wellington-scoped for now, it's simpler to verify correctness, expand the search query's geographic bounds later once trusted.)
- **Schedule frequency**: weekly is a reasonable default, but worth deciding based on how "urgent" catching a closure feels vs. API cost.
- **Manual override**: should there be a simple way to force `is_active = false` on a brewery manually (e.g. if you hear about a closure before automation catches it)? Worth a tiny admin tool or just doing it via Supabase's Table Editor directly — the latter is fine for now, no need to build UI for this yet.
- **`dryRun` flag for `brewery-discover`**: implement before the first live run, or accept the risk of a bad insert straight to the live table on the first real test? Recommend implementing it — cheap to add, and this function writes to production data on an unproven code path.
