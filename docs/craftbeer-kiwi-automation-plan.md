# craftbeer.kiwi — Automated Brewery Discovery & Closure Detection

**Written:** 11 July 2026 · **Updated:** 17 July 2026
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
- **NZ Customs — National Excise Customs-controlled Area (CCA) List** — confirmed genuinely useful on 13 July via a manual cross-check. See the dedicated section below. Same integration pattern as the MoJ register (download + parse + match), not a live API — Phase 2, not initial build.
- **Untappd** — excellent for a human to manually spot-check whether a brewery's genuinely still trading (recent check-in dates are a strong "still alive" signal), but its public API has been largely closed to new developers for some years. Not usable as an automated pipeline input — flagged here so future-you doesn't waste time trying.
- **Facebook / Instagram** — same story as Untappd: good manual check (recent posts = still open), no realistic API path for a small side project (Meta requires business app review for this kind of lookup).
- **Brewers Guild of NZ / NZ Ale Trail** — stronger than initially assessed. Their annual report (published as a PDF each year, e.g. the 2024-25 report) includes a real, current member list broken down by tier (Micro/Small/Medium/Large brewery members). Cross-checked against today's 18 breweries: Waitoa, Panhead, Garage Project, Choice Bros, Duncan's, Heyday, and North End all confirmed as current Guild members — a genuine independent validation of the existing directory. Also surfaced **Martinborough Brewery** (Wairarapa, Micro tier) as a candidate worth considering if the directory expands beyond Wellington city/Hutt Valley/Kāpiti. Still not an API — it's an annual PDF, so useful as an on-demand manual cross-check once a year, not an automated pipeline input.
- **Beervana** (Wellington's annual beer festival, run by the Wellington Culinary Events Trust) — genuinely useful for two manual purposes: confirming an established brewery is still actively trading (exhibitor lists refresh yearly, so a current-year listing is a good "still alive" signal), and catching brand-new breweries via the festival's dedicated "New Kids On The Block" stand, which specifically showcases breweries that opened in the previous 12 months. Not comprehensive (only ~60-70 breweries exhibit each year) and absence from the list isn't evidence of closure — just a good, low-noise discovery/confirmation source to check manually, same category as Untappd and Brewers Guild.
- **Brewers Association of NZ national list** (brewers.org.nz/beer-in-nz) — a full regional breakdown of NZ breweries, but explicitly dated "2016" at the bottom of the page. Confirmed stale (missing both Waitoa and Fortune Favours, includes mainstream corporate brands like Tui/Monteith's/Speight's alongside genuine craft breweries). Not a data source to trust directly — but worth a manual scan as a name checklist next time doing a discovery pass (e.g. expanding beyond Wellington), cross-checking every name against Places/NZBN before adding anything, same as today's approach with the 18 Wellington breweries.

---

## Why this exists

Right now, all 18 breweries in the database were added by hand — researched, verified, and typed in manually during earlier sessions. That's fine at 18. It doesn't scale to 200+ (a full national directory) without a lot of ongoing manual upkeep, and breweries genuinely do close, move, and change hands regularly — three of today's 18 needed a correction mid-session (Fortune Favours closed, Tuatara relocated, Boneface changed owners).

The goal: a scheduled job that periodically checks for new breweries and status changes on existing ones, so the directory stays current without Andy manually re-Googling every business every few months.

## The one deliberate trade-off

Full automation means changes publish to the live site without a human looking at them first. This is faster and hands-off, but it means:
- Google's `business_status` data can lag real-world closures by weeks
- A brewery temporarily closed (renovation, etc.) could get flagged the same as permanently closed
- There's no way to fully eliminate this risk while staying hands-off — it's inherent to trusting third-party data without a review step

**The one safeguard being built in regardless:** never hard-delete a brewery row. Use an `is_active` flag instead. Automation can flip it to `false`, but the data isn't destroyed — a bad signal is a one-line fix (`is_active = true` again), not lost work.

---

## What needs building, in order

### 1. Schema changes (Supabase SQL Editor — quick, safe, can do any time) — ✅ done 13 July

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

**Also update `App.jsx`'s Supabase fetch** to filter on `is_active` — ✅ done 13 July:
```javascript
const { data, error } = await supabase.from('breweries').select('*').eq('is_active', true)
```

### 2. Google Cloud account + Places API setup — ✅ done 14 July

- ✅ Google Cloud project created (`craftbeer-kiwi-automation`), under a **business** Google Account tied to Craft Beer Kiwi Collective Limited (NZBN 9429053376602)
- ✅ Billing enabled — NZ$530 free trial credit active (90 days). Note: Google retired the old flat $200/month credit in March 2025; free usage is now scoped per-SKU (10,000 free calls/month for Essentials-tier fields, 5,000 for Pro, 1,000 for Enterprise). At this project's volume (weekly checks of ~18-200 breweries), usage should stay comfortably within the free thresholds as long as field masks stay lean — see step 3 below
- ✅ **Places API (New)** enabled (not the legacy "Places API," which can no longer be enabled on new projects)
- ✅ API key created, named `brewery-sync-places-key`
- ✅ **API restriction** set — restricted to Places API (New) only
- ⏳ **Application (IP) restriction — deferred, not yet done.** Currently set to "None" (Google's console does still offer this option on the key's edit page, alongside Websites/IP addresses/Android/iOS — it just isn't offered as an escape option inside the initial "Protect your API key" pop-up dialog, which requires picking a type before you can dismiss it via "Maybe later"). Since Supabase's Edge Function egress IPs aren't known until the function is scaffolded (step 5, below), this is intentionally left open for now. **Follow-up task:** once the Edge Function exists and its egress IP(s) are known, come back to this key in Credentials and switch Application restrictions from "None" to "IP addresses". Until then, the key is protected only by the API restriction (Places API (New) only) — a real but partial safeguard, not a substitute for the IP restriction.
- Store the key somewhere safe — it'll go into Supabase as a secret (not in `.env.local`, since this key is used server-side in the Edge Function, never exposed to the browser)

### 2b. NZBN API setup (second verification source)

- Register at [business.govt.nz](https://portal.api.business.govt.nz) and subscribe to the **NZBN API product** (free, subscription-key method — no OAuth needed for basic search/lookup)
- Store the subscription key alongside the Places key as a Supabase secret
- Note: matching is by business/trading name, not `place_id` — some breweries' registered legal entity name may differ from their trading name (e.g. "Choice Bros Brewing" vs. whatever name they're actually incorporated under), so this step may need a bit of manual name-mapping for a handful of entries rather than a clean automatic match for all 18. See the Excise CCA List section below for a concrete illustration of how tangled this can get (Panhead/Boneface/Neilson).

### 3. Supabase Edge Function — the core automation — 🔄 scaffolding done 14 July, logic not yet written

Edge Functions run on Supabase's servers, written in TypeScript/Deno (different from the React/Vite code in the main app — new syntax, new environment, but conceptually just "a script that runs on a schedule and does some work").

**Progress so far:**
- ✅ Supabase CLI installed as a project dev dependency (`npm install supabase --save-dev`, run via `npx supabase ...`)
- ✅ Logged in (`npx supabase login`)
- ✅ `supabase/config.toml` initialized (`npx supabase init`)
- ✅ Linked to the live project (`npx supabase link --project-ref ihcvoqapgcdnoggegrcl`)
- ✅ Function scaffolded: `supabase functions new brewery-sync` created `supabase/functions/brewery-sync/index.ts` (empty template, no logic yet)
- ✅ VS Code Deno settings generated (`.vscode/settings.json`) — still need to install the **Deno extension** for VS Code (`denoland.vscode-deno`) for proper import resolution/syntax support in the function file
- Note: Docker Desktop was **not required** for any of this. The CLI only needs Docker for full local dev/testing (`supabase start`, `supabase functions serve`); deployment falls back to API-based deployment automatically when Docker isn't present. Given the plan is to test via a direct HTTP call to the deployed function rather than a full local stack, Docker can likely be skipped entirely for this project.

**What the function needs to do, each time it runs (not yet written):**

1. **Check existing breweries for closures**
   For every row in `breweries` that has a `place_id`, call the Places API's place details endpoint, read the `businessStatus` field. If it comes back `CLOSED_PERMANENTLY`, set `is_active = false` on that row. Update `last_verified` regardless of outcome.

2. **Discover new breweries**
   Call the Places API text search (`brewery` as the query, biased to the target region — Wellington first, expand later). For each result:
   - Check if its `place_id` already exists in the table → skip if so
   - If new: insert a row with `name`, `address`, `latitude`, `longitude`, `website` (if Places has one), `place_id`, `is_active = true`, `last_verified = now()`
   - **Website field requirement**: The `website` field must always be checked and populated for every newly-discovered brewery — never left null by default. Places' text search often returns a website URL directly (`websiteUri` in the Places API (New) response); when present, use it. When absent, don't silently skip the field — flag the row for manual follow-up (e.g. via `flagged_for_review`) so it surfaces in the exceptions report rather than quietly shipping with a missing link. This closes a gap first found manually on 17 July, where 7 of the then-18 breweries had a null `website` despite most having a real, findable site — a mistake worth designing out of the automated path from day one rather than accumulating again at scale.

3. **Generate a description for newly-inserted breweries**
   Call the Anthropic API (same pattern as the in-artifact API calls, but from the Edge Function instead) with the brewery's name, address, and any editorial summary Places provides. Prompt it to draft a 1-2 sentence description matching the tone of existing entries. Write the result into the `description` column.

**Remaining for next session:**
- Write the function logic (this is the bulk of the actual coding work)
- Set the Google Places API key and Anthropic API key as Supabase secrets (`npx supabase secrets set GOOGLE_PLACES_API_KEY=...`), not hardcoded
- Deploy the function (`npx supabase functions deploy brewery-sync`)
- Test it manually first (trigger it via a direct HTTP call) before scheduling it
- Once egress IPs are known post-deploy, circle back to the Google Cloud key (see step 2) and add the IP application restriction

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

Before the sync function is useful, the existing rows need their `place_id` filled in — otherwise the closure-check step (1, above) has nothing to check them against, and the discovery step (2, above) might re-insert them as "new" duplicates.

This is a one-off task: for each brewery, look up its Places `place_id` (can be done via the Places API text search once, matching by name/address) and update the row. Small, bounded piece of work — worth doing as step zero before the automation goes live.

### 5. Schedule the function

Once tested manually and working, use Supabase's scheduled triggers (`pg_cron` extension, or Supabase's built-in cron for Edge Functions) to run it on a cadence — weekly is a reasonable starting point, adjustable later.

---

## Suggested order for next session

1. ~~Run the schema changes~~ — ✅ done
2. ~~Update `App.jsx` to filter on `is_active`~~ — ✅ done
3. ~~Set up Google Cloud billing + Places API key~~ — ✅ done (IP application restriction deferred to step 5, see step 2 above)
4. ~~Backfill `place_id` for the existing breweries~~ — ✅ done
5. ~~Install Supabase CLI, scaffold the Edge Function~~ — ✅ done 14 July (CLI installed, logged in, linked to project `ihcvoqapgcdnoggegrcl`, `brewery-sync` function scaffolded)
6. **Write and test the closure-check logic first** (simpler, lower-risk than discovery) ← next unstarted step
7. Add the discovery logic (remember the website-field requirement above)
8. Add the Anthropic description-generation step
9. Deploy, test manually, then schedule

This is realistically **2-4 sessions** of work at your usual pace, not a single sitting — steps 5 onward involve three tools you haven't used yet (Supabase CLI, Edge Functions/Deno, Google Cloud Console), so budget time for some friction and troubleshooting along the way, same as the Mapbox setup snag earlier in the project.

---

## NZ Customs — National Excise Customs-controlled Area (CCA) List

Confirmed genuinely useful on 13 July via a manual cross-check. This is a real, downloadable Excel file published at customs.govt.nz (`Excise_CCA_LIST_2026.xlsx`, dated "current as at 1 July 2026"), listing every business licensed to manufacture excisable alcohol in NZ — which a commercial brewery must hold to legally produce beer for sale. Same integration pattern as the MoJ register (download + parse + match), not a live API — filed as a Phase 2 enhancement, not part of the initial automated build.

**A clean CSV extract of every brewery-relevant row (180 entries, keyword-filtered) is saved at `docs/sources/nz-breweries-excise-cca-2026-07-01.csv`** for future reference and diffing against later pulls. Note this was extracted by keyword match against the pasted list text (not a guaranteed-complete parse of the full ~800-row source file), so treat it as a strong starting point rather than gospel.

Cross-checked against all 18 current breweries: **18 confirmed**, matching name, address, or a verified parent/successor entity (Garage Project both sites, Fork & Brewer, Choice Bros, Parrotdog, Double Vision, Baylands, Te Aro Brewing, Kereru, North End, Duncan's, Waitoa, Panhead, Boneface, Tuatara, Mean Doses).

- **Mean Doses** — ✅ resolved 14 July. Not a discrepancy: 130 Tory Street is the manufacturing/brewery site, while the taproom — where customers actually go, and what the database correctly lists — is Level 1, 66 Tory Street, also in Te Aro. Two addresses, both legitimate, serving different purposes. No database change needed. Worth noting as a general pattern: the excise list only ever shows manufacturing addresses, so any brewery with a separate public-facing taproom will show an "address mismatch" against this source that isn't actually an error.
- **Panhead Custom Ales** — ✅ resolved 14 July. Not listed under its own name because it isn't independent: Panhead was sold to Lion in 2016 for $15.1m. The excise entry "Lion NZ Limited" at Unit 18-22/27 Blenheim Street, Maidstone, Upper Hutt is Panhead's actual manufacturing licence, held by its parent company.
- **Boneface Brewing Co** — ✅ resolved 14 July. The "Neilson Brewery Limited" entry (Unit 14, 27 Blenheim Street, Maidstone, Upper Hutt) is *not* Panhead — it's a new company Mike and Anna Neilson (Panhead's original founders) registered on 24 May 2024 specifically to buy Boneface out of liquidation after Mike left Panhead in late 2023. This is Boneface's manufacturing entity, not Panhead's.
- **Tuatara Brewery** — not listed under its own name. "DB Breweries Limited – (Brewtown site)" appears at the same address, consistent with Tuatara brewing under its parent company's (DB/Asahi) licence rather than its own.

**Key implication for matching logic**: this register lists the *registered legal entity or trading name*, which often differs from the consumer-facing brewery name (e.g. Garage Project appears as "Brewell Limited"). Brewery ownership can also change hands, and the new owner can reuse a similarly-named shell company from a past venture — as seen with Neilson Brewery Ltd, originally associated with the Neilsons' Panhead days, now housing Boneface instead. And even when name-matching succeeds, the address on this register is the *manufacturing* address, which won't match a brewery's public taproom address if the two differ (as with Mean Doses) — so an address mismatch alone isn't grounds to auto-flag a row, only a name/status mismatch is. Any integration against this list needs fuzzy/manual name matching that accounts for current ownership, and should treat address as informational rather than a match criterion — not exact string matching or an assumption that a legal-entity name maps permanently to the brand it superficially resembles — same lesson as the NZBN matching note above.

---

## Manual cross-checks (not automated — a once- or twice-a-year habit, not a pipeline step)

These sources don't have APIs and aren't part of the scheduled Edge Function. Worth a quick manual glance on roughly this cadence:

- **Brewers Guild annual report** — published each year (usually mid-year, after the AGM). When the new one drops, spot-check its member list against your directory: anything newly listed that you're missing, anything you have that's dropped off. Also a good moment to reconsider Martinborough Brewery (Wairarapa) if scope ever expands past Wellington/Hutt/Kāpiti.
- **Beervana exhibitor list** — refreshes each year ahead of the August festival. Worth a glance for the "New Kids On The Block" stand specifically (new breweries from the past 12 months) and as a "still trading" spot-check for anything the automated system flagged as uncertain.
- **NZ Customs Excise CCA List** — republished periodically at customs.govt.nz. Worth pulling a fresh copy every 6-12 months and diffing against the last saved snapshot in `docs/sources/` to catch address changes, ownership changes, or new licences.

Neither of these needs a calendar reminder or anything formal — just worth doing whenever you happen to be in the app doing other work around those times of year.

## Phase 2 (future enhancement, not part of the initial build)

**Ministry of Justice — Register of Licences & Certificates**, as a third, even-stronger verification signal. A brewery legally cannot sell alcohol without an active on-licence or off-licence under the Sale and Supply of Alcohol Act 2012 — so a brewery dropping off this register is about as authoritative a "no longer trading" signal as exists.

Not part of the first build because it's a bulk file (updated quarterly — Feb/May/Aug/Nov), not a live API — a different integration pattern (download + parse + match) from the live Places/NZBN API calls. Worth adding once the core two-source system is working and proven, as a periodic (quarterly) extra cross-check rather than something the scheduled weekly job queries directly.

**NZ Customs Excise CCA List** — see the dedicated section above. Same periodic-manual-cross-check treatment as the MoJ register.

## Open questions to think about before/during next session

- **Region scope**: start with Wellington-only automation (matches current data), or build for national from the start since the code doesn't really care? (Recommend: keep Wellington-scoped for now, it's simpler to verify correctness, expand the search query's geographic bounds later once trusted.)
- **National expansion, when it happens**: use the manual cross-checks listed above (Brewers Guild annual report, Brewers Association national list, NZ Ale Trail, Beervana) as the *starting checklist* — pull names from each, cross-verify every one against Places/NZBN before adding, same standard applied to today's 18 Wellington breweries. Don't skip verification just because a name appears on an "official-looking" list — the Brewers Association's list turned out to be a decade stale, so treat every source as a lead to check, not a fact to trust.
- **Schedule frequency**: weekly is a reasonable default, but worth deciding based on how "urgent" catching a closure feels vs. API cost.
- **Manual override**: should there be a simple way to force `is_active = false` on a brewery manually (e.g. if you hear about a closure before automation catches it)? Worth a tiny admin tool or just doing it via Supabase's Table Editor directly — the latter is fine for now, no need to build UI for this yet.

## 17 July update — website field audit and process fix

All 18 active breweries had their `website` field audited via a direct SQL pull (`select name, website from breweries where is_active = true order by name;`). 7 rows were null (Duncan's Brewing Company, Abandoned Brewery, Baylands Brewery, Kereru Brewing, North End Brewing, Te Aro Brewing Company) — all had real, verifiable websites that simply hadn't been captured when the rows were added manually. All 7 corrected via SQL update, cross-referenced against live web search before writing. All 18 rows now have a populated `website` field.

This was a manual data-hygiene pass, not an automated one, but it directly informed the **website field requirement** added to the discovery-logic notes under step 3 above — the same gap would otherwise resurface automatically once the Edge Function starts inserting new rows unsupervised.
