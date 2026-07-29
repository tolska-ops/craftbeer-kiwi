# Concept Snapshots — Index

Running list of one-page concept references built up during craftbeer.kiwi sessions. Each is a standalone file named `concept-<topic>.md`, kept in project knowledge for retention across sessions.

| Date added | Topic | File | Summary |
|---|---|---|---|
| 24 Jul 2026 | Cron / scheduled jobs | `concept-cron.md` (unhyphenated — rename to `craftbeer-kiwi-concept-cron.md` next time it's touched) | Running tasks automatically on a timer rather than manually triggering them; where it fits for `brewery-sync`/`brewery-discover`. |
| 27 Jul 2026 | Google Places API | `craftbeer-kiwi-concept-google-places.md` | What Places actually does (text search + place details lookup), and why "accurate data" isn't the same as "the right scope of data" — the bars-vs-breweries and duplicate-listing issues from the first `brewery-discover` run. |
| 29 Jul 2026 | Map & discovery app benchmarks | `craftbeer-kiwi-concept-benchmarks.md` | Survey of beer-adjacent directories/APIs (Crafty Pint, RateBeer, Untappd, BeerMenus, TapHunter, NY Craft Beer app) plus left-field cross-industry examples (AllTrails, Komoot, NPS Passport, Vivino, Google Local Guides) — what's genuinely popular vs. well-designed, and what's transferable to the trail/passport, distribution, and heat-map features. |
| 29 Jul 2026 | NZ brewery third-party supplier landscape | `craftbeer-kiwi-concept-nz-brewery-suppliers.md` | Market-research survey of who NZ breweries actually pay — ingredients, packaging, keg rental, insurance, distribution — sourced from the Brewers Guild of NZ's own supplier directory. Not actioned in the build; captured as reference, with a possible future angle on industry-facing sponsorship as a revenue model. |
| 30 Jul 2026 | Brewery data drift | `craftbeer-kiwi-concept-data-drift.md` | Full sanity-check of what actually changes over a brewery's life (closure, relocation, rename, ownership change, website description/branding) against what's currently monitored vs. just detected-once. Annex table with likely frequency and mitigation per change type. Splits fixes into cheap/structural (buildable soon, added to `todo.md`) vs. needing real design (website content monitoring — flagged, not yet scoped). |

---
**To add a new one:** ask for a concept snapshot on the topic, then re-upload both the new `concept-<topic>.md` and this updated index to project knowledge.
