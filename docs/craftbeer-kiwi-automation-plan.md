# craftbeer.kiwi — Automated Brewery Discovery & Closure Detection

**Written:** 11 July 2026 · **Updated:** 20 July 2026 (Edge Function section restructured — split into brewery-sync/brewery-discover; multi-site blind spot section merged in)
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
- `flagged_for_review` — set to `true` when the two verification sources disagree, or a brewery's freshly auto-inserted. Surfaced by the exceptions report (see step 3d) rather than acted on automatically.

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
- ⏳ **Application (IP) restriction — deferred, not yet done.** Currently set to "None" (Google's console does still offer this option on the key's edit page, alongside Websites/IP addresses/Android/iOS — it just isn't offered as an escape option inside the initial "Protect your API key" pop-up dialog, which requires picking a type before you can dismiss it via "Maybe later"). Since Supabase's Edge Function egress IPs aren't known until the function is scaffolded (step 5, below), this is intentionally left open for now. **Follow-up task:** once the Edge Functions exist and their egress IP(s) are known, come back to this key in Credentials and switch Application restrictions from "None" to "IP addresses". Until then, the key is protected only by the API restriction (Places API (New) only) — a real but partial safeguard, not a substitute for the IP restriction.
- Store the key somewhere safe — it'll go into Supabase as a secret (not in `.env.local`, since this key is used server-side in the Edge Functions, never exposed to the browser)

### 2b. NZBN API setup (second verification source)

- Register at [business.govt.nz](https://portal.api.business.govt.nz) and subscribe to the **NZBN API product** (free, subscription-key method — no OAuth needed for basic search/lookup)
- Store the subscription key alongside the Places key as a Supabase secret
- Note: matching is by business/trading name, not `place_id` — some breweries' registered legal entity name may differ from their trading name (e.g. "Choice Bros Brewing" vs. whatever name they're actually incorporated under), so this step may need a bit of manual name-mapping for a handful of entries rather than a clean automatic match for all 18. See the Excise CCA List section below for a concrete illustration of how tangled this can get (Panhead/Boneface/Neilson).

### 3. Supabase Edge Functions — the core automation

Edge Functions run on Supabase's servers, written in TypeScript/Deno (different from the React/Vite code in the main app — new syntax, new environment, but conceptually just "a script that runs on a schedule and does some work").

**Design change from this doc's original plan (20 July):** originally scoped as one combined function doing closure-check, discovery, and description generation in a single run. Split into two separate functions instead once it came time to actually build discovery — reasoning: different Places API cost tiers (`businessStatus` is cheap, `websiteUri` sits in a pricier SKU), independent testing/scheduling needs, and not wanting untested new discovery code to risk the already-proven closure-check function.

#### 3a. `brewery-sync` — closure-check — ✅ built, deployed, and tested 20 July

For every row in `breweries` that has a `place_id`, call the Places API's place details endpoint, read the `businessStatus` field. If it comes back `CLOSED_PERMANENTLY`, set `flagged_for_review = true` on that row — **not** `is_active = false`. This is a deliberate correction to this doc's original wording: the two-source-agreement rule described in the 13 July update above (Places + NZBN must both agree before auto-closing) applies from day one, not just once NZBN is wired in. Since NZBN isn't integrated yet, a lone Places "closed" signal can only ever flag for review; the auto-close path (flipping `is_active`) will only activate once step 2b (NZBN API) lands. Update `last_verified` regardless of outcome, including on a failed check for an individual brewery (one bad API call shouldn't leave that row's `last_verified` looking falsely fresh, and shouldn't stop the rest of the run).

Tested against all 18 live breweries: `{"checked":18,"flagged":0,"errors":[]}` — expected result, since nothing's actually closed.

**Setting this up practically:**
- Install the Supabase CLI locally — ✅ done 14 July, as an npm dev dependency (not global — invoke via `npx supabase ...` in PowerShell, not a bare `supabase` command)
- Scaffold the function (`supabase functions new brewery-sync`) — ✅ done 14 July
- Write the function logic — ✅ done 20 July
- **Note on pattern used:** by 20 July, Supabase's own default template had moved on from the plan's original assumption of a manually-created `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` client inside a raw `Deno.serve`. The function instead uses the newer `withSupabase` wrapper from `@supabase/server` (`import { withSupabase } from "npm:@supabase/server"`), exporting `default { fetch: withSupabase({ auth: 'secret' }, handler) }`. `auth: 'secret'` suits this function since it's triggered by a schedule or a manual call, not a signed-in user — `ctx.supabaseAdmin` gives the RLS-bypassing client needed to write across all rows. This requires `verify_jwt = false` in `supabase/config.toml` for this function (already present from the 14 July scaffold, no edit needed). Same pattern applies to `brewery-discover` below.
- Set the Google Places API key as a Supabase secret — ✅ done 20 July, via the Dashboard (Settings → Edge Functions → Secrets), named `GOOGLE_PLACES_API_KEY`. Shared by both functions — no separate key needed for `brewery-discover`.
- Deploy the function — ✅ done 20 July, via `npx supabase functions deploy brewery-sync --project-ref ihcvoqapgcdnoggegrcl`
- Test it manually first — ✅ done 20 July. New-format secret keys (`sb_secret_...`) aren't JWTs and must go on the `apikey` header, not `Authorization: Bearer` — a gotcha worth remembering for any future manual test calls.
- Once egress IPs are known post-deploy, circle back to the Google Cloud key (see step 2) and add the IP application restriction — still outstanding.

#### 3b. `brewery-discover` — discovery — 🔄 built and deployed 20 July, not yet successfully tested

Text-searches Google Places for `"brewery in Wellington, New Zealand"`, biased (not restricted) to a 50km circle around Wellington CBD — wide enough to catch outlying breweries like Kapiti Coast without excluding results further out. For each result:
- Skip if `place_id` already exists in the table (dedup is by `place_id`, not name — this correctly handles multi-site brands like Garage Project, unlike name-based matching, which is what missed Wild Workshop when checked manually on 17 July; see "Known blind spot — multi-site brands" below)
- If new: insert a row with `name`, `address`, `latitude`, `longitude`, `website` (from Places' `websiteUri` if available, else null), `place_id`, `is_active = true`, `last_verified = now()`, **and `flagged_for_review = true`** — this last field is a necessary correction to this doc's original step-2 sketch: without it, a fresh auto-insert wouldn't actually surface in the exceptions report (3d below), since `last_verified = now()` on insert means the staleness clause wouldn't catch it either.

`description` is deliberately left null on insert — that's the not-yet-built description-generation step (3c below).

**Website field requirement** (carried over from the 17 July update below): the `website` field must always be checked and populated for every newly-discovered brewery — never left null by default. When Places' `websiteUri` is present, it's used directly. When absent, the row still gets inserted (with `website` null) but `flagged_for_review = true` already ensures it surfaces for a manual follow-up rather than quietly shipping with a missing link — this closes the same gap first found manually on 17 July, where 7 of the then-18 breweries had a null `website` despite most having a real, findable site.

**Setting this up practically:**
- Scaffold the function (`supabase functions new brewery-discover`) — ✅ done 20 July
- Write the function logic — ✅ done 20 July
- Deploy the function — ✅ done 20 July, via `npx supabase functions deploy brewery-discover --project-ref ihcvoqapgcdnoggegrcl`
- Test it manually — ❌ blocked as of 20 July by an unresolved Supabase secret-key validation issue affecting both functions (new `sb_secret_...` keys consistently return `401 INVALID_CREDENTIALS` against both `brewery-sync` and `brewery-discover` — a project-level issue, not specific to either function's code). No end-to-end confirmation yet that discovery correctly finds/dedupes/inserts breweries.
- **`dryRun` safety flag** — discussed as worth adding before the first real (non-401) test run, since this function writes directly to the live `breweries` table. Not yet implemented. Given it writes to production data on an untested code path, strongly worth adding before trusting the first real run, even with `flagged_for_review = true` as a backstop.

#### 3c. Description generation — not yet built

Originally scoped as "step 3" of the combined function: call the Anthropic API with a newly-discovered brewery's name, address, and any editorial summary Places provides, and write a 1-2 sentence description matching the tone of existing entries. Now likely belongs inside `brewery-discover` (only relevant to freshly-inserted rows) once that function's core discovery logic is proven working — not yet decided for certain.

### 3d. Exceptions report — a single place to see what needs a human look

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

Before the sync function is useful, the existing rows need their `place_id` filled in — otherwise the closure-check step (3a, above) has nothing to check them against, and the discovery step (3b, above) might re-insert them as "new" duplicates.

This is a one-off task: for each brewery, look up its Places `place_id` (can be done via the Places API text search once, matching by name/address) and update the row. Small, bounded piece of work — worth doing as step zero before the automation goes live.

### 5. Schedule the functions

Once each is tested manually and working, use Supabase's scheduled triggers (`pg_cron` extension, or Supabase's built-in cron for Edge Functions) to run them on a cadence — weekly is a reasonable starting point for each, adjustable later. `brewery-sync` and `brewery-discover` don't need to run on the same schedule — they're independent now.

---

## Known blind spot — multi-site brands (found 17 July, via Garage Project Wild Workshop)

Discovery-by-name approaches (Places text search, excise CCA list, Brewers Guild list) all key on business name. A brand with **more than one physical site under the same name** looks like a duplicate to that kind of matching, not a new entry — so a second (or third) venue can be silently skipped even when the core system is working correctly.

This surfaced concretely with Garage Project: it turned out to have a fourth central-Wellington site, **Wild Workshop** (7 Furness Lane, Te Aro — a barrel-ageing/mixed-fermentation taproom and cellar door, distinct from both the Aro Street original and Leeds Street), that hadn't made it into the directory despite Garage Project's other two sites being present. Garage Project's own website contact page doesn't list it either — it shows a single head-office address, so even a manual check against the "official" source wouldn't have caught it.

The source that did catch it: a **regional tourism board page** (wellingtonnz.com's Garage Project write-up), which described all three central Wellington locations together, written for visitors rather than for data-matching purposes.

**Implication for the automation design**: `brewery-discover`'s dedup logic is by `place_id`, not name, which is the correct defence against this specific trap — a second site under the same brand gets its own `place_id` and won't be silently skipped. The remaining gap is different: Text Search may simply not *surface* every site of a multi-venue brand in its results at all, regardless of how dedup is implemented, since that depends on Places' own ranking and search radius rather than anything in this codebase. Once the core Places/NZBN two-source system is proven, worth adding a periodic manual (or semi-automated) cross-check against regional tourism sites for any brand already in the directory that's grown past a single site — same "not a live API, occasional manual check" category as Beervana and the Brewers Guild annual report below. Not a blocker for the initial build, but a known gap in the design's discovery coverage that shouldn't be assumed solved by Places/NZBN alone.

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

These sources don't have APIs and aren't part of the scheduled Edge Functions. Worth a quick manual glance on roughly this cadence:

- **Brewers Guild annual report** — published each year (usually mid-year, after the AGM). When the new one drops, spot-check its member list against your directory: anything newly listed that you're missing, anything you have that's dropped off. Also a good moment to reconsider Martinborough Brewery (Wairarapa) if scope ever expands past Wellington/Hutt/Kāpiti.
- **Beervana exhibitor list** — refreshes each year ahead of the August festival. Worth a glance for the "New Kids On The Block" stand specifically (new breweries from the past 12 months) and as a "still trading" spot-check for anything the automated system flagged as uncertain.
- **NZ Customs Excise CCA List** — republished periodically at customs.govt.nz. Worth pulling a fresh copy every 6-12 months and diffing against the last saved snapshot in `docs/sources/` to catch address changes, ownership changes, or new licences.
- **Regional tourism board pages** (e.g. wellingtonnz.com) — added 20 July, per the multi-site blind spot above. Worth a glance for any brand already in the directory, to catch additional venues that name/place_id-based automated discovery might not surface.

Neither of these needs a calendar reminder or anything formal — just worth doing whenever you happen to be in the app doing other work around those times of year.

## Phase 2 (future enhancement, not part of the initial build)

**Ministry of Justice — Register of Licences & Certificates**, as a third, even-stronger verification signal. A brewery legally cannot sell alcohol without an active on-licence or off-licence under the Sale and Supply of Alcohol Act 2012 — so a brewery dropping off this register is about as authoritative a "no longer trading" signal as exists.

Not part of the first build because it's a bulk file (updated quarterly — Feb/May/Aug/Nov), not a live API — a different integration pattern (download + parse + match) from the live Places/NZBN API calls. Worth adding once the core two-source system is working and proven, as a periodic (quarterly) extra cross-check rather than something the scheduled weekly job queries directly.

**NZ Customs Excise CCA List** — see the dedicated section above. Same periodic-manual-cross-check treatment as the MoJ register.

## Open questions to think about before/during next session

- **Region scope**: start with Wellington-only automation (matches current data), or build for national from the start since the code doesn't really care? (Recommend: keep Wellington-scoped for now, it's simpler to verify correctness, expand the search query's geographic bounds later once trusted.)
- **National expansion, when it happens**: use the manual cross-checks listed above (Brewers Guild annual report, Brewers Association national list, NZ Ale Trail, Beervana) as the *starting checklist* — pull names from each, cross-verify every one against Places/NZBN before adding, same standard applied to today's 18 Wellington breweries. Don't skip verification just because a name appears on an "official-looking" list — the Brewers Association's list turned out to be a decade stale, so treat every source as a lead to check, not a fact to trust.
- **Schedule frequency**: weekly is a reasonable default, but worth deciding based on how "urgent" catching a closure feels vs. API cost.
- **Manual override**: should there be a simple way to force `is_active = false` on a brewery manually (e.g. if you hear about a closure before automation catches it)? Partially answered by the `status`/`status_note` fields shipped 17 July — see `architecture.md` — which cover *temporary* closures via Supabase's Table Editor. Still open: whether a similar quick manual path is worth building for *permanent* closures too, or whether editing `is_active` directly via Table Editor remains fine for that rarer case.
- **Supabase secret-key issue** — new `sb_secret_...` keys returning `401 INVALID_CREDENTIALS` against both deployed functions as of 20 July. Needs the GitHub API-keys migration thread read and/or a Supabase support ticket filed before either function can be manually tested/trusted further.

## 17 July update — website field audit and process fix

All 18 active breweries had their `website` field audited via a direct SQL pull (`select name, website from breweries where is_active = true order by name;`). 7 rows were null (Duncan's Brewing Company, Abandoned Brewery, Baylands Brewery, Kereru Brewing, North End Brewing, Te Aro Brewing Company) — all had real, verifiable websites that simply hadn't been captured when the rows were added manually. All 7 corrected via SQL update, cross-referenced against live web search before writing. All 18 rows now have a populated `website` field.

This was a manual data-hygiene pass, not an automated one, but it directly informed the **website field requirement** added to the discovery-logic notes under step 3b above — the same gap would otherwise resurface automatically once the Edge Function starts inserting new rows unsupervised.

## Suggested order for next session

1. ~~Run the schema changes~~ — ✅ done
2. ~~Update `App.jsx` to filter on `is_active`~~ — ✅ done
3. ~~Set up Google Cloud billing + Places API key~~ — ✅ done (IP application restriction still deferred, see step 2 above)
4. ~~Backfill `place_id` for the existing breweries~~ — ✅ done
5. ~~Install Supabase CLI, scaffold the Edge Function(s)~~ — ✅ done (both `brewery-sync` and `brewery-discover` now scaffolded)
6. ~~Write, deploy, and test the closure-check logic (`brewery-sync`)~~ — ✅ done 20 July
7. Write and deploy the discovery logic — ✅ built and deployed 20 July as a separate function, `brewery-discover`. ⚠️ Not yet manually tested — blocked by the unresolved Supabase secret-key issue above. ← pick this back up first, once that's resolved
8. Add the Anthropic description-generation step (3c above) — not yet started
9. Schedule both functions on a cadence (`pg_cron` or Supabase's built-in cron) once each is proven working

This is realistically **2-4 sessions** of work at your usual pace, not a single sitting — the remaining steps involve tooling/debugging friction that's already shown up more than once (the Supabase secret-key issue being the current example), so budget time for troubleshooting along the way.
