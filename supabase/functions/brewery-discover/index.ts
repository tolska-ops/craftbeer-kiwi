// supabase/functions/brewery-discover/index.ts
//
// Step 7 of the automation plan: discovery logic only.
// Deliberately kept separate from brewery-sync (closure-check) —
// different cost profile (websiteUri is a pricier Places SKU than
// businessStatus), different testing/scheduling cadence, and keeps
// the proven closure-check function untouched.
//
// What this does, each run:
// 1. Text-searches Google Places for "brewery" biased to the
//    Wellington region (soft bias, not a hard boundary — wide radius
//    so outlying breweries like Kapiti Coast aren't missed). Query
//    and location can be overridden via ?query=, ?lat=, ?lng=, and
//    ?radius= for testing other regions ahead of the phased national
//    rollout — Wellington remains the default if none are passed.
// 2. Paginates through Places' Text Search results (?nextPageToken)
//    up to MAX_PAGES pages, since a single request is hard-capped at
//    20 results regardless of maxResultCount — confirmed 28 July when
//    a real Wellington venue (Sprig + Fern, Thorndon and Petone) was
//    found missing from a 20-result run even after raising
//    maxResultCount to 100. Bounded rather than unlimited, to keep
//    API cost and result volume sane for larger regions like Auckland.
// 3. For each result, skips it if place_id already exists in the
//    breweries table (dedup is by place_id, not name — this is what
//    correctly handles multi-site brands like Garage Project having
//    several venues, unlike name-based matching, which is the trap
//    that missed Wild Workshop when checked manually on 17 July).
// 4. Inserts genuinely new places with flagged_for_review = true.
//    This isn't optional polish — without it, a fresh auto-insert
//    wouldn't actually surface in the exceptions report query from
//    the automation plan (step 3b), since last_verified = now() on
//    insert means the staleness clause wouldn't catch it either.
// 5. description is left null — that's step 8 (Anthropic-generated
//    descriptions), not built yet. website is populated from Places'
//    websiteUri when available, left null otherwise — nothing to
//    backfill if Places itself doesn't have one.
//
// 6. Dry-run is the default (safe) — pass ?live=true to force a real write
//    to breweries. This reverses the original opt-in design: after the
//    27 July live run showed how much manual triage bars/duplicates
//    needed, dry-run became the hard-blocking default rather than an
//    optional flag (see decisions.md DEC-014/DEC-018). primaryType is
//     kept in the field mask and stored as primary_type on insert, purely
//     as triage metadata for manual review — not used as a filter (the
//     includedType/strictTypeFiltering approach was tried and reverted;
//     see decisions.md DEC-022).
//
// Known limitation (not something this function can fix): Text
// Search may not surface every site of a multi-venue brand in a
// single pass, regardless of dedup logic. Per the automation plan's
// "Known blind spot" section, periodic manual cross-checks against
// regional sources remain the backstop for that, not something to
// expect this function to solve alone.

import { withSupabase } from "npm:@supabase/server";

const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY")!;

// Wellington CBD centre — the default when no query-param override is
// passed. Radius is generous (50km) since locationBias is a soft
// hint, not a hard cutoff — wide enough to still catch Kapiti Coast
// (e.g. Duncan's, Paraparaumu, ~50km out) without excluding results
// further out entirely.
const SEARCH_QUERY = "brewery in Wellington, New Zealand";
const BIAS_CENTER = { latitude: -41.2865, longitude: 174.7762 };
const BIAS_RADIUS_METERS = 50000;

// Hard cap on pagination — bounds both API cost and result volume.
// 4 pages x 20 results = up to 80 candidates per run, well beyond
// what Wellington needed but sized with Auckland (a larger, phase-one
// region) in mind without being unbounded.
const MAX_PAGES = 4;

const SEARCH_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.businessStatus,places.primaryType";

interface PlaceResult {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  websiteUri?: string;
  businessStatus?: string;
  primaryType?: string;
}

interface SearchTextResponse {
  places?: PlaceResult[];
  nextPageToken?: string;
}

export default {
  fetch: withSupabase({ auth: "secret:brewery_sync_v2" }, async (req, ctx) => {
    const url = new URL(req.url);
    const forceLive = url.searchParams.get("live") === "true";
    const dryRun = !forceLive;
    const regionQuery = url.searchParams.get("query") ?? SEARCH_QUERY;
    const lat = Number(url.searchParams.get("lat")) || BIAS_CENTER.latitude;
    const lng = Number(url.searchParams.get("lng")) || BIAS_CENTER.longitude;
    const radiusMeters = Number(url.searchParams.get("radius")) || BIAS_RADIUS_METERS;

    // Existing place_ids, so we can dedup without a query per result.
    const { data: existing, error: existingError } = await ctx.supabaseAdmin
      .from("breweries")
      .select("place_id")
      .not("place_id", "is", null);

    if (existingError) {
      return Response.json(
        { error: `Failed to fetch existing breweries: ${existingError.message}` },
        { status: 500 },
      );
    }

    const existingIds = new Set((existing ?? []).map((row) => row.place_id));

    let places: PlaceResult[];
    try {
      places = await searchBreweries(regionQuery, { latitude: lat, longitude: lng }, radiusMeters);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json({ error: `Places search failed: ${message}` }, { status: 502 });
    }

    const results = {
      dryRun,
      found: places.length,
      inserted: 0,
      skipped: 0,
      skippedNames: [] as string[],
      wouldInsert: [] as Record<string, unknown>[],
      errors: [] as { place: string; message: string }[],
    };

    for (const place of places) {
      if (existingIds.has(place.id)) {
        results.skipped++;
        results.skippedNames.push(place.displayName?.text ?? "Unknown");
        continue;
      }

      const name = place.displayName?.text ?? "Unknown";
      const record = {
        name,
        address: place.formattedAddress ?? null,
        latitude: place.location?.latitude ?? null,
        longitude: place.location?.longitude ?? null,
        website: place.websiteUri ?? null,
        place_id: place.id,
        primary_type: place.primaryType ?? null,
        is_active: true,
        last_verified: new Date().toISOString(),
        flagged_for_review: true,
      };

      if (dryRun) {
        results.wouldInsert.push(record);
        continue;
      }

      try {
        const { error: insertError } = await ctx.supabaseAdmin.from("breweries").insert(record);

        if (insertError) {
          results.errors.push({ place: name, message: insertError.message });
        } else {
          results.inserted++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.errors.push({ place: name, message });
      }
    }

    return Response.json(results);
  }),
};

async function searchBreweries(
  query = SEARCH_QUERY,
  center = BIAS_CENTER,
  radiusMeters = BIAS_RADIUS_METERS,
): Promise<PlaceResult[]> {
  const allPlaces: PlaceResult[] = [];
  let pageToken: string | undefined;
  let page = 0;

  do {
    const body: Record<string, unknown> = pageToken
      ? { textQuery: query, pageToken }
      : {
          textQuery: query,
          maxResultCount: 20,
          locationBias: {
            circle: {
              center,
              radius: radiusMeters,
            },
          },
        };

    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": SEARCH_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`Places API ${response.status}: ${responseBody}`);
    }

    const data = (await response.json()) as SearchTextResponse;
    allPlaces.push(...(data.places ?? []));
    pageToken = data.nextPageToken;
    page++;
  } while (pageToken && page < MAX_PAGES);

  return allPlaces;
}