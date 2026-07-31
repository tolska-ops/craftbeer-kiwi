# Concept: Invoking Supabase Queries Locally (Without the Dashboard Console)

**Last updated:** 31 July 2026

"The console" = Supabase Dashboard's SQL Editor — a browser tab, manual, one query at a time, easy to fat-finger, and it leaves no trace in your codebase. Everything below is a way to run a query against the same underlying Postgres database from somewhere that *isn't* that browser tab. They differ mainly in **what layer they talk to** and **how repeatable/scriptable they are** — which matters more than "which is fastest to type."

---

## The four real options

### 1. Supabase CLI (`supabase db execute` / migrations)
Runs SQL against your project via the official CLI, from a terminal on your own machine. Two modes:
- **One-off:** `supabase db execute --file query.sql --linked` runs a script against your linked (prod or dev) project directly.
- **Migrations:** `supabase migration new <name>` creates a timestamped SQL file; `supabase db push` applies pending migrations to the linked project. This is the CLI's actual sweet spot — it's how schema changes get *tracked*, not just applied.
- Also runs a **full local Postgres stack in Docker** (`supabase start`) if you want a true offline dev copy, separate from your DEV Supabase project.

**Good for:** schema changes you want a permanent record of (which is most of what you've been doing by hand via decisions.md). **Downside:** another tool to install/keep updated, and the Docker local-stack option is overkill given you already run a hosted DEV project.

### 2. Direct `psql` connection
Postgres's own command-line client, pointed at Supabase's connection string (Session Pooler, from Project Settings → Database → Connect). Full raw SQL, same as the console, just from your terminal:

```
psql "host=aws-0-<region>.pooler.supabase.com dbname=postgres user=postgres.<project_ref> sslmode=require"
```

**Good for:** ad-hoc queries when you want console-equivalent power without opening a browser. **Downside:** no query history, no safety rails, and the connection string embeds your DB password — needs to live somewhere that isn't committed to Git (same category of credential-hygiene issue as `.env.local`).

### 3. `supabase-js` in a script
The same client library the app itself uses, run standalone via `node script.js` instead of inside the React app. Talks to the database through **PostgREST** (Supabase's auto-generated REST layer), not raw SQL.

```js
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(url, key)
const { data, error } = await supabase.from('breweries').select('*').eq('is_active', true)
```

**Good for:** anything you'd naturally want to write in JS anyway — a one-off backfill script, a data-check you'll want to re-run. **Key behaviour:** if you use the `anon` key, it's bound by RLS exactly like the live app is. Use the `service_role` key and RLS is bypassed entirely — same power as `psql`, same care required (this is the key type that was found live-but-unused and disabled in the 29 July security audit).

### 4. Supabase MCP connector (what got used this session)
The MCP tool Claude has direct access to inside this chat. Functionally closest to option 3 with the `service_role`-equivalent level of access, but there's no script file, no terminal — it's Claude issuing the query on your behalf, in the conversation.

**Good for:** exactly what happened today — reactivating Aro Taproom mid-conversation without a context-switch to a terminal or the dashboard. **Downside:** it only exists inside a Claude session; it's not a repeatable artefact you can commit to the repo or run again unattended.

---

## Comparison

| | Setup effort | Respects RLS? | Repeatable / scriptable | Where the record lives |
|---|---|---|---|---|
| Dashboard SQL Editor (baseline) | None | No (admin access) | No — one-off, no file | Nowhere (unless you paste it into decisions.md yourself) |
| Supabase CLI | Install CLI, `supabase link` once | N/A for migrations (admin) | Yes — migrations are files in the repo | Git (`supabase/migrations/`) |
| `psql` | Install Postgres client, get connection string | No (admin access) | Only if you save the `.sql` file yourself | Wherever you save the file |
| `supabase-js` script | Already installed (it's the app's dependency) | Yes, if using `anon` key | Yes — it's a `.js` file | Git, if you commit it |
| Supabase MCP (this chat) | Already connected | No (admin-equivalent) | No — lives only in conversation | Nowhere automatically — has to be written up after |

---

## Which fits craftbeer.kiwi's actual workflow

Given the project's existing patterns:

- **Schema changes** (new columns, constraints) → **CLI migrations**. This is the one gap in your current process worth closing: schema changes have so far been applied by hand (via MCP or dashboard) then written up afterwards in decisions.md, which is exactly the pattern that produced the `dryRun`-not-shipped and DEV/prod backfill-drift issues — the doc said it happened, but nothing forced the deployed state to match. A migration file makes the change *and* the record the same artefact.
- **Ad-hoc checks and one-off fixes** (like today's Aro Taproom reactivation, or the 23-vs-24 count check) → **MCP is fine as-is**. It's already faster than any alternative for exactly this shape of task, and the risk is low because it's a single, deliberate query each time, not a standing script.
- **Anything you want to re-run** (a repeatable data-quality check, a backfill you might need again in DEV) → **`supabase-js` script**, committed to the repo. This is the one to reach for once `brewery-discover`-style automation needs a local testing/debugging loop outside the deployed Edge Function.
- **`psql`** is worth having installed as a fallback for when the MCP connector itself is unavailable (as happened with the Dropbox connector once already) — but not worth building a habit around while MCP is working.

**Not recommended right now:** the CLI's local Docker Postgres stack (`supabase start`). You already have a hosted DEV project doing that job (`DEC-008`), and running a second, different kind of "local" environment would be two sources of truth for the same purpose.

---

## Related terms you'll bump into

- **PostgREST** — the auto-generated REST API Supabase puts in front of Postgres. `supabase-js` and the MCP connector both talk to the database *through* this layer (or an equivalent), not by connecting directly to Postgres the way `psql` does.
- **Connection pooler (Session vs Transaction mode)** — Supabase doesn't let most clients connect directly to Postgres at scale; the pooler sits in front. Session mode (what `psql` typically uses) behaves like a normal persistent connection; Transaction mode is for serverless functions that open/close connections rapidly (relevant if Edge Functions ever need direct SQL rather than the `supabase-js` client they use today).
- **`service_role` vs `anon` key** — the same distinction that mattered in the 29 July security audit: `anon` is RLS-bound (safe to embed in the deployed app), `service_role` bypasses RLS entirely (admin-equivalent, must never end up in client-side code or Git).
- **Migration** — a timestamped `.sql` file describing one schema change, applied in order. The mechanism that turns "we changed the schema" from a sentence in decisions.md into a file Git can track and diff.

---
*Concept snapshot — craftbeer.kiwi project reference set*
