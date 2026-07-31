// scripts/check-geocode-drift.mjs
//
// TD-045 / DEC-033: one-off (and re-runnable) check comparing each brewery's
// stored latitude/longitude against an independently-geocoded coordinate
// from Mapbox, using the stored `address` as input.
//
// This is READ-ONLY. It never writes to Supabase. It reports exceptions
// only (per DEC-032) - rows where the two sources disagree by more than
// the tolerance, or where Mapbox couldn't geocode the address at all.
// Andy reviews the list and decides row-by-row whether to update
// latitude/longitude manually.
//
// Run against DEV first:
//   node --env-file=.env.local scripts/check-geocode-drift.mjs
// Then against production:
//   node --env-file=.env.production.local scripts/check-geocode-drift.mjs
//
// Required env vars (confirm these match your actual .env.local names
// before running - adjust below if they differ):
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_PUBLISHABLE_KEY   (or VITE_SUPABASE_ANON_KEY, whichever
//                                     your project uses - same publishable
//                                     key check-data-quality.mjs reuses,
//                                     no new credentials needed)
//   VITE_MAPBOX_TOKEN                (the same public token App.jsx uses
//                                     for the map - Mapbox's Geocoding API
//                                     works with a standard pk.* token)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const MAPBOX_TOKEN = process.env.VITE_MAPBOX_TOKEN;

// Flag anything more than this far from the stored point.
const TOLERANCE_METERS = 250;

// Be polite to Mapbox's rate limits even though 24-ish rows won't come
// close to hitting them - this also matters once national expansion
// means re-running this against hundreds of rows.
const DELAY_MS = 200;

function assertEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("VITE_SUPABASE_URL");
  if (!SUPABASE_KEY) missing.push("VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY");
  if (!MAPBOX_TOKEN) missing.push("VITE_MAPBOX_TOKEN");
  if (missing.length) {
    console.error(`Missing required env var(s): ${missing.join(", ")}`);
    console.error("Check the variable names at the top of this script against your .env file.");
    process.exitCode = 1;
    return false;
  }
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Haversine distance in metres between two lat/lng points.
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function geocode(address) {
  const query = encodeURIComponent(`${address}, New Zealand`);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&country=NZ&limit=1`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Mapbox request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.features || data.features.length === 0) {
    return null; // no match
  }
  const [lng, lat] = data.features[0].center;
  return { lat, lng, placeName: data.features[0].place_name };
}

async function main() {
  if (!assertEnv()) return;

  console.log(`Checking ${SUPABASE_URL}`);
  console.log(`Tolerance: ${TOLERANCE_METERS}m\n`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: breweries, error } = await supabase
    .from("breweries")
    .select("id, name, address, latitude, longitude")
    .order("name");

  if (error) {
    console.error("Failed to fetch breweries:", error.message);
    process.exitCode = 1;
    return;
  }

  let checked = 0;
  let flagged = 0;
  let apiErrors = 0;
  const exceptions = [];

  for (const brewery of breweries) {
    checked++;

    if (!brewery.address) {
      exceptions.push({
        name: brewery.name,
        id: brewery.id,
        reason: "no address stored - cannot geocode",
      });
      flagged++;
      continue;
    }

    try {
      const result = await geocode(brewery.address);

      if (!result) {
        exceptions.push({
          name: brewery.name,
          id: brewery.id,
          reason: `Mapbox found no match for address: "${brewery.address}"`,
        });
        flagged++;
      } else {
        const dist = distanceMeters(
          brewery.latitude,
          brewery.longitude,
          result.lat,
          result.lng
        );
        if (dist > TOLERANCE_METERS) {
          exceptions.push({
            name: brewery.name,
            id: brewery.id,
            reason: `${Math.round(dist)}m from stored coordinates`,
            stored: `${brewery.latitude}, ${brewery.longitude}`,
            mapbox: `${result.lat}, ${result.lng}`,
            mapboxPlaceName: result.placeName,
          });
          flagged++;
        }
      }
    } catch (err) {
      apiErrors++;
      exceptions.push({
        name: brewery.name,
        id: brewery.id,
        reason: `Mapbox request error: ${err.message}`,
      });
    }

    await sleep(DELAY_MS);
  }

  console.log(`Checked: ${checked}  Flagged: ${flagged}  API errors: ${apiErrors}\n`);

  if (exceptions.length === 0) {
    console.log("No exceptions - all coordinates within tolerance of an independent Mapbox geocode.");
  } else {
    console.log("Exceptions (review manually, nothing has been changed):\n");
    for (const ex of exceptions) {
      console.log(`- ${ex.name} (${ex.id})`);
      console.log(`  ${ex.reason}`);
      if (ex.stored) console.log(`  stored:  ${ex.stored}`);
      if (ex.mapbox) console.log(`  mapbox:  ${ex.mapbox}  (${ex.mapboxPlaceName})`);
      console.log("");
    }
  }
}

main();
