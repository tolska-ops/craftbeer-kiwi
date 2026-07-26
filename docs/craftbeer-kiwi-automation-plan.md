# craftbeer.kiwi — Automated Brewery Discovery & Closure Detection

**Written:** 11 July 2026 · **Updated:** 27 July 2026
**Purpose:** Living reference for the automation build — why it exists, the architecture, current status, and what's still ahead. Earlier versions of this doc were a forward-looking build plan; as of 20 July the core of both Edge Functions is written and deployed, so this version describes what's actually built alongside what's still planned.

---

## Why this exists

All 19 breweries in the database were originally added by hand — researched, verified, and typed in manually. That's fine at 19. It doesn't scale to 200+ (a full national directory) without a lot of ongoing manual upkeep, and breweries genuinely do close, move, and change hands regularly — several early corrections (Fortune Favours closed, Tuatara relocated, Boneface changed owners) confirmed this isn't a hypothetical risk.

The goal: scheduled jobs that periodically check for new breweries and status changes on existing ones, so the directory stays current without Andy manually re-Googling every business every few months.

## The one deliberate trade-off

Full automation means changes publish to the live site without a human looking at them first. This is faster and hands-off, but it means:
- Google's `business_status` data can lag real-world closures by weeks
- A brewery temporarily closed (renovation, flood, etc.) could get flagged the same as permanently closed
- There's no way to fully eliminate this risk while staying hands-off — it's inherent to trusting third-party data without a review step

The safeguard built in regardless: **never hard-delete a brewery row.** Use an `is_active` flag instead. Automation can flip it to `false`, but the data isn't destroyed — a bad signal is a one-line fix, not lost work. See `decisions.md` for the full soft-delete rationale.

---

## Current status (as of 27 July)

### Schema — done
All automation-support columns are live on `breweries`:

```sql
alter table breweries add column is_active boolean default true;
alter table breweries add column last_verified timestamp with time zone default now();
alter table breweries add column place_id text;
alter table breweries add column flagged_for_review boolean default false;
```

- `is_active` — soft-delete flag; the app filters `where is_active = true`.
- `last_verified` — timestamp of the last automated check.
- `place_id` — Google's unique ID per place, backfilled for all breweries. Lets automated syncs match reliably instead of fragile name/address text matching.
- `flagged_for_review` — set when verification sources disagree, or a brewery's freshly auto-inserted. Surfaced by the exceptions report (below).

`status` / `status_note` columns were added separately to support temporary-closure display (grey pin, badge, popup note) — see `decisions.md`. These are manual-entry only, distinct from the automated `is_active`/`flagged_for_review` fields.

### Google Cloud + Places API — done
Set up as a business account under Craft Beer Kiwi Collective Limited: project created, billing enabled, Places API (New) enabled, restricted API key generated and stored in Bitwarden as a Secure Note. Application (IP) restriction is deliberately deferred until the Edge Functions' egress IPs are known.

### NZBN API — not started
Registration and subscription-key setup at business.govt.nz hasn't happened yet. This remains the single biggest gap between the current closure-check logic and its originally designed two-source-agreement standard (see below).

### Supabase Edge Functions — built and deployed, testing partially blocked

Two separate functions, deliberately kept apart (see `decisions.md` for the cost-tier/blast-radius reasoning):

**`brewery-sync`** (closure-check) — written using the `withSupabase`/`@supabase/server` auth pattern (a mid-project Supabase platform change that superseded this plan's original manual-client design). Deployed and **successfully tested end-to-end**: `{"checked":18,"flagged":0,"errors":[]}`. Logic:
1. For every brewery with a `place_id`, call the Places API's place details endpoint and read `businessStatus`.
2. Per the two-source-agreement rule (see `decisions.md`): a `CLOSED_PERMANENTLY` signal from Places alone writes `flagged_for_review = true`, **not** `is_active = false`, because NZBN isn't wired in yet to corroborate.
3. `last_verified` is updated regardless of outcome.

**`brewery-discover`** (discovery) — written and deployed, but **not yet successfully tested end-to-end**. Logic (as built, unverified in practice):
1. Call the Places API text search (`brewery` as the query, biased to the Wellington region).
2. For each result, check if its `place_id` already exists → skip if so.
3. If new: insert a row with name, address, lat/long, website, `place_id`, `is_active = true`, `last_verified = now()`.

A `dryRun` safety flag (return what would be inserted without writing to the live table) was discussed as worth adding before the first real run, given it writes directly to the live `breweries` table — not yet implemented.

**Blocking issue:** new-format `sb_secret_...` keys consistently return `401 INVALID_CREDENTIALS` against both deployed functions, confirmed via two independently generated keys and three test methods (PowerShell, curl, Supabase dashboard test panel). Confirmed as a genuine Supabase platform-side issue, not a code problem. This blocks manual testing of `brewery-discover` specifically — `brewery-sync` was tested successfully before the key issue surfaced. Next step: read Supabase's GitHub API-keys migration thread, then raise a support ticket if unresolved.

Neither function is scheduled yet — both are manual-trigger only until `brewery-discover` has a proven successful run.

### Anthropic API description-generation step — not started
Planned to auto-draft a 1-2 sentence description for newly-discovered breweries, likely inside `brewery-discover` once its core discovery logic is proven working. Not decided for certain that it lands there rather than as a separate step.

### Known blind spot: multi-site brands
Name-based discovery (this function, plus the Places API and excise-list cross-checks) treats multiple venues under one brand as duplicates, so a second site for an existing brand can be silently skipped. Regional tourism board pages surface multi-site brands more reliably than name-matching does. Found via Garage Project Wild Workshop being missed by discovery despite Garage Project already being in the directory (added by hand as brewery #19 instead). See `decisions.md` for the full finding.

---

## Exceptions report

Rather than `flagged_for_review` sitting quietly in the table, one saved query surfaces everything worth a human look:

```sql
select name, address, is_active, last_verified, flagged_for_review
from breweries
where flagged_for_review = true
   or last_verified < now() - interval '14 days'
order by last_verified asc;
```

This catches three distinct situations in one place:
- **Source disagreement** — Places and NZBN didn't agree on a closure (once NZBN is wired in), so nothing was auto-published, but it's flagged for a manual check.
- **Newly auto-inserted breweries** — worth a quick eyeball before fully trusting an automated insert, at least while the system's new and unproven.
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
- **Timing of further automation investment:** raised 25 July — `brewery-sync`/`brewery-discover` were built for a directory of 19 breweries; automating discovery only really pays off once new breweries are being added faster than by hand, which isn't the case yet. Not a reason to abandon what's built, but worth weighing against instrumentation/distribution work when planning the next session's effort (see `todo.md`).

## What needs building next, in order

1. Resolve the Supabase `sb_secret_...` key issue (read the GitHub migration thread, raise a support ticket if needed).
2. Add the `dryRun` flag to `brewery-discover` before its first real run.
3. Successfully test `brewery-discover` end-to-end.
4. Register for the NZBN API and wire it into `brewery-sync`, upgrading closure detection to real two-source auto-close.
5. Add the Anthropic description-generation step for newly-discovered breweries.
6. Schedule both functions (`pg_cron` or Supabase's built-in cron) once each has a proven successful manual run.
