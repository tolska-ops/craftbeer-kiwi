# Concept Snapshot: Cron (Scheduled Jobs)

**One-liner:** Cron is a way to run a task automatically on a fixed schedule, without a person or event triggering it.

## Where it comes from
Named after `crontab`, a scheduling tool built into Unix in the 1970s. The name has stuck as generic shorthand for "scheduled job," even on platforms that don't use the original Unix tool.

## How it's usually expressed
A cron schedule is written as five fields — minute, hour, day-of-month, month, day-of-week:

```
0 2 * * *   →  every day at 2:00am
*/15 * * * *  →  every 15 minutes
0 9 * * 1   →  every Monday at 9:00am
```
`*` means "any value." You rarely need to write this by hand — most tools (Supabase, GitHub Actions, cloud schedulers) give you a plain-language or dropdown option that generates it for you.

## Why it matters (BA lens)
Cron is the boundary between **manual** and **autonomous** processes. Anything currently triggered by a person clicking a button is a manual process with a person as a control point — someone notices if it breaks. Once it's on cron, it runs unattended, which means:
- **Upside:** no one has to remember to do it; consistent cadence; frees up time.
- **Risk:** failures can go unnoticed without separate monitoring/alerting. A process is only safe to automate once its logic is trusted — automating a flawed process just means it fails automatically instead of manually.

## Context examples

**In craftbeer.kiwi:** `brewery-sync` and `brewery-discover` are currently manual-trigger Edge Functions. Putting them on cron (e.g. via Supabase's built-in scheduler, which sets up `pg_cron` under the hood) would make closure-checks or discovery runs happen automatically — appropriately gated, per your to-do, behind proven manual test runs first.

**In general software/business systems:**
- A nightly batch job that reconciles bank transactions before staff arrive.
- A weekly report auto-emailed to stakeholders every Monday morning.
- A cloud backup that runs at 3am when system load is low.
- A "cleanup" job (like your planned trail-expiry function) that deletes stale records daily.

## Related terms you'll bump into
- **Batch job** — a broader term for any task that processes work in bulk, often (but not always) on a schedule.
- **Webhook / event trigger** — the alternative to cron: run *in response to* something happening, rather than on a timer.
- **`pg_cron`** — the specific Postgres extension that implements cron scheduling inside a Supabase database.

---
*Concept snapshot — craftbeer.kiwi project reference set*
