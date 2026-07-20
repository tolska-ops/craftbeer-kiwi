// supabase/functions/brewery-sync/index.ts
//
// Step 6 of the automation plan: closure-check logic only.
// Discovery (new breweries) and description generation are separate,
// later steps — not included here.
//
// Design rule (deliberate, not an oversight): a single Places
// "closed" signal does NOT set is_active = false. NZBN isn't wired
// in yet, so per the two-source-agreement safety rule elsewhere in
// the automation plan, a lone Places signal only sets
// flagged_for_review = true for a human to check. Auto-closing on
// Places alone can be enabled once NZBN cross-checking exists.
//
// This function isn't user-facing — it's called by a scheduled job
// (or manually via curl) using the project's secret key, so it uses
// auth: 'secret' rather than 'user'. ctx.supabaseAdmin bypasses RLS,
// which is what we want for writing last_verified/flagged_for_review
// across all rows.

import { withSupabase } from "npm:@supabase/server";

const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY")!;
const PLACES_FIELD_MASK = "id,businessStatus";

interface Brewery {
  id: string;
  name: string;
  place_id: string | null;
}

interface PlaceDetailsResponse {
  id?: string;
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";
}

export default {
  fetch: withSupabase({ auth: "secret" }, async (_req, ctx) => {
    const { data: breweries, error: fetchError } = await ctx.supabaseAdmin
      .from("breweries")
      .select("id, name, place_id")
      .not("place_id", "is", null);

    if (fetchError) {
      return Response.json(
        { error: `Failed to fetch breweries: ${fetchError.message}` },
        { status: 500 },
      );
    }

    const results = {
      checked: 0,
      flagged: 0,
      errors: [] as { brewery: string; message: string }[],
    };

    for (const brewery of (breweries ?? []) as Brewery[]) {
      try {
        const status = await getBusinessStatus(brewery.place_id!);
        results.checked++;

        const updates: Record<string, unknown> = {
          last_verified: new Date().toISOString(),
        };

        if (status === "CLOSED_PERMANENTLY") {
          updates.flagged_for_review = true;
          results.flagged++;
        }

        const { error: updateError } = await ctx.supabaseAdmin
          .from("breweries")
          .update(updates)
          .eq("id", brewery.id);

        if (updateError) {
          results.errors.push({ brewery: brewery.name, message: updateError.message });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.errors.push({ brewery: brewery.name, message });

        await ctx.supabaseAdmin
          .from("breweries")
          .update({ last_verified: new Date().toISOString() })
          .eq("id", brewery.id);
      }
    }

    return Response.json(results);
  }),
};

async function getBusinessStatus(placeId: string): Promise<string | undefined> {
  const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": PLACES_FIELD_MASK,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Places API ${response.status}: ${body}`);
  }

  const data = (await response.json()) as PlaceDetailsResponse;
  return data.businessStatus;
}
