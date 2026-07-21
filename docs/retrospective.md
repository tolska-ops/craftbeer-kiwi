# craftbeer.kiwi - Project Retrospective

**Covers:** 9 July 2026 to 21 July 2026 (project inception to current session)
**Purpose:** A high-level, time-boxed view of how the project actually unfolded - useful for spotting where effort went, what took longer than expected, and what a realistic pace looks like for planning future phases (e.g. national expansion). This is a companion to architecture.md (what's built) and craftbeer-kiwi-automation-plan.md (what's planned) - this doc is about how the building went, not what exists.

**This is a living document, updated at the end of each session going forward** - new blocks get added, lessons learned accumulate, and the "why these tools" section gets revisited if a stack decision changes.

Time estimates are approximate, reconstructed from session content and scope rather than logged timestamps - treat them as ballpark, not precise. At Andy's stated pace of roughly 5-8 hrs/week, total effort to date (approx. 22-26 hrs across 13 days) tracks roughly as expected for someone fitting this around a full-time job.

---

## Why these tools - the reasoning behind the stack

Captured here so the reasoning isn't lost - useful both for onboarding future-you back into old decisions, and as a reference if a tool ever needs reconsidering.

- **React + Vite** - React for its learning value and component structure. Vite over the originally-attempted Create React App because CRA was officially deprecated by the React team in February 2025; Vite's dev server is also faster and its config simpler.
- **Supabase** - chosen over building a custom backend, to avoid maintaining a server for a solo side project. Postgres plus an auto-generated REST API plus Row Level Security gets a real backend without writing one from scratch. Sydney region chosen as the closest available region to Wellington - there's no NZ region on any major cloud provider.
- **Mapbox via react-map-gl** - chosen for React integration quality and visual styling flexibility (light/dark base styles, custom pin theming) over alternatives like Leaflet or the Google Maps JS SDK, matching an early goal of the app looking like a considered directory product, not just a functional map.
- **Vercel** - chosen for tight GitHub integration (auto-deploy on push to main) and a generous free Hobby tier, avoiding any need to manage hosting infrastructure directly.
- **GitHub** - source of truth for code and docs. Standard choice, no real alternative seriously considered.
- **Supabase Edge Functions (Deno/TypeScript)** - chosen for the automation layer because it lives alongside the database already in use, avoiding a separate hosting/scheduling service for what's fundamentally "run this script periodically." Deno/TypeScript is a new syntax relative to the React/Vite frontend code, accepted as a worthwhile learning cost given the same vendor already hosts the data being automated against.
- **Google Places API (New)** - chosen as the primary discovery/closure signal because it's a live, queryable API, unlike most alternative sources investigated (Brewers Guild, Beervana, Brewers Association list), which turned out to be annual PDFs or stale bulk data rather than anything automatable.
- **NZBN API** (not yet integrated) - chosen as the planned second independent verification source specifically because it's a government record of legal entity status, structurally different from Places' business-listing signal. The two-source design exists because neither source alone was judged trustworthy enough to safely auto-act on (e.g. flipping a brewery to inactive).
- **PowerShell** as the primary dev-workflow shell - this is Andy's native Windows environment, not a deliberate choice against an alternative; worth remembering when commands need Windows-specific syntax rather than assuming bash conventions apply.

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

## Block 8 - Dev/prod planning, theming system, and a custom location marker (21 July) - approx 4 hrs

A varied session - one piece of infrastructure research, one substantial feature shipped end-to-end, and a real CSS bug found and fixed.

- Dev/prod environments researched and written up as a proper discussion document (docs/dev-prod-environments-discussion.md) - compared four options with real, verified numbers (Supabase's Free tier allows two projects at no cost; native branching is Pro-plan-only, ~$25/month baseline). Recommended starting with two free Supabase projects now, migration files later, paid branching parked until genuinely needed.
- Full theme-switching system built and shipped: replaced the darkMode boolean with a themeId string and a THEMES registry bundling map style plus UI colours per theme. Light and Dark work with real Mapbox style URLs; Dive Bar and Hop Explosion are structurally wired up but still on placeholder URLs after a genuinely unproductive search through Mapbox's community style gallery - several candidate styles had no "Add to Studio" option (creator-disabled, confirmed by testing others that did work), and one that did work turned out to be a globe-projection style unsuited to a flat city map. Deliberately parked as a separate future task rather than forcing a bad-fit choice today.
- Found and fixed a real bug: the map wasn't filling the browser on wide monitors, traced to a leftover width: 1126px cap on #root in index.css from the project's original landing-page-template starting point. Fixed and documented in architecture.md specifically so it doesn't get silently reintroduced by copying template boilerplate again.
- Custom location marker built from Andy's own hand-drawn SVG hop-cone artwork, replacing the earlier AI-drawn attempts (none of which had landed well across three earlier tries). First attempt at real marker size (32px) turned the detailed artwork into an indistinct blob; fixed by scaling the whole marker up to 48px rather than simplifying the artwork - the vector detail just needed more physical size to read clearly, not less complexity.

---

## Patterns worth noting

- Documentation drift is a recurring theme. At least three sessions (15 July, 17 July's unmerged addition, today) involved discovering that docs had fallen behind actual build state, or that edits made in one place didn't persist to another. Worth treating doc updates as part of "done," not a follow-up task, going forward.
- Tooling underneath shifts mid-project. CRA to Vite (block 1) and the Supabase auth pattern change (block 7) both required adapting to an external tool changing out from under the plan, not a planning failure on Andy's part.
- The biggest time sinks were infrastructure/tooling friction, not application logic. The closure-check logic itself was straightforward; the PowerShell/key-rotation/auth-pattern troubleshooting around it consumed most of block 7's time. Worth factoring into future estimates - new-tool setup tends to cost more than the feature work it enables.
- 2FA has now been carried forward as an open to-do across three sessions (15, 19, 20 July) without being actioned. Small task, worth just doing next session before it becomes a fourth carry-forward.

---

## Lessons learned (running list - add to this each session)

### Tooling and process

- Verify current package/command syntax before running it - training data and even recent docs go stale fast in JS/cloud tooling. Became a standing rule after an incorrect package name caused a failed install on day one (10 July), and paid off repeatedly since.
- CLI tools installed as project dependencies (not global) need invoking via npx, not a bare command - a small, repeatable gotcha that resurfaced on 20 July after being first learned on 14 July.
- Vendor-recommended patterns can change under you mid-project. Supabase's default Edge Function template moved from a manual createClient approach to the withSupabase wrapper between when the plan was written and when the code was actually built - worth checking current docs before extending existing code, not just when starting something new.
- Platform-specific shell syntax matters. PowerShell's curl is aliased to Invoke-WebRequest with different flags than real curl; Set-Content can silently corrupt UTF-8 encoding without an explicit encoding flag. Worth learning the actual platform's idioms rather than assuming bash conventions translate directly.
- When a "read-only project copy" and the "live project knowledge" drift apart (as happened this session), don't assume an edit saved just because a tool call succeeded - confirm what's actually authoritative before telling the user it's done.

### Data and design

- Prefer stable IDs over names for deduplication and matching. place_id-based matching correctly handled a brewery having multiple sites under one name; several manual cross-checks against name-keyed sources (excise list, NZBN) hit friction exactly because names drift, get renamed, or get shared across legal entities.
- A single automated signal isn't enough to safely auto-act on. The two-source-agreement rule (Places + NZBN must both agree before an is_active flip) exists because neither source alone was judged reliable enough for an action that affects what the public sees.
- Never hard-delete. Soft-delete flags (is_active) and a dedicated flagged_for_review field keep automation mistakes cheap and reversible rather than destructive.
- Manually-entered data accumulates gaps that don't surface until specifically audited - the website field audit (19 July) and theme-lookup audit (same day) both found real gaps that had sat unnoticed across multiple sessions. Worth building periodic audits into the habit rather than assuming past data entry was complete.

### Design and UI

- Vector artwork with fine internal detail needs either enough rendered size to stay legible, or deliberate simplification - there's no third option. A hand-drawn hop icon that looked great at 10x preview scale turned to an indistinct blob at 32px; scaling the whole marker up to 48px solved it without touching the artwork itself.
- CSS animation properties can conflict with positioning transforms on the same element. A pulse effect built with transform: scale() read as a jarring strobe rather than a smooth pulse when applied to an element already being positioned via transform by its parent (Mapbox's Marker component) - switching to a box-shadow-based pulse avoided the clash entirely.
- Template boilerplate left over from a project's starting point can hide in plain sight for weeks. A landing-page template's centred, width-capped #root rule silently broke full-width map rendering from day one on wide monitors - easy to miss because narrower windows worked fine by coincidence (max-width: 100% still applied correctly in that direction).
- Not every visual asset search converges. Time-boxing a design search (community map styles, in this case) and explicitly deferring rather than forcing a mediocre choice is a legitimate outcome, not a failure to find the "right" answer.

### Automation and safety

- Code that writes to production data should ship with a safety net (a flagged_for_review default, a dryRun option) before its first real run, not retrofitted after something goes wrong.
- Isolate new, unproven automation from already-proven automation where practical. Splitting brewery-discover into its own function rather than extending the working brewery-sync meant a bug in untested discovery logic couldn't touch the one piece of automation already confirmed reliable.
- When infrastructure fails in a way that looks like it isn't your own code's fault, test it thoroughly across multiple independent methods before concluding that - but also recognise when you've tested enough and it's time to escalate (file a support ticket, read the vendor's own discussion threads) rather than keep guessing blind.
