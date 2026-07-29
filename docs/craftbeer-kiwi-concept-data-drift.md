# Concept Snapshot: Brewery Data Drift

**One-liner:** A brewery isn't a static record — name, address, ownership, website content, and branding all change over its life, at different rates and with different consequences if craftbeer.kiwi doesn't notice. Today's automation only watches one axis (does it still exist); everything else is either a manual one-off or a full gap.

## Why this exists

Raised as a sanity check (30 July) after the `region`/`ownership_type`/`has_taproom` backfill — those three columns were populated once, correctly, from a point-in-time check. Nothing re-checks them. That's fine for a young directory where "once, correctly" is still true, but it's a silent expiry date, not a permanent fact. Worth naming the full shape of the problem once, rather than discovering each gap the hard way (which is how the relocation blind spot was found — twice, via Three Sisters and Te Aro Brewing, both already lived through manually).

## The core distinction

**Detected vs. monitored are different states.** `brewery-sync`'s closure-check is genuinely monitored — it runs, it compares, it flags. Almost everything else on the annex below is "detected once, by a human, at a point in time" — which reads as done in a doc, but isn't the same claim as "will still be true in six months." This is the same "true so far isn't assumed true" principle already applied to nullable defaults (`DEC-021`, `DEC-025`, `DEC-026`) — extended here from *new-row defaults* to *existing-row staleness*, which is a related but distinct failure mode: a default can be wrong on arrival, but a monitored-once value can be right on arrival and become wrong later without anyone touching it.

## Annex: change types, likely frequency, current coverage, mitigation

| What changes | Likely frequency | Currently watching? | Mitigation |
|---|---|---|---|
| **Permanent closure** | Rare per-brewery, but expected at fleet scale over years | ✅ Yes — Places `businessStatus` + NZBN legal status, two-source-agreement rule (`DEC-005`) | Working as designed. No action needed. |
| **Temporary closure** (renovation, flood, etc.) | Occasional, brewery-specific, unpredictable | ⚪ Deliberately manual (`status`/`status_note`) | Correct as-is — can't be auto-detected from a brewery's own signals; keep manual. |
| **New brewery opens** | Steady trickle, expect a few per year in Wellington alone | 🟡 Partial — `brewery-discover`'s Places search, cross-checkable against Brewers Guild list | Both sources are member/searchable-only; a quiet launch with no Places listing yet sits outside both. Low-cost fix: none obvious beyond periodic re-runs — accept as a coverage lag, not a fixable gap. |
| **Relocation** (same brand, new address) | Uncommon but real — already hit twice (Three Sisters, Te Aro Brewing) | 🔴 Not watched — old address correctly flags closed, new address (if found at all) surfaces as an unrelated "new" candidate | **Buildable soon:** fuzzy name-match heuristic in `brewery-discover` — flag candidates matching an existing (including recently-closed) row name within a radius as "possible relocation, review" rather than dropping into the ordinary new-candidate bucket. |
| **New venue, existing brand** (e.g. a 4th Garage Project site) | Occasional, concentrated among the larger/multi-site brands | 🔴 Same blind spot as relocation — already documented in `automation-plan.md` | Same fuzzy name-match heuristic above would likely catch both cases with one piece of work. |
| **Rename / rebrand, same address, same business** | Rare | 🔴 Not watched — closure-check's field mask is deliberately `businessStatus`-only, never re-pulls `displayName` | **Buildable soon:** periodic full-field refresh comparing `displayName`/`websiteUri` against stored values, dropping drift into an exceptions report (detect-and-flag, never auto-overwrite). |
| **Ownership change / acquisition** | Uncommon but live in the industry right now (Three Sisters acquiring Sunshine Brewing, Gisborne, is a real concurrent example) | 🔴 Snapshot only — `ownership_type` populated once (30 July) from a single NZBN check | **Needs the NZBN API live first:** once integrated, a scheduled quarterly re-verification pass against existing rows, not just new ones. |
| **Website description / brand voice text** | Unpredictable, brewery-specific | 🔴 Full gap — `description` is deliberately null, no content-reading automation exists at all | **Needs its own design, not a quick add:** realistic version is a periodic Claude-API-assisted fetch-and-compare pass flagging "reads differently than last time" for human review — never auto-publishing description text. |
| **Colour theme / visual branding** | Unpredictable, brewery-specific, likely rare per-brewery but real (rebrands happen) | 🔴 Full gap — `getBreweryTheme` entries are hand-curated once in `App.jsx`, no refresh mechanism | Same category as description monitoring above — folds into the same future content-monitoring design rather than a separate mechanism. |
| **`has_taproom`** | Low — taproom presence is a fairly sticky physical fact once true | 🔴 Snapshot only, populated 30 July | Lower priority to re-check than ownership/name, given how sticky this fact usually is — but same underlying gap. |

## Two different shapes of fix — don't treat as one project

**Cheap and structural** (extends existing Places/NZBN-based automation, buildable without new design work):
- Relocation/new-venue fuzzy-match heuristic in `brewery-discover`
- Periodic `displayName`/`websiteUri` drift check extending closure-check's existing pull
- NZBN-backed `ownership_type` re-verification, once the API integration is live

**Needs real design, don't rush it** (no existing scaffolding, genuinely different kind of work):
- Website content monitoring (description text, colour/branding) — the one area with a real risk of a bad automated guess being worse than a stale-but-known value, so needs its own scoping session rather than folding into the automation-plan's existing Places/NZBN pattern.

## Related terms you'll bump into

- **Data drift** — the general phenomenon of a stored value becoming wrong over time not because it was captured incorrectly, but because the real-world thing it describes changed after capture. Distinct from a data-quality bug (wrong on arrival).
- **Point-in-time snapshot** — a value that's accurate as of when it was checked, with no implicit claim about later accuracy. Most of craftbeer.kiwi's brewery attributes are currently this, whether or not that's obvious from reading the schema.
- **Detect-and-flag vs. auto-correct** — the pattern already established for closure detection (two-source agreement before acting) and reused throughout this annex: automation should surface drift for human review, not silently overwrite based on a single signal.

---
*Concept snapshot — craftbeer.kiwi project reference set*
