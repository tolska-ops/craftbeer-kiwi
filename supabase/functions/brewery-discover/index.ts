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
//    so outlying breweries like Kapiti Coast aren't missed).
// 2. For each result, skips it if place_id already exists in the
//    breweries table (dedup is by place_id, not name — this is what
//    correctly handles multi-site brands like Garage Project having
//    several venues, unlike name-based matching, which is the trap
//    that missed Wild Workshop when checked manually on 17 July).
// 3. Inserts genuinely new places with flagged_for_review = true.
//    This isn't optional polish — without it, a fresh auto-insert
//    wouldn't actually surface in the exceptions report query from
//    the automation plan (step 3b), since last_verified = now() on
//    insert means the staleness clause wouldn't catch it either.
// 4. description is left null — that's step 8 (Anthropic-generated
//    descriptions), not built yet. website is populated from Places'
//    websiteUri when available, left null otherwise — nothing to
//    backfill if Places itself doesn't have one.
//
// Known limitation (not something this function can fix): Text
// Search may not surface every site of a multi-venue brand in a
// single pass, regardless of dedup logic. Per the automation plan's
// "Known blind spot" section, periodic manual cross-checks against
// regional sources remain the backstop for that, not something to
// expect this function to solve alone.

import { withSupabase } from "npm:@supabase/server";

const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY")!;

// Wellington CBD centre. Radius is generous (50km) since locationBias
// is a soft hint, not a hard cutoff — wide enough to still catch
// Kapiti Coast (e.g. Duncan's, Paraparaumu, ~50km out) without
// excluding results further out entirely.
const SEARCH_QUERY = "brewery in Wellington, New Zealand";
const BIAS_CENTER = { latitude: -41.2865, longitude: 174.7762 };
const BIAS_RADIUS_METERS = 50000;

const SEARCH_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.businessStatus";

interface PlaceResult {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  websiteUri?: string;
  businessStatus?: string;
}

interface SearchTextResponse {
  places?: PlaceResult[];
}

export default {
  fetch: withSupabase({ auth: "secret" }, async (_req, ctx) => {
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
      places = await searchBreweries();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json({ error: `Places search failed: ${message}` }, { status: 502 });
    }

    const results = {
      found: places.length,
      inserted: 0,
      skipped: 0,
      errors: [] as { place: string; message: string }[],
    };

    for (const place of places) {
      if (existingIds.has(place.id)) {
        results.skipped++;
        continue;
      }

      const name = place.displayName?.text ?? "Unknown";

      try {
        const { error: insertError } = await ctx.supabaseAdmin.from("breweries").insert({
          name,
          address: place.formattedAddress ?? null,
          latitude: place.location?.latitude ?? null,
          longitude: place.location?.longitude ?? null,
          website: place.websiteUri ?? null,
          place_id: place.id,
          is_active: true,
          last_verified: new Date().toISOString(),
          flagged_for_review: true,
        });

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

async function searchBreweries(): Promise<PlaceResult[]> {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: SEARCH_QUERY,
      maxResultCount: 20,
      locationBias: {
        circle: {
          center: BIAS_CENTER,
          radius: BIAS_RADIUS_METERS,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Places API ${response.status}: ${body}`);
  }

  const data = (await response.json()) as SearchTextResponse;
  return data.places ?? [];
}
