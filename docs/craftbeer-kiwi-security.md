# craftbeer.kiwi — Security

**Purpose:** Tracks security audits, the standing checklist run at each audit, and risks knowingly accepted rather than fixed. Companion to `craftbeer-kiwi-architecture.md` (system design) and `craftbeer-kiwi-decisions.md` (why things are built the way they are) — this doc is specifically the security lens on the same system.

**Status:** First audit complete (29 July) — two findings, both fixed and verified same session. Next audit: trigger-based (see below), or ~2–3 months.

**Last updated:** 29 July 2026 (first audit completed — legacy service_role key disabled, brewery-discover dry-run-by-default gap found and fixed)

**Framework alignment:** [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) Level 1, plus NZ legal requirements (Privacy Act 2020). See "Framework & compliance context" below for why.

---

## Framework & compliance context

**Why OWASP ASVS, not NIST CSF:** NIST CSF is an org-wide governance framework (Identify/Protect/Detect/Respond/Recover/Govern) — built for enterprises reporting to a board, not a solo-dev checklist. OWASP ASVS sits one layer down: it's code- and architecture-level security requirements (auth, session management, access control, data protection), which is the layer this project actually operates at. ASVS has three verification levels — this project targets **Level 1** (streamlined, baseline-adoption tier), not Level 2/3 (built for regulated/high-assurance apps).

**NZ legal layer — Privacy Act 2020:** ASVS is a technical standard, not a legal one. NZ's Privacy Act 2020 is the actual legal backstop and applies to any NZ organisation handling personal information, regardless of size. Key points relevant to craftbeer.kiwi:
- 13 Information Privacy Principles (IPPs) govern collection, storage, use, and disclosure of personal information.
- A **notifiable privacy breach** (one likely to cause serious harm) must be reported to the Privacy Commissioner and affected individuals, in practice within about 72 hours of realising it's notifiable. Failure to notify is an offence (fine up to $10,000).
- **Current exposure: minimal.** The only quasi-personal data point in the design is the anonymous `crypto.randomUUID()` trail ID (see Known Accepted Risks) — not personal information in the IPP sense, since it doesn't identify anyone. No accounts, emails, or passwords exist. This should be re-checked any time a feature touches real personal data (e.g. if favourites ever needs an email for cross-device sync).
- Not currently relevant but worth knowing exists: **NZISM** (NZ Information Security Manual) — this is a government/critical-infrastructure standard, not applicable to a small commercial app like this one. Not tracked here unless that changes.

**Bottom line:** ASVS Level 1 checklist below is the "how to build it securely" layer. Privacy Act obligations are the "what happens if it goes wrong" layer — mostly dormant right now given no personal data is collected, but worth re-reading this section before any feature that would change that.

---

## How this doc works

- **Audit log** — one dated entry per audit. First audit is one-off; from then on, cadence is trigger-based (see below), not calendar-based.
- **Standing checklist** — the fixed list of areas reviewed each audit, so nothing depends on memory. Extend this list as the app grows (auth, payments, etc. would each add sections).
- **Known accepted risks** — things consciously left as-is, with reasoning, so a future audit doesn't re-flag them as new findings.

**Audit trigger:** run the checklist before any schema change goes to production, before the domain goes live, before any auth/PII feature ships, and otherwise roughly every 2–3 months given current pace (5–8 hrs/week).

---

## Audit log

### First audit — 29 July 2026

**Scope:** Full standing checklist, manual walkthrough (Supabase dashboard + GitHub), guided by Claude since the Supabase MCP connector's tools weren't loadable in-session.
**Reviewed by:** Claude + Andy, via Supabase dashboard (Policies, Data API settings, API Keys, Edge Functions) and GitHub.

**Findings:**
| Area | Finding | Severity | Action |
|---|---|---|---|
| Access control | `breweries` RLS: one public SELECT-only policy, no write access. `check_ins`: RLS enabled, zero policies, API access disabled entirely. | — | Pass, no action |
| API exposure | Only `breweries` exposed via Data API (1 of 2 tables). "Automatically expose new tables" is OFF — new tables won't be silently API-exposed by default. | — | Pass, no action. Worth adding as a permanent checklist item (not previously listed). |
| Credentials | Publishable + named secret key (`brewery_sync_v2`) only, matching both Edge Functions. | — | Pass, no action |
| **Credentials — legacy keys** | **Legacy `service_role` key (bypasses RLS entirely) was still active, unused by any code but live.** | **Medium** | **Fixed 29 July — disabled via "Disable JWT-based API keys."** |
| **Edge Functions — `brewery-discover`** | **The 28 July "dry-run should be the default" decision had not actually shipped. Code still read `dryRun = url.searchParams.get("dryRun") === "true"` — opt-in, not opt-out. A plain/unparameterised call would have written directly to the live table.** | **Medium-High** | **Fixed 29 July — changed to `forceLive`/`!forceLive` pattern (dry-run now the default, `?live=true` forces a write). Deployed and verified: test call with no params returned `dryRun: true, inserted: 0`, correctly found 1 new candidate (Teddy's Tacos) in `wouldInsert` without writing it.** |
| 2FA | Not re-verified this audit — carried forward, confirm next audit. | — | Open |
| GitHub secret scan | Not completed this audit — carried forward. | — | Open |

**Summary:** First audit surfaced two real, fixable gaps — an orphaned RLS-bypassing legacy key, and a documented safety decision (dry-run-by-default) that never actually made it into deployed code. Both fixed and verified same session. Net posture: significantly improved, and confirms the value of verifying against live config rather than trusting docs alone — the `dryRun` gap had sat undetected through several prior "done" markers in `todo.md`/`decisions.md` because those only recorded the *decision*, not a check of the *deployed code*.

---

### [Template — copy for each new audit]

**Date:**
**Scope:** (e.g. full checklist / RLS only / pre-domain-launch review)
**Reviewed by:** Claude + Andy, via [Supabase MCP / GitHub / manual]

**Findings:**
| Area | Finding | Severity | Action |
|---|---|---|---|
| | | | |

**Summary:** One or two lines — net posture change, anything urgent.

---



**Date:**
**Scope:** (e.g. full checklist / RLS only / pre-domain-launch review)
**Reviewed by:** Claude + Andy, via [Supabase MCP / GitHub / manual]

**Findings:**
| Area | Finding | Severity | Action |
|---|---|---|---|
| | | | |

**Summary:** One or two lines — net posture change, anything urgent.

---

## Standing checklist

Organised loosely around **OWASP ASVS Level 1** chapters (Access Control, Authentication, Session Management, Configuration/Secrets, Data Protection), plus infrastructure and NZ-specific items this project needs that ASVS doesn't cover. Add rows as the app grows (e.g. a proper "Authentication" section once favourites moves off anonymous device IDs).

### Access control (ASVS: Access Control)
- [ ] RLS enabled on all tables (project-level setting — confirm it hasn't been turned off)
- [ ] Per-table policies match intent (e.g. `breweries` public read-only, no client write access)
- [ ] No table is exposed via the Data API that shouldn't be (check API exposure separately from RLS — the two are independent)
- [ ] `check_ins` (or any future table holding user-linked data) still fully locked down until intentionally opened up
- [ ] Each Edge Function's actual permissions match its purpose (e.g. `brewery-discover` shouldn't have more write scope than it needs)

### Authentication & session management (ASVS: Authentication, Session Management)
- [ ] N/A currently — no login system exists (by design; see Known Accepted Risks for the anonymous trail ID trade-off)
- [ ] If this changes: re-run this section against ASVS's Authentication chapter properly (password/session handling, not just a placeholder)

### Configuration & secrets (ASVS: Configuration)
- [ ] No API keys, secrets, or tokens committed to GitHub (spot-check recent commits, not just `.env` presence)
- [ ] Publishable key only ever appears in frontend code; secret key never appears in frontend code, logs, or response bodies
- [ ] `.env.local` / Vercel env vars correctly scoped (dev points at DEV project, prod points at prod — confirm no cross-wiring)
- [x] `brewery-discover` remains dry-run-by-default (per 28 July decision) — **confirmed fixed and verified 29 July**; was previously not actually implemented despite being marked as a decision
- [ ] 2FA still active on GitHub, Supabase, Vercel
- [ ] Google Cloud project (`craftbeer-kiwi-automation`) API keys scoped to only what's needed (Places API etc.), not broad project-level access
- [ ] **New 31 July** — `craftbeer-kiwi-DEV` now also holds its own live `GOOGLE_PLACES_API_KEY`/`MAPBOX_TOKEN`/`brewery_sync_v2` secrets (previously only production did — `brewery-discover` had never been deployed to DEV before). Confirm at next audit that DEV's copies get the same scrutiny as production's (scoping, rotation, no accidental over-privilege) rather than being treated as lower-stakes by default just because it's the dev environment.
- [ ] Rate limiting / abuse protection considered for any function reachable without auth

### Data protection (ASVS: Data Protection)
- [ ] No sensitive data reachable via browser devtools (network tab, localStorage) beyond what's intended (e.g. anonymous trail ID is expected to be visible — that's the accepted design, not a bug)
- [ ] Confirm no personal information is being collected anywhere it shouldn't be (currently: none by design — anonymous device ID only, not personal information under the Privacy Act)
- [ ] If NZBN API integration lands: check what data it pulls, where it's stored, and whether it introduces any personal information

### Dependencies & code (ASVS: general)
- [ ] Dependencies checked for known vulnerabilities (`npm audit` or equivalent)
- [x] Third-party scripts (Mapbox, analytics) loaded from trusted sources only — **Vercel Web Analytics specifically checked 31 July**: no cookies, no persistent identifiers, session hash discarded after 24 hours, data collected is anonymous and not tied to any individual or IP address (per Vercel's own privacy documentation). Fits the existing no-personal-information posture — confirmed, not just assumed.

### Infrastructure (not ASVS — added for this project)
- [ ] Domain/DNS configuration reviewed once craftbeer.kiwi is live (registrar account security, DNS record integrity)
- [ ] Vercel deployment settings — no preview deployments leaking prod env vars
- [ ] GCP project access reviewed (who/what has access to `craftbeer-kiwi-automation`)
- [ ] Manual `pg_dump`/CLI database export taken within the last ~2–3 months (Free tier has no automated backups — see "Data backups" below)

### NZ Privacy Act check (not ASVS — added for this project)
- [ ] Confirm current data collection still doesn't cross into "personal information" under the Privacy Act (re-check this explicitly any time a new feature is scoped)
- [ ] If it ever does: confirm a breach-response process exists (see below) before that feature ships, not after

---

## Breach response (Privacy Act 2020 baseline)

Only relevant once real personal information is being collected — not needed today, but worth having a plan sketched before that happens rather than during an actual incident. Minimum sequence per Privacy Act guidance:

1. **Contain** — revoke access, rotate credentials, take the affected system offline if needed.
2. **Assess** — what data, how many people, is serious harm likely (financial, identity, safety, significant distress)?
3. **Notify** — if serious harm is likely, report to the Privacy Commissioner (via their online NotifyUs process) and affected individuals, ideally within ~72 hours of realising it's notifiable.
4. **Document** — the breach, the assessment, and remediation steps, in this file's audit log.

---

## Data backups (Supabase Free tier — no native PITR)

**Confirmed 29 July 2026:** Supabase's Free tier includes no automated backups and no Point-in-Time Recovery (PITR) — both are Pro-plan-and-above features (daily backups on Pro/Team/Enterprise; PITR is a paid add-on on top of that). This closes the open question logged 21 July in `craftbeer-kiwi-dev-prod-environments-discussion.md`.

**What this actually means in practice:**
- A **paused** free-tier project (the routine week-of-inactivity auto-pause already known about) is *not* data loss — the database volume is frozen, not wiped, and clicking "Restore project" brings it back intact.
- A **deleted** project is unrecoverable — Supabase does not retain backups for free-tier projects once deleted, and there's no support escalation path to get it back. This is the actual risk (e.g. an account compromise, or an accidental deletion), not the routine pause.

**Mitigation — manual `pg_dump`/CLI export, not automation:** Supabase is standard Postgres underneath, so a schema+data export via the Supabase CLI needs no special tooling:

```bash
supabase db dump --db-url "<production-connection-string>" -f craftbeer-kiwi-backup-$(date +%Y%m%d).sql
```

Save the resulting `.sql` file into the same locally-backed-up folder structure already covered by FreeFileSync (mirrored to USB). At 23 breweries this is a small, fast export — no automation needed at this volume.

**Trigger for running this:** same cadence as the security audit trigger above — before any schema change goes to production, and otherwise roughly every 2–3 months. Worth doing now as a baseline, then again after the next real schema change (NZBN integration or description-generation columns are the likely next candidates).

---



| Risk | Why accepted | Revisit if... |
|---|---|---|
| Trail/favourites data protected by obscurity (random `crypto.randomUUID()`), not real auth — anyone with the raw ID could edit that data | No PII involved, low stakes (a brewery trail list), avoids building a full auth system for a feature that doesn't need identity | Feature scope expands to anything sensitive, or user accounts get built for another reason anyway |

---

## Open items

- First audit complete (29 July) — see Audit log above. Next audit trigger-based (schema change, or ~2–3 months).
- 2FA and GitHub secret-scan checklist items not re-verified this audit — confirm at next audit.
- Once first audit completes, review whether this checklist needs sections added (e.g. once auth or payments exist).
- No action needed now, but flag for a future check: NZISM only becomes relevant if this project ever touches government/critical-infrastructure work — not expected, noted here so it isn't rediscovered as a question later.
