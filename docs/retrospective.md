# craftbeer.kiwi — Project Retrospective

**Covers:** 9 July 2026 to 25 July 2026 (project inception to current session)
**Purpose:** A high-level, time-boxed view of how the project actually unfolded — useful for spotting where effort went, what took longer than expected, and what a realistic pace looks like for planning future phases (e.g. national expansion). This is a companion to architecture.md (what's built) and craftbeer-kiwi-automation-plan.md (what's planned) — this doc is about how the building went, not what exists.

**This is a living document, updated at the end of each session going forward** — new blocks get added, lessons learned accumulate, and the "why these tools" section gets revisited if a stack decision changes.

Time estimates are approximate, reconstructed from session content and scope rather than logged timestamps — treat them as ballpark, not precise. At Andy's stated pace of roughly 5-8 hrs/week, total effort to date (approx. 23-27 hrs across 17 days) tracks roughly as expected for someone fitting this around a full-time job.

---

## Why these tools — the reasoning behind the stack

Captured here so the reasoning isn't lost — useful both for onboarding future-you back into old decisions, and as a reference if a tool ever needs reconsidering.

- **React + Vite** — React for its learning value and component structure. Vite over the originally-attempted Create React App because CRA was officially deprecated by the React team in February 2025; Vite's dev server is also faster and its config simpler.
- **Supabase** — chosen over building a custom backend, to avoid maintaining a server for a solo side project. Postgres plus an auto-generated REST API plus Row Level Security gets a real backend without writing one from scratch. Sydney region chosen as the closest available region to Wellington — there's no NZ region on any major cloud provider.
- **Mapbox via react-map-gl** — chosen for React integration quality and visual styling flexibility (light/dark base styles, custom pin theming) over alternatives like Leaflet or the Google Maps JS SDK, matching an early goal of the app looking like a considered directory product, not just a functional map.
- **Vercel** — chosen for tight GitHub integration (auto-deploy on push to main) and a generous free Hobby tier, avoiding any need to manage hosting infrastructure directly.
- **GitHub** — source of truth for code and docs. Standard choice, no real alternative seriously considered.
- **Supabase Edge Functions (Deno/TypeScript)** — chosen for the automation layer because it lives alongside the database already in use, avoiding a separate hosting/scheduling service for what's fundamentally "run this script periodically." Deno/TypeScript is a new syntax relative to the React/Vite frontend code, accepted as a worthwhile learning cost given the same vendor already hosts the data being automated against.
- **Google Places API (New)** — chosen as the primary discovery/closure signal because it's a live, queryable API, unlike most alternative sources investigated (Brewers Guild, Beervana, Brewers Association list), which turned out to be annual PDFs or stale bulk data rather than anything automatable.
- **NZBN API** — chosen as the second closure-verification source specifically because it's a government legal-status record, not a crowd-maintained listing, giving the two-source-agreement rule a meaningfully independent second signal rather than two flavours of the same crowd-sourced data.
- **PowerShell** — not a deliberate pick so much as "what's already there" on Andy's Windows machine; worth naming honestly as a default rather than a considered choice, since its quirks (see Lessons learned below) have cost some real time.

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

## Block 8 - Theming, markers, and dev-environment planning (21 July) - approx 3 hrs

- Theme-switching system built and shipped: themeId string + THEMES registry replacing the old darkMode boolean, with a header dropdown. Light and Dark fully implemented with real style URLs; Dive Bar and Hop Explosion structurally wired up but left on placeholder styles pending a design decision (Mapbox Standard presets vs. fully custom Studio styles)
- Custom hop-cone SVG user-location marker shipped, replacing the earlier pulsing blue circle
- Map-not-filling-browser bug found and fixed (leftover `#root` width cap from the original template)
- Favourites/brewery-trail persistence design worked through: anonymous `crypto.randomUUID()` in `localStorage`, a `trails` table, 7-day expiry via a scheduled function, separate public share-codes for sharing - documented, nothing built yet
- Second free Supabase project recommended as a dev environment (`dev-prod-environments-discussion.md`), with native branching considered and rejected as Pro-plan-only overkill at this scale
- Standing instruction added: once a code change is confirmed working, always explicitly prompt to commit before moving to the next task, after two CSS fixes sat un-pushed for a session
- This retrospective doc extended with the "Why these tools" section above and the "Lessons learned" list below

## Block 9 - Strategic reflection and doc hygiene (24-25 July) - approx 1.5 hrs

- Startup-lessons reflection session: five patterns surfaced as relevant at this stage — premature automation ahead of actual brewery volume, "interesting engineering problem" drift away from foundational tasks, 2FA repeatedly deferred, no usage instrumentation on the live site, and no clear distribution plan despite ongoing feature polish. Andy asked for a lighter touch on repeating these going forward — flag only genuinely new observations
- Three resulting items added to the to-do list: basic usage instrumentation, a distribution plan, and reconsidering the pace of further discovery/closure automation investment
- `concept-cron.md` and `concepts-index.md` created, starting a "concept snapshot" reference series (one-pagers on technical concepts encountered while building) kept in this project's knowledge going forward
- Document-hygiene audit run: found `architecture.md` and `craftbeer-kiwi-automation-plan.md` had both gone stale relative to actual build state (predating the theme system, the Edge Function split, and the multi-site blind-spot merge), and that local edits made to the mounted project-knowledge copies in two earlier sessions (this retrospective's "Why these tools"/"Lessons learned" sections, and the three to-do items above) had never actually been re-uploaded and so weren't reflected in the live project knowledge. All four affected docs rebuilt and reissued for re-upload.

---

## Patterns worth noting

- Documentation drift is a recurring theme. At least four sessions (15 July, 17 July's unmerged addition, 20 July, 25 July) involved discovering that docs had fallen behind actual build state, or that edits made in one place (the local mounted copy of a project-knowledge file) didn't persist to the actual project knowledge. Worth treating doc updates as part of "done," not a follow-up task — and specifically, worth confirming a re-upload happened rather than assuming a successful local edit is the same thing as a saved one.
- Tooling underneath shifts mid-project. CRA to Vite (block 1) and the Supabase auth pattern change (block 7) both required adapting to an external tool changing out from under the plan, not a planning failure on Andy's part.
- The biggest time sinks were infrastructure/tooling friction, not application logic. The closure-check logic itself was straightforward; the PowerShell/key-rotation/auth-pattern troubleshooting around it consumed most of block 7's time. Worth factoring into future estimates - new-tool setup tends to cost more than the feature work it enables.
- 2FA has now been carried forward as an open to-do across five sessions (15, 19, 20, 21, 24-25 July) without being actioned. Small task, worth just doing next session before it becomes a sixth carry-forward.
- A stage-appropriateness check is worth doing periodically, not just when something forces it. Block 9's reflection session was the first time the project explicitly asked "is this the right thing to be building right now" rather than "how do we build the next thing" - worth revisiting occasionally rather than only in hindsight.

---

## Lessons learned (running list - add to this each session)

### Tooling and process

- Verify current package/command syntax before running it - training data and even recent docs go stale fast in JS/cloud tooling. Became a standing rule after an incorrect package name caused a failed install on day one (10 July), and paid off repeatedly since.
- CLI tools installed as project dependencies (not global) need invoking via npx, not a bare command - a small, repeatable gotcha that resurfaced on 20 July after being first learned on 14 July.
- Vendor-recommended patterns can change under you mid-project. Supabase's default Edge Function template moved from a manual createClient approach to the withSupabase wrapper between when the plan was written and when the code was actually built - worth checking current docs before extending existing code, not just when starting something new.
- Platform-specific shell syntax matters. PowerShell's curl is aliased to Invoke-WebRequest with different flags than real curl; Set-Content can silently corrupt UTF-8 encoding without an explicit encoding flag. Worth learning the actual platform's idioms rather than assuming bash conventions translate directly.
- When a "read-only project copy" and the "live project knowledge" drift apart (as happened repeatedly, including this session), don't assume an edit saved just because a tool call succeeded - confirm what's actually authoritative before telling the user it's done, and follow through on the re-upload rather than treating the draft as the finished task.

### Data and design

- Prefer stable IDs over names for deduplication and matching. place_id-based matching correctly handled a brewery having multiple sites under one name; several manual cross-checks against name-keyed sources (excise list, NZBN) hit friction exactly because names drift, get renamed, or get shared across legal entities.
- A single automated signal isn't enough to safely auto-act on. The two-source-agreement rule (Places + NZBN must both agree before an is_active flip) exists because neither source alone was judged reliable enough for an action that affects what the public sees.
- Never hard-delete. Soft-delete flags (is_active) and a dedicated flagged_for_review field keep automation mistakes cheap and reversible rather than destructive.
- Manually-entered data accumulates gaps that don't surface until specifically audited - the website field audit (19 July) and theme-lookup audit (same day) both found real gaps that had sat unnoticed across multiple sessions. Worth building periodic audits into the habit rather than assuming past data entry was complete.

### Automation and safety

- Code that writes to production data should ship with a safety net (a flagged_for_review default, a dryRun option) before its first real run, not retrofitted after something goes wrong.
- Isolate new, unproven automation from already-proven automation where practical. Splitting brewery-discover into its own function rather than extending the working brewery-sync meant a bug in untested discovery logic couldn't touch the one piece of automation already confirmed reliable.
- When infrastructure fails in a way that looks like it isn't your own code's fault, test it thoroughly across multiple independent methods before concluding that - but also recognise when you've tested enough and it's time to escalate (file a support ticket, read the vendor's own discussion threads) rather than keep guessing blind.
- Automation effort should track actual data volume, not just be built because it's technically ready to build. `brewery-sync`/`brewery-discover` were built for 18 breweries - genuinely useful groundwork, but their real payoff (saving manual research time) only arrives once new-brewery volume outpaces manual entry. Worth checking that timing periodically rather than assuming "built" means "the right thing to keep investing in right now."
