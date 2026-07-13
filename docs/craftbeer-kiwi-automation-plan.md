# craftbeer.kiwi — Automated Brewery Discovery & Closure Detection

**Written:** 11 July 2026 · **Updated:** 13 July 2026
**Purpose:** Pick-up guide for the next session. Covers why this is being built, the architecture, and step-by-step setup — schema changes, Google Cloud, Supabase Edge Functions, and description generation.

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
- **Brewers Guild of NZ / NZ Ale Trail** — stronger than initially assessed. Their annual report (published as a PDF each year, e.g. the 2024-25 report) includes a real, current member list broken down by tier (Micro/Small/Medium/Large brewery members). Cross-checked against today's 18 breweries: Waitoa, Panhead, Garage Project, Choice Bros, Duncan's, Heyday, and North End all confirmed as current Guild members — a genuine independent validation of the existing directory. Also surfaced **Martinborough Brewery** (Wairarapa, Micro tier) as a candidate worth considering if the directory expands beyond Wellington city/Hutt Valley/Kāpiti. Still not an API — it's an annual PDF, so useful as an on-demand manual cross-check once a year, not an automated pipeline input.
- **Beervana** (Wellington's annual beer festival, run by the Wellington Culinary Events Trust) — genuinely useful for two manual purposes: confirming an established brewery is still actively trading (exhibitor lists refresh yearly, so a current-year listing is a good "still alive" signal), and catching brand-new breweries via the festival's dedicated "New Kids On The Block" stand, which specifically showcases breweries that opened in the previous 12 months. Not comprehensive (only ~60-70 breweries exhibit each year) and absence from the list isn't evidence of closure — just a good, low-noise discovery/confirmation source to check manually, same category as Untappd and Brewers Guild.
- **Brewers Association of NZ national list** (brewers.org.nz/beer-in-nz) — a full regional breakdown of NZ breweries, but explicitly dated "2016" at the bottom of the page. Confirmed stale (missing both Waitoa and Fortune Favours, includes mainstream corporate brands like Tui/Monteith's/Speight's alongside genuine craft breweries). Not a data source to trust directly — but worth a manual scan as a name checklist next time doing a discovery pass (e.g. expanding beyond Wellington), cross-checking every name against Places/NZBN before adding anything, same as today's approach with the 18 Wellington breweries.

---

## Why this exists

Right now, all 17 breweries in the database were added by hand — researched, verified, and typed in manually during this session. That's fine at 17. It doesn't scale to 200+ (a full national directory) without a lot of ongoing manual upkeep, and breweries genuinely do close, move, and change hands regularly — three of today's 17 needed a correction mid-session (Fortune Favours closed, Tuatara relocated, Boneface changed owners).

The goal: a scheduled job that periodically checks for new breweries and status changes on existing ones, so the directory stays current without Andy manually re-Googling every business every few months.

## The one deliberate trade-off

Full automation means changes publish to the live site without a human looking at them first. This is faster and hands-off, but it means:
- Google's `business_status` data can lag real-world closures by weeks
- A brewery temporarily closed (renovation, etc.) could get flagged the same as permanently closed
- There's no way to fully eliminate this risk while staying hands-off — it's inherent to trusting third-party data without a review step

**The one safeguard being built in regardless:** never hard-delete a brewery row. Use an `is_active` flag instead. Automation can flip it to `false`, but the data isn't destroyed — a bad signal is a one-line fix (`is_active = true` again), not lost work.

---

## What needs building, in order

### 1. Schema changes (Supabase SQL Editor — quick, safe, can do any time)

```sql
alter table breweries add column is_active boolean default true;
alter table breweries add column last_verified timestamp with time zone default now();
alter table breweries add column place_id text;
alter table breweries add column flagged_for_review boolean default false;
```

- `is_active` — the soft-delete flag. The map/app should filter `where is_active = true` from here on.
- `last_verified` — timestamp of the last automated check. Useful for spotting rows the automation hasn't successfully checked in a while.
- `place_id` — Google's own unique ID for each place. Store this for every existing brewery too (requires a one-off lookup per brewery to backfill — see step 4). This is what lets future automated syncs match reliably, instead of trying to match on name/address text (which is fragile — e.g. "Fork & Brewer" vs "Fork and Brewer" vs "FORK & BREWER").
- `flagged_for_review` — set to `true` when the two verification sources disagree, or a brewery's freshly auto-inserted. Surfaced by the exceptions report (see step 3b) rather than acted on automatically.

**Also update `App.jsx`'s Supabase fetch** to filter on `is_active`:
```javascript
const { data, error } = await supabase.from('breweries').select('*').eq('is_active', true)
```

### 2. Google Cloud account + Places API setup

- Go to [console.cloud.google.com](https://console.cloud.google.com), create a project (or use an existing Google account)
- Enable **billing** — Places API isn't free past a small monthly quota. At the data volume involved here (checking ~18-200 breweries periodically, not per-user-request), cost should be low, but this is a real billing relationship to set up, not a free toggle
- Enable the **Places API (New)** for the project
- Generate an API key, restrict it to the Places API only (security best practice — don't leave it unrestricted)
- Store the key somewhere safe — it'll go into Supabase as a secret (not in `.env.local`, since this key is used server-side in the Edge Function, never exposed to the browser)

### 2b. NZBN API setup (second verification source)

- Register at [business.govt.nz](https://portal.api.business.govt.nz) and subscribe to the **NZBN API product** (free, subscription-key method — no OAuth needed for basic search/lookup)
- Store the subscription key alongside the Places key as a Supabase secret
- Note: matching is by business/trading name, not `place_id` — some breweries' registered legal entity name may differ from their trading name (e.g. "Choice Bros Brewing" vs. whatever name they're actually incorporated under), so this step may need a bit of manual name-mapping for a handful of entries rather than a clean automatic match for all 18

### 3. Supabase Edge Function — the core automation

Edge Functions run on Supabase's servers, written in TypeScript/Deno (different from the React/Vite code in the main app — new syntax, new environment, but conceptually just "a script that runs on a schedule and does some work").

**What the function does, each time it runs:**

1. **Check existing breweries for closures**
   For every row in `breweries` that has a `place_id`, call the Places API's place details endpoint, read the `businessStatus` field. If it comes back `CLOSED_PERMANENTLY`, set `is_active = false` on that row. Update `last_verified` regardless of outcome.

2. **Discover new breweries**
   Call the Places API text search (`brewery` as the query, biased to the target region — Wellington first, expand later). For each result:
   - Check if its `place_id` already exists in the table → skip if so
   - If new: insert a row with `name`, `address`, `latitude`, `longitude`, `website` (if Places has one), `place_id`, `is_active = true`, `last_verified = now()`

3. **Generate a description for newly-inserted breweries**
   Call the Anthropic API (same pattern as the in-artifact API calls, but from the Edge Function instead) with the brewery's name, address, and any editorial summary Places provides. Prompt it to draft a 1-2 sentence description matching the tone of existing entries. Write the result into the `description` column.

**Setting this up practically, next session:**
- Install the Supabase CLI locally (new tool, separate from anything used so far)
- Scaffold a new Edge Function (`supabase functions new brewery-sync` or similar)
- Write the function logic (this is the bulk of the actual coding work)
- Set the Google Places API key and Anthropic API key as Supabase secrets (`supabase secrets set`), not hardcoded
- Deploy the function (`supabase functions deploy`)
- Test it manually first (trigger it via a direct HTTP call) before scheduling it

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

Keep this as a saved SQL query in Supabase's SQL Editor for now (Supabase supports saving queries) rather than building a dedicated admin page — a proper review UI is a nice-to-have once the underlying automation is proven reliable, not a day-one requirement. Add a `flagged_for_review boolean default false` column alongside the other schema changes in step 1 to support this.

### 4. Backfill `place_id` for the existing breweries — ✅ done 13 July

Before the sync function is useful, the 17 existing rows need their `place_id` filled in — otherwise the closure-check step (1, above) has nothing to check them against, and the discovery step (2, above) might re-insert them as "new" duplicates.

This is a one-off task: for each of the 17, look up its Places `place_id` (can be done via the Places API text search once, matching by name/address) and update the row. Small, bounded piece of work — worth doing as step zero before the automation goes live.

### 5. Schedule the function

Once tested manually and working, use Supabase's scheduled triggers (`pg_cron` extension, or Supabase's built-in cron for Edge Functions) to run it on a cadence — weekly is a reasonable starting point, adjustable later.

---

## Suggested order for next session

1. Run the schema changes (5 minutes, safe, no dependencies)
2. Update `App.jsx` to filter on `is_active` (quick)
3. Set up Google Cloud billing + Places API key (admin task, ~15-20 minutes)
4. Backfill `place_id` for the 17 existing breweries (can be scripted or done via a one-off SQL update per row once IDs are looked up)
5. Install Supabase CLI, scaffold the Edge Function
6. Write and test the closure-check logic first (simpler, lower-risk than discovery)
7. Add the discovery logic
8. Add the Anthropic description-generation step
9. Deploy, test manually, then schedule

This is realistically **2-4 sessions** of work at your usual pace, not a single sitting — steps 5 onward involve three tools you haven't used yet (Supabase CLI, Edge Functions/Deno, Google Cloud Console), so budget time for some friction and troubleshooting along the way, same as the Mapbox setup snag earlier today.

---

## Manual cross-checks (not automated — a once- or twice-a-year habit, not a pipeline step)

These sources don't have APIs and aren't part of the scheduled Edge Function. Worth a quick manual glance on roughly this cadence:

- **Brewers Guild annual report** — published each year (usually mid-year, after the AGM). When the new one drops, spot-check its member list against your directory: anything newly listed that you're missing, anything you have that's dropped off. Also a good moment to reconsider Martinborough Brewery (Wairarapa) if scope ever expands past Wellington/Hutt/Kāpiti.
- **Beervana exhibitor list** — refreshes each year ahead of the August festival. Worth a glance for the "New Kids On The Block" stand specifically (new breweries from the past 12 months) and as a "still trading" spot-check for anything the automated system flagged as uncertain.

Neither of these needs a calendar reminder or anything formal — just worth doing whenever you happen to be in the app doing other work around those times of year.

## Phase 2 (future enhancement, not part of the initial build)

**Ministry of Justice — Register of Licences & Certificates**, as a third, even-stronger verification signal. A brewery legally cannot sell alcohol without an active on-licence or off-licence under the Sale and Supply of Alcohol Act 2012 — so a brewery dropping off this register is about as authoritative a "no longer trading" signal as exists.

Not part of the first build because it's a bulk file (updated quarterly — Feb/May/Aug/Nov), not a live API — a different integration pattern (download + parse + match) from the live Places/NZBN API calls. Worth adding once the core two-source system is working and proven, as a periodic (quarterly) extra cross-check rather than something the scheduled weekly job queries directly.

## Open questions to think about before/during next session

- **Region scope**: start with Wellington-only automation (matches current data), or build for national from the start since the code doesn't really care? (Recommend: keep Wellington-scoped for now, it's simpler to verify correctness, expand the search query's geographic bounds later once trusted.)
- **National expansion, when it happens**: use the same manual cross-checks listed above (Brewers Guild annual report, Brewers Association national list, NZ Ale Trail, Beervana) as the *starting checklist* — pull names from each, cross-verify every one against Places/NZBN before adding, same standard applied to today's 18 Wellington breweries. Don't skip verification just because a name appears on an "official-looking" list — today's research caught the Brewers Association's list being a decade stale, so treat every source as a lead to check, not a fact to trust.
- **Schedule frequency**: weekly is a reasonable default, but worth deciding based on how "urgent" catching a closure feels vs. API cost.
- **Manual override**: should there be a simple way to force `is_active = false` on a brewery manually (e.g. if you hear about a closure before automation catches it)? Worth a tiny admin tool or just doing it via Supabase's Table Editor directly — the latter is fine for now, no need to build UI for this yet.
