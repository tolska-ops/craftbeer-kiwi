# Concept Snapshot: Google Places API

**One-liner:** Google Places is a paid API that lets you search for and look up real-world businesses/locations — names, addresses, coordinates, opening status — the same underlying data that powers Google Maps search results.

## Where it comes from
Google Maps has always had this data internally (it's what shows up when you search "breweries near me"). The Places API is Google's way of letting *other* developers query that same database programmatically, rather than scraping the Maps website. There's a legacy "Places API" and a newer "Places API (New)" — craftbeer.kiwi deliberately uses the New version, since the legacy one can't even be enabled on new Google Cloud projects anymore.

## The two things you actually use it for
Places isn't one single feature — it's a few distinct capabilities, and craftbeer.kiwi only uses two of them:

1. **Text search** (`brewery-discover` uses this) — send it a query like "craft brewery Wellington New Zealand" and it returns a list of matching places: name, address, coordinates, a unique `place_id`, and (with the right field mask) a `businessStatus`.
2. **Place details / status lookup** (`brewery-sync` uses this) — given a `place_id` you already have stored, ask Google "is this specific place still open?" It returns `OPERATIONAL`, `CLOSED_TEMPORARILY`, or `CLOSED_PERMANENTLY`.

Everything else Places can do (photos, reviews, opening hours, popular times, etc.) — craftbeer.kiwi doesn't touch any of it. Deliberately minimal, matching the field mask (`id,businessStatus` for sync; a similar tight mask for discover) to avoid paying for or handling data you don't need.

## Why it matters (BA lens)
Places is genuinely useful as a **verification and discovery source** — it's real-world, regularly-updated, third-party data you don't have to maintain yourself. But it's built to answer "what places exist matching this search," not "what places are actually breweries." That distinction is the whole story of today's work:

- Places' text search has no concept of "is this a brewery specifically" vs "is this a place where you can drink beer that Google's ranking algorithm associates with the word brewery." A search built around "craft beer" keywords will happily return bars, pubs, and taprooms alongside actual brewing operations — because to Google, all of those are legitimately relevant results for that search. **The API isn't wrong or broken — it's answering a broader question than the one you actually care about.**
- This is exactly why craftbeer.kiwi's first real `brewery-discover` run (27 July) returned 12 "new" places, of which roughly half turned out to be beer bars (The Malthouse, Little Beer Quarter, Golding's Free Dive) rather than breweries — and needed a human to sort real finds from noise.
- Each place also gets its own unique `place_id` — even if it's the *same physical business* as something you already have. If Google's index has two slightly different listings for the same taproom (different name, different entrance, whatever), you'll get two different `place_id`s for what is, in reality, one place. Deduping only by `place_id` (as craftbeer.kiwi's discovery function currently does) catches *exact* re-finds, but not this kind of near-duplicate — which is how "Garage Project Aro Taproom" briefly appeared as a second entry for a brewery already in the directory.

**The practical lesson:** an API that returns real, accurate data can still return the *wrong scope* of data for your specific purpose. "Accurate" and "exactly what I meant" aren't the same claim, and automation built on top of a broad search needs a human review step (or much tighter search criteria) until you're confident the scope problem is solved — which is exactly why a `dryRun` safety flag (return what *would* be inserted, without writing it) was already flagged as worth building before trusting this function's first live run.

## Context examples

**In craftbeer.kiwi:**
- `brewery-sync` calls Place Details on each brewery's stored `place_id` to check `businessStatus` — this is the closure-check automation.
- `brewery-discover` calls Text Search with a brewery-style query to find new candidates — this is where the bar/pub false-positives showed up.
- The known "multi-site brands get missed" blind spot (Garage Project Wild Workshop originally) and the "same place gets a second listing" blind spot (Garage Project Aro Taproom) are actually two different failure modes of the same underlying limitation: Places' search and matching aren't built around your specific mental model of "one row per brewery brand-site."

**In general software/business systems:**
- Any time you buy data or search results from a third-party API, you're getting *their* definition of relevance, not yours — a recruiting tool searching LinkedIn for "software engineer" will return some product managers and QA staff too, because the underlying search is fuzzy by design.
- Address-lookup/geocoding APIs (used for shipping, deliveries, etc.) have the same "technically correct, wrong scope" trap — a geocoder might confidently return a business's old address if its own index hasn't caught up to a recent move.
- This is a general argument for a **review/confirmation step** whenever automation writes based on an external search, rather than a direct-insert pipeline — the "verify before trusting" pattern shows up everywhere external data meets your own database.

## Related terms you'll bump into
- **`place_id`** — Google's unique, stable identifier for a specific place listing. Used as the join key between your `breweries` table and Google's data.
- **Field mask** — the specific list of fields you ask Places to return (e.g. `id,businessStatus`). Keeping this narrow controls cost and avoids handling data you don't use.
- **`businessStatus`** — Places' three-state field: `OPERATIONAL`, `CLOSED_TEMPORARILY`, `CLOSED_PERMANENTLY`. This is what feeds craftbeer.kiwi's two-source-agreement closure rule.
- **Dedup / deduplication** — the general problem of recognising "this is the same real-world thing I already have," which gets harder the fuzzier your matching key is (name matching is fuzzier than `place_id` matching, but even `place_id` matching isn't foolproof, as today showed).

---
*Concept snapshot — craftbeer.kiwi project reference set*
