// scripts/check-data-quality.mjs
//
// Validates active breweries against craftbeer.kiwi's standing data-quality
// rules — the things that are supposed to always be true but nothing
// currently checks. Run before publishing/reactivating any brewery:
//
//   node --env-file=.env.local scripts/check-data-quality.mjs
//
// Needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the env file
// (the same publishable key the frontend already uses — read-only,
// respects RLS, no secret key needed).
//
// By default this points wherever .env.local points — which for local
// dev is craftbeer-kiwi-DEV, not production (see architecture.md). To
// check production instead, pass its URL/key directly:
//
//   node --env-file=.env.production.local scripts/check-data-quality.mjs
//
// (create .env.production.local yourself, gitignored, with production's
// VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY from the Vercel dashboard —
// or just export them in the shell for one run instead of a new file.)
//
// Checks, in order:
//   1. getBreweryTheme() entry exists for every has_theme=true brewery   [FAIL]
//      (DEC-019/theme_required_to_publish constraint's actual intent —
//      has_theme should mean "code has this," not just "flag is set")
//   2. website is never null                                            [FAIL]
//      (DEC-003 — standing rule since 17 July)
//   3. description is never null                                        [WARN]
//      (not a formal DEC yet, but the exact gap found 31 July — DEC-030)
//   4. nzbn is either set, or the row is on_watchlist explaining why    [WARN]
//      (every known gap today is watchlisted per TD-024 — an
//      unexplained null would be a genuinely new gap worth a look)
//
// Sets a non-zero process.exitCode if any FAIL-level check finds
// something. WARN-level issues print but don't fail the run.
//
// Note: this deliberately uses process.exitCode rather than calling
// process.exit() anywhere after the Supabase query. Calling process.exit()
// immediately after a supabase-js/fetch call can race with the network
// handle still closing on Windows and crash with a libuv
// "UV_HANDLE_CLOSING" assertion (nodejs/node#56645) — cosmetic, since the
// check output itself is unaffected, but avoidable by letting Node exit
// naturally once the script's work is done.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

async function main() {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error(
      'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.\n' +
      'Run with: node --env-file=.env.local scripts/check-data-quality.mjs'
    )
    process.exitCode = 1
    return
  }

  console.log(`Checking ${SUPABASE_URL}\n`)

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  const { data: rows, error } = await supabase
    .from('breweries')
    .select('name, has_theme, website, description, nzbn, on_watchlist')
    .eq('venue_type', 'brewery')
    .eq('is_active', true)

  if (error) {
    console.error('Supabase query failed:', error.message)
    process.exitCode = 1
    return
  }

  let failed = false
  const fail = (title, names) => {
    failed = true
    process.exitCode = 1
    console.error(`\n✗ ${title}\n`)
    for (const n of names) console.error(`  - ${n}`)
  }
  const warn = (title, names) => {
    console.warn(`\n⚠ ${title}\n`)
    for (const n of names) console.warn(`  - ${n}`)
  }

  // --- Check 1: theme entries actually exist in App.jsx ---

  const appJsxPath = new URL('../src/App.jsx', import.meta.url)
  const source = readFileSync(appJsxPath, 'utf8')

  const start = source.indexOf('function getBreweryTheme')
  const end = source.indexOf('return themes[name]', start)

  if (start === -1 || end === -1) {
    console.error(
      "Couldn't find getBreweryTheme() in src/App.jsx — has it been renamed or restructured? " +
      'This script parses it as text, so a structural change needs a matching update here.'
    )
    process.exitCode = 1
    return
  }

  const themesBlock = source.slice(start, end)
  const keyPattern = /^\s*(['"])((?:(?!\1).)+)\1\s*:\s*\{\s*fill:/gm

  const codeNames = new Set()
  let match
  while ((match = keyPattern.exec(themesBlock)) !== null) {
    codeNames.add(match[2])
  }

  const flaggedNames = new Set(rows.filter((r) => r.has_theme).map((r) => r.name))

  const missingFromCode = [...flaggedNames].filter((n) => !codeNames.has(n))
  const orphanedInCode = [...codeNames].filter((n) => !flaggedNames.has(n))

  if (missingFromCode.length > 0) {
    fail(
      `${missingFromCode.length} brewer${missingFromCode.length === 1 ? 'y has' : 'ies have'} has_theme = true ` +
      `but NO matching entry in getBreweryTheme() (rendering the default orange fallback):`,
      missingFromCode
    )
  }
  if (orphanedInCode.length > 0) {
    warn(
      `${orphanedInCode.length} theme entr${orphanedInCode.length === 1 ? 'y exists' : 'ies exist'} in App.jsx ` +
      `with no matching active, has_theme=true brewery in THIS environment ` +
      `(if you're checking DEV, this is expected — production breweries won't exist here; ` +
      `otherwise usually a rename or deactivation worth a glance):`,
      orphanedInCode
    )
  }

  // --- Check 2: website never null (DEC-003) ---

  const missingWebsite = rows.filter((r) => !r.website).map((r) => r.name)
  if (missingWebsite.length > 0) {
    fail(`${missingWebsite.length} brewer${missingWebsite.length === 1 ? 'y is' : 'ies are'} missing a website (DEC-003):`, missingWebsite)
  }

  // --- Check 3: description never null (informal rule, DEC-030) ---

  const missingDescription = rows.filter((r) => !r.description).map((r) => r.name)
  if (missingDescription.length > 0) {
    warn(`${missingDescription.length} brewer${missingDescription.length === 1 ? 'y is' : 'ies are'} missing a description:`, missingDescription)
  }

  // --- Check 4: nzbn set, or watchlisted with a reason (TD-024) ---

  const unexplainedNzbnGap = rows.filter((r) => !r.nzbn && !r.on_watchlist).map((r) => r.name)
  if (unexplainedNzbnGap.length > 0) {
    warn(
      `${unexplainedNzbnGap.length} brewer${unexplainedNzbnGap.length === 1 ? 'y has' : 'ies have'} no nzbn and aren't on_watchlist ` +
      `(every known gap today is watchlisted per TD-024 — this looks like a new, unexplained one):`,
      unexplainedNzbnGap
    )
  }

  // --- Summary ---

  if (failed) {
    console.error(`\nFix the FAIL items above before publishing/reactivating. WARN items are worth a look but won't block.\n`)
  } else {
    console.log(`\n✓ All ${rows.length} active breweries pass the standing data-quality rules (theme, website). Check warnings above for anything else worth a glance.`)
  }
}

await main()
