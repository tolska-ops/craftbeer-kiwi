# Concept Snapshot: Map & Discovery App Benchmarks

**One-liner:** A survey of who does location-based discovery/directory products well — both directly in beer, and "left field" across other industries — with what's actually popular, what's just well-designed, and what's genuinely worth stealing for craftbeer.kiwi.

**Why this exists:** Two separate research passes (29 July) — one scoped to beer/brewery-adjacent APIs and directories, one deliberately broadened to any industry using maps to deliver real value. Captured here as a single reference so the findings don't only live in chat history.

---

## Part 1: Beer & brewery-adjacent (direct competitors/comparables)

| Product | Scale/popularity | What it's actually good at | Verdict for craftbeer.kiwi |
|---|---|---|---|
| **Untappd** | 8–9M users, dominant by far | Social/rating-first, badge & check-in gamification, "Nearby" map bolted on | Wrong category to compete with directly, but the badge mechanics are the best UX reference for the planned trail/passport feature |
| **Vivino** (wine, not beer, but closest cross-beverage comparable) | 54–70M users, largest wine community globally | Label-scan-to-rate, crowdsourced **community-voted awards** ("collectively more trustworthy than a few expert critics") | Philosophical alternative to solo-dev curation — not adopted, but worth knowing it's a credible, wildly popular model if community features are ever considered |
| **RateBeer** | ~0.36% of Untappd's ratings volume — established but fading, not emerging | Still has genuine NZ brewery data (236 active/103 closed) and an open GraphQL API | Best actual candidate for a closure-status cross-check source (already logged in `automation-plan.md`) |
| **BeerMenus** | 7.3M users claimed, 12,000+ US venues | Deliberately narrow — live tap lists only, no social features | Lesson in restraint: succeeded by doing one job well, not chasing Untappd's feature set |
| **TapHunter → absorbed into Evergreen (2026)** | Peaked at 140K daily users | B2B tool + consumer app; let breweries embed a **JSON feed of their own tap list** on their own site | Direct inspiration for the embeddable-widget distribution idea (now logged in `todo.md`) |
| **The Crafty Pint** (Australia) | 5,000+ app downloads — small, even as an established 10+ year media brand | Tiered listings (free basic vs. paid full listing) + loyalty scheme (Crafty Cabal) | Realistic calibration: even a well-regarded, ad-supported AU beer media brand has a tiny audience. Useful monetisation model (tiered listings) for later. No public API, AU-only. |
| **BrewMap.com.au** | No usable traction data found | Explicitly "independent breweries only" positioning | Existence-proof that picking a side on the independent-vs-corporate question is a defensible market position — craftbeer.kiwi deliberately did NOT go this way (see `DEC-025`) |
| **Open Brewery DB** | Popular among developers (widely used in tutorials/side-projects), not consumers | Free, no-auth, worldwide dataset; `brewery_type` field folds `closed` into the type itself | NZ coverage unverified — community-maintained, historically US-centric. Worth a spot-check, not a build-against. Also a useful "what we did differently" schema reference: craftbeer.kiwi's separate `is_active`/`venue_type` fields are arguably a better design than folding closure into type. |
| **NY Craft Beer app** (official NY State Brewers Association app) | Not a scale/download figure, but structurally the closest match | Map of every brewery in-state + 2 integrated "passport" programs with real stamps/rewards, funded by an industry association | Closest direct structural analogue to craftbeer.kiwi's own planned trail/passport — single-region, official-body-backed, not trying to go national/global |

---

## Part 2: Left-field — other industries doing maps-for-discovery well

| Product | Industry | Scale/awards | What's actually transferable |
|---|---|---|---|
| **AllTrails** | Outdoors/hiking | 500,000+ curated trails, widely described as "award-winning" | Heat-maps showing how busy a trail/place is (worth building once real Analytics data exists); an "attractions" filter that includes things like "pub walk" — proof that filtering by vibe/theme, not just location, genuinely drives engagement |
| **Komoot** | Outdoors/cycling & hiking | Garmin Connect IQ **App of the Year 2023** | Wearable/device integration as a genuine differentiator — not urgent for craftbeer.kiwi now, but a data point on what "smart" recognition looks like in this space |
| **Passport to Your National Parks** (NPS / Eastern National, US) | Government/nonprofit tourism | Running since 1986, 1.3M+ passport booklets sold, no app required | The single most directly relevant benchmark: a **tangible, collectible record of "I was here"** is what drives repeat visits, not the technology delivering it. Suggests the planned trail/passport feature should feel physical/collectible (a stamp-style completion graphic) rather than just a checklist. Also validates that a non-corporate distribution partner (tourism board, Brewers Guild) can be a legitimate home for a companion product. |
| **Google Local Guides** | Maps/general | Built into Google Maps itself, huge crowdsourced contributor base | Named badges for specific contribution behaviours (e.g. "Trailblazer" for being first to add a place) — a proven, cheap incentive mechanic that maps directly onto the planned suggest-a-brewery form: recognise first-to-report rather than needing real prizes |

---

## Distilled pattern

None of the genuinely popular examples above are "map apps" as their core value proposition — the map is the *delivery mechanism* for a collecting/completing instinct (trails hiked, parks stamped, wines rated, places added). The map gets someone to a brewery; the collecting is what brings them back for the next one. Worth keeping this front of mind when the trail/passport feature is actually designed, rather than treating it as a secondary feature bolted onto the directory.

## What's already been actioned from this research

- `DEC-025` (decisions.md) — craft-curation question resolved (corporately-owned breweries stay in, informed partly by comparing against BrewMap's opposite positioning)
- `DEC-007` update (decisions.md) — trail completion-payoff + anonymous badges, inspired by NY Craft Beer's passport and Untappd's badge system
- `todo.md` "Distribution plan" — embeddable widget idea, inspired by TapHunter's JSON feed pattern
- `todo.md` "Not started" — brewery popularity/heat-map view, inspired by AllTrails (added same session as this doc)

## Not yet actioned, just captured

- Vivino's crowd-voted-awards model as a possible future curation alternative
- Google Local Guides' "first to report" recognition as a possible incentive for the suggest-a-brewery form
- NPS Passport's physical/tactile model as a design cue for how the trail/passport feature should *feel*, not just function

---
*Concept snapshot — craftbeer.kiwi project reference set*
