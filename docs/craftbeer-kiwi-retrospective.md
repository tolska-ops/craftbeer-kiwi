# craftbeer.kiwi — Project Retrospective

**Covers:** 9 July 2026 to 27 July 2026 (project inception to current session)
**Purpose:** A high-level, time-boxed view of how the project actually unfolded — useful for spotting where effort went, what took longer than expected, and what a realistic pace looks like for planning future phases (e.g. national expansion). This is a companion to architecture.md (what's built) and craftbeer-kiwi-automation-plan.md (what's planned) — this doc is about how the building went, not what exists.

Time estimates are approximate, reconstructed from session content and scope rather than logged timestamps — treat them as ballpark, not precise. At Andy's stated pace of roughly 5-8 hrs/week, total effort to date (approx. 27.5-32 hrs across 19 days) tracks roughly as expected for someone fitting this around a full-time job.

---

## Block 1 - Concept and planning (9-11 July) - approx 4.5 hrs

- Implementation guide drafted and delivered as PDF; troubleshot a wkhtmltopdf rendering bug (forced page-breaks causing blank pages), fixed via CSS page-break-inside: avoid
- Initial scaffold attempted with Create React App, hit deprecation warnings - pivoted to Vite (CRA officially deprecated Feb 2025)
- Chose ESLint over Oxlint for better ecosystem/learning-resource support
- Dependencies installed: react-map-gl, mapbox-gl, @supabase/supabase-js, axios
- Standing rule established: always verify package names/commands against current sources rather than training data, after an incorrect package name caused a failed install
- Strategic pivot: domain craftbeer.kiwi (owned speculatively since 2016) reframed from "monetise this" to "build a learning project" - Claude pushed back on jumping to solutions before the actual goal was clear
- MVP scope locked: Wellington-region craft brewery directory with map, tour tracking, gamified check-ins - inspired by South Shore/Idaho brewery trail apps
- Stack decided: React + Mapbox + Supabase + Vercel, deliberately chosen over a no-code alternative as a hands-on learning exercise
- Part 1 implementation guide rewritten for a beginner-friendly, fully-spelled-out audience (Node install, Supabase UI navigation, .env.local, SQL editor, dev server)

## Block 2 - Core build: schema, map, seed data (13 July) - approx 4.5 hrs

The single biggest session to date - described in its own summary as covering "an enormous amount of ground."

- breweries table created and seeded with all 18 verified Wellington-region breweries
- Automation-support schema columns added: is_active, last_verified, place_id, flagged_for_review
- Mapbox integration: react-map-gl, supercluster clustering, custom-themed pins per brewery (getBreweryTheme), styled popups, dark header
- Deployed live to Vercel (craftbeer-kiwi.vercel.app), connected to GitHub for auto-deploy
- Three real-world data corrections caught and fixed mid-session: Fortune Favours (closed, now a Garage Project site), Tuatara (relocated to Brewtown), Boneface (changed ownership) - plus Waitoa added as a missing 18th brewery
- README.md, architecture.md, craftbeer-kiwi-automation-plan.md written and pushed to GitHub - first full documentation set
- Automation plan substantially designed: Places + NZBN two-source verification model, exceptions report query, Phase 2 sources scoped (MoJ register, NZ Customs Excise CCA list)
- Project instructions added to prompt proactive doc-update flags going forward

## Block 3 - Automation infrastructure setup (15 July) - approx 3 hrs

- NZ Customs Excise CCA list cross-checked against all 18 breweries - two apparent mismatches (Panhead/Neilson, Mean Doses' two addresses) investigated and resolved with zero open items
- Automation plan doc reconstructed in full after it was found to have lost content between sessions
- Google Cloud set up as a business account under Craft Beer Kiwi Collective Limited: project created, billing enabled, Places API (New) enabled, restricted API key generated and stored in Bitwarden
- Supabase CLI installed as an npm dev dependency, linked to the live project, brewery-sync Edge Function scaffolded (empty template)
- FreeFileSync configured for local backup to USB (Mirror mode, node_modules excluded)
- To-do logged: enable 2FA on GitHub/Supabase/Vercel - still outstanding as of today
- architecture.md reviewed and updated to reflect schema/automation progress

## Block 4 - Mobile triage and discovery gap (17 July) - approx 1 hr

Short, mobile-only session - bug logging and one significant finding rather than implementation.

- Three mobile popup bugs identified and queued (header obscuring, popup not closing on pin-switch, long names overlapping close button)
- Garage Project Wild Workshop found missing from the directory - surfaced a genuine blind spot in the automation design: name-based discovery treats multiple venues under one brand as duplicates. Drafted (but not yet merged) as a new automation-plan section
- Product roadmap clarified: Wellington then national NZ then Australia, in that order, not straight to Australia after Wellington
- Domain/multi-country branding strategy discussed and deliberately deferred

## Block 5 - Feature-heavy build day (19 July) - approx 3.5 hrs

- Full website field audit: 7 of 18 breweries found null, corrected via verified web search plus SQL update; standing rule established (never leave website null on a new brewery)
- Same standing-rule treatment applied to brewery pin theming - Waitoa found missing an explicit theme entry, fixed
- Shipped: light/dark map toggle (OS-preference-aware, localStorage-persisted), fly-to animation on pin click, GeolocateControl, rebuilt popup close button (proper touch target sizing), temporarily-closed brewery status system (status/status_note fields)
- 3D terrain trialled and deliberately reverted same session - logged in architecture.md specifically to prevent re-investigation later
- All three mobile popup bugs from 17 July fixed and confirmed on real iPhone hardware
- Domain-to-Vercel connection attempt blocked by a genuine Discount Domains portal bug (confirmed via incognito test, not user error) - call to their support logged as the next step
- Closure-check logic scoped (not yet written): decided a lone Places "closed" signal should flag for review, not auto-close, per the existing two-source-agreement rule

## Block 6 - Planning-only session (20 July, earlier) - approx 0.5 hr

- Notes-focused session on two upcoming features: a custom user-location marker (extending the existing GeolocateControl) and client-side brewery name search
- No implementation - scoped for a future build session, including extracting a dedicated SearchBar.jsx component

## Block 7 - Closure-check and discovery automation (20 July, this session) - approx 4 hrs

The longest single technical session - closure-check built end-to-end, discovery built but blocked mid-testing, plus real doc-hygiene work.

- Flagged and corrected a doc/behaviour mismatch in the automation plan before writing any code
- brewery-sync (closure-check) written, deployed, and successfully tested: checked:18, flagged:0, errors:[]
- Adapted to a Supabase platform change mid-session - the withSupabase/@supabase/server auth pattern superseded the plan's original manual-client approach
- Significant troubleshooting saga: exposed secret key rotated, but new keys consistently failed with 401 INVALID_CREDENTIALS across two independently generated keys, three test methods (PowerShell, curl, dashboard test panel), and a redeploy - concluded as a genuine Supabase platform-side issue, not user error, and logged for support/GitHub-thread follow-up
- brewery-discover (discovery) built and deployed as a deliberately separate function from closure-check (cost-tier and risk-isolation reasoning) - not yet successfully tested, blocked by the same key issue
- Multi-site blind-spot section (drafted 17 July) finally merged into the automation plan, alongside the closure-check/discovery restructure
- architecture.md and craftbeer-kiwi-automation-plan.md both substantially rewritten to match actual current state - including catching that an earlier "doc saved automatically" claim this session was wrong, and correcting course
- Two security to-dos actioned: old exposed secret key deleted (new one blocked on the same platform issue); 2FA on GitHub/Supabase/Vercel still not done - carried forward again

## Block 8 - Theme system and forward planning (21 July) - approx 3 hrs

- Theme-switching system built and shipped, replacing the old dark-mode boolean: a `themeId` string plus a `THEMES` registry, with a `<select>` dropdown in the header. Light and Dark themes use real Mapbox style URLs; Dive Bar and Hop Explosion are structurally wired up but left on placeholder URLs pending a visual-identity decision
- Mapbox community style gallery explored for Dive Bar/Hop Explosion candidates - several styles had no "Add to Studio" option (creator-disabled, not a bug); one that did work ("Glow globe") was rejected as unsuitable (globe-projection, not flat city-level zoom)
- Custom user-location marker shipped, using Andy's own hop-cone SVG artwork in place of Claude's earlier approximations
- Map-not-filling-browser bug found and fixed (leftover `#root` width cap from the original Vite template)
- Dev/prod environment separation discussed and documented (`dev-prod-environments-discussion.md`): two free Supabase projects recommended over native branching (Pro-plan-only, not justified at solo scale) - decision logged, build deliberately deferred until a real schema change needs testing
- Favourites/brewery-trail persistence designed without user accounts: `crypto.randomUUID()` in `localStorage`, a `trails` table keyed to that ID, a scheduled cleanup Edge Function, and a separate public share-code so sharing a trail can't let someone else edit the original - design only, nothing built
- Name search feature scoped: client-side filtering of the in-memory breweries array, applied before the supercluster index so results recluster, extracted as a dedicated `SearchBar.jsx` component - not yet built

## Block 9 - Security, brewery #19, and doc-process overhaul (25 July) - approx 2.5 hrs

- 2FA finally enabled on GitHub, Supabase, and Vercel - closing out a to-do carried forward across three prior sessions (15, 19, 20 July; see patterns section below)
- Garage Project Wild Workshop added as brewery entry #19 (7 Furness Lane, Te Aro) - data inserted and theme entry added, committed
- Significant investment in documentation process itself, not just content: standing instructions added for proactive doc-update prompts tied to schema/architecture/feature changes, in-session mismatch flagging, mid-session "should we commit this?" prompts, an end-of-session git status/unpushed-work check, and a "pending re-upload" tracking workflow so a doc regenerated for download isn't assumed to have made it back into project knowledge
- First PDF versions of decisions.md and retrospective.md generated for Andy's Dropbox docs folder, alongside the existing architecture/automation-plan/concept PDFs
- Dropbox MCP connector connected via suggest_connectors, but its tools didn't actually load in that session - PDF delivery into Dropbox is still a manual drag-and-drop for Andy until this is confirmed fixed

## Block 10 - Bug discoveries and doc catch-up (26-27 July) - approx 1.5 hrs

- Geolocation fallback bug found (26 July): a Blenheim visitor saw the user-location marker at the Wellington CBD fallback coordinates instead of their actual position - suspected cause is `getCurrentPosition` being called without options, so a cached or permission-denied fallback is likely firing silently. Logged as a to-do, not yet fixed
- Mobile popup header-obscuring bug found to have regressed (27 July): the 17 July fix (forced `Popup anchor="bottom"`) had been confirmed working on real iPhone hardware on 19 July, but the 21 July theme-dropdown addition made the header taller, and the popup title now slides under it again on pin tap - a genuine regression, not a new bug, caught via screenshot comparison against docs that still marked it ✅ fixed
- todo.md restructured to add a dedicated "Regressions" section (rather than folding the popup issue back into "not started," which would have lost the regression context), plus two new forward-looking items: zoom-dependent pin name labels, and a longer-term Mapbox GL symbol-layer/label-collision migration
- README.md brewery count corrected from 17 to 19 (had drifted two sessions behind actual data); a further mismatch spotted in passing - `docs/decisions.md` is listed as "to be written" despite already existing with real content - flagged, not yet fixed

## Block 11 - Domain finally live, Analytics turned on (27 July) - approx 1.5 hrs

- Discount Domains account unlocked via a support call (+64 9 925 5553) - the self-service unlock flow's portal bug (no checkboxes on the "select services to unlock" page) couldn't be worked around and needed a human to fix manually
- Unexpected discovery mid-session: the domain's nameservers were still pointed at Fastmail (`ns1/ns2.messagingengine.com`), not Discount Domains - evidently a dormant Fastmail account had been set up alongside the original 2016 registration and never used. Andy confirmed he didn't mind breaking whatever (unused) email setup existed there, to be sorted properly later - switched nameservers back to Discount Domains' own to get DNS management in one place
- A record for `@` and `www` updated from Discount Domains' leftover parking-page IP (`202.174.80.44`, presumably set since 2016) to Vercel's actual current IP - reconfirmed live via Vercel's own DNS configuration panel (`216.198.79.1`) rather than assumed from the 18 July note, since Vercel now serves IPs from a per-project pool rather than one universal address
- craftbeer.kiwi domain is now correctly pointed at Vercel; DNS was propagating as this session ended - Andy to confirm "Valid Configuration" in Vercel once it settles
- Vercel Web Analytics installed (`@vercel/analytics`) and wired into `App.jsx` - used the `@vercel/analytics/react` import since this is a Vite project, not the Next.js-specific snippet Vercel's dashboard shows by default. First real visitor/pageview visibility on the live site, closing out the long-standing "basic usage instrumentation" to-do
- Dev/prod environment separation (in progress on the to-do list since 21 July) was revisited with a sharper trigger than originally scoped: rather than waiting for a specific schema change (NZBN, description-generation) to force the issue, the fact that the domain is now genuinely live and Analytics is tracking real visitors was flagged as reason enough to prioritise it - a bad schema change now risks breaking the site for actual people, not just Andy's own testing
- In passing: flagged a worth-checking item, not yet resolved - Vercel's Hobby plan terms restrict use to "personal, non-commercial" projects per several third-party sources, worth confirming against Vercel's own current ToS given craftbeer.kiwi is owned by a registered company (Craft Beer Kiwi Collective Limited), not personally by Andy

## Block 12 - Dev/prod Supabase split built (27 July, this session) - approx 1 hr

Direct follow-through on Block 11's sharpened trigger - built the same day the reasoning for doing so was flagged.

- Second free Supabase project created (`craftbeer-kiwi-DEV`), Tokyo region rather than production's Sydney - a deliberate minor deviation, judged not worth blocking the session on
- One near-miss caught in the process: a first attempt at running the schema SQL happened while the SQL Editor's project-switcher had defaulted back to the production project - caught before anything wrote to the live table, because the `create table` statement failed on a genuine `relation already exists` error rather than partially succeeding. Table Editor checked directly afterwards to positively confirm no test rows had landed in production
- Schema recreated on the correct (`craftbeer-kiwi-DEV`) project: `breweries` (all 13 production columns, matched by type) and `check_ins`, RLS enabled on both, public read-only `select` policy on `breweries` matching production's, seeded with 3 fake test breweries - one deliberately `is_active = false`, specifically to exercise that filter
- Local `.env.local` repointed at the dev project's URL and publishable key (Supabase's newer naming for what used to be called the "anon key" - same purpose, safe for frontend use, respects RLS). A leftover duplicate `VITE_SUPABASE_URL` line from the edit was cleaned up to a single active line, with the production values commented out above it for quick reference/rollback rather than deleted outright
- Verified working end-to-end: `npm run dev` against the dev project correctly showed only 2 pins (the two active fake breweries), with the third (deliberately inactive) correctly filtered out - confirming both the dev/prod split itself and the existing `is_active` filtering logic are working as intended
- Vercel's production environment variables were not touched at any point - production deploys remain entirely unaffected by this work
- A few operational notes logged to `todo.md` rather than acted on immediately: Andy is now at 2/2 projects on Supabase's free tier (a third environment would need Pro or reuse of one of these two); free-tier projects auto-pause after roughly a week of inactivity, so `craftbeer-kiwi-DEV` may need a manual "wake" via its dashboard if a future session's local dev server can't fetch data

---

## Patterns worth noting

- Documentation drift is a recurring theme. At least three sessions (15 July, 17 July's unmerged addition, today) involved discovering that docs had fallen behind actual build state, or that edits made in one place didn't persist to another. Worth treating doc updates as part of "done," not a follow-up task, going forward.
- Tooling underneath shifts mid-project. CRA to Vite (block 1) and the Supabase auth pattern change (block 7) both required adapting to an external tool changing out from under the plan, not a planning failure on Andy's part.
- The biggest time sinks were infrastructure/tooling friction, not application logic. The closure-check logic itself was straightforward; the PowerShell/key-rotation/auth-pattern troubleshooting around it consumed most of block 7's time. Worth factoring into future estimates - new-tool setup tends to cost more than the feature work it enables.
- 2FA was carried forward as an open to-do across three sessions (15, 19, 20 July) before finally being actioned on 25 July - five sessions total from first mention to done. A useful data point on how easily a "genuinely small task" can keep slipping when there's always something more pressing in front of it.
- Doc drift isn't just a risk to manage in passing - by 25 July it warranted its own dedicated session investment (five new standing instructions, a re-upload tracking workflow). Worth treating as a recurring maintenance cost of the project, not a one-off fix.
- UI regressions can hide behind unrelated changes. The 21 July theme-dropdown addition silently broke the 17 July mobile popup fix by changing header height - neither change touched the other's code directly. Worth a quick visual/mobile check after any header, layout, or global-chrome change, even when the change looks unrelated to a previously-fixed bug.
- Infrastructure blockers can hide unrelated surprises. The domain-unlock call (block 11) was expected to be a simple "please unlock this" request, but surfaced an unrelated dormant Fastmail nameserver setup that would otherwise have silently blocked DNS changes even after the unlock. Worth treating "why is this actually blocked" as a genuine question rather than assuming the first identified cause is the only one, especially for infrastructure that's been sitting untouched for years (this domain was registered in 2016).
- A recommendation logged as "wait for the right trigger" can still get built ahead of that trigger, and that's fine. The dev/prod split (blocks 8, 11, 12) was originally scoped to wait for a schema change; it ended up being triggered instead by the domain going live plus Analytics tracking real visitors - a genuinely different but equally valid reason. Worth revisiting a deferred recommendation's rationale whenever project circumstances change materially, rather than treating the original trigger condition as the only valid one.
- The dev/prod split earned its keep on its very first use. Block 12's near-miss - the schema SQL almost running against production because the dashboard's project-switcher had silently defaulted back - is precisely the failure mode the split exists to catch. It was caught here because the error happened to be loud (a conflicting table name) rather than quiet (e.g. an `insert` or `alter` that would have partially succeeded); worth remembering that not every mistake will announce itself this clearly, so checking the project name in the breadcrumb before running SQL is worth making a habit, not just a one-off catch.
