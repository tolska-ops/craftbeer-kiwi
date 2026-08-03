# Concept Snapshot: Claude Code vs. Chat-Based Claude

**One-liner:** Chat-Claude reasons about code you paste in and hands code back for you to paste out — Claude Code runs inside your actual repo, reading, editing, and executing (build/test/lint/git) directly. The value isn't "smarter answers," it's removing the manual copy-paste relay between what Claude produces and what's actually in the file.

## Why this exists

Raised 2 August, prompted by weighing Claude Code against the current chat-based workflow ahead of adding GitHub Actions CI/CD and a possible Slack notification layer. Worth naming clearly because the honest answer isn't "yes, adopt it, it's better" — it's "yes, for a specific reason, and no to some of the other tooling ambitions in the same breath."

## The core distinction

**Chat-Claude and Claude Code are the same underlying model with a different access boundary.** Chat-Claude can't see your repo, can't run your test suite, can't check what's actually deployed — everything it knows comes from what you paste in, and everything it produces has to be pasted back out by hand. Claude Code has direct read/write access to the repo and a shell — it can run `npm test`, check `git status`, read multiple files to understand real usage before refactoring, and verify a fix against the actual failing command rather than reasoning about it from a description.

This project has already hit the specific failure mode this closes: `DEC-024`, where "dry-run should be the default" was logged as shipped in `decisions.md`/`todo.md`, but the deployed Edge Function still read the flag as opt-in — only caught when the code was checked directly during a security audit. That's a context-transfer failure (belief vs. actual deployed state), not a reasoning failure, and it's exactly the gap Claude Code is built to close.

## Where each fits in the workflow

Idea → **chat-Claude** (planning, architecture trade-offs — a discussion format suits weighing options better than a terminal) → **Claude Code** (implementation, debugging, running tests, checking deployed state against the project's own Definition-of-Done gate) → GitHub → CI/CD → Slack → Release.

The project's own dev-process doc requires gated commits to be "verified against actual deployed/live state" before landing. Chat-Claude structurally cannot do that verification — it has no access to deployed state. Claude Code can run the check itself.

## Stage-by-stage view

| Stage | Chat-Claude | Claude Code | Verdict |
|---|---|---|---|
| Feature planning | Fine — no repo access needed | No real advantage | Stay in chat |
| Repo understanding | Inferred from pasted snippets | Reads the actual tree/history | Claude Code wins |
| Implementation | Pasted back in by hand | Edits files directly | Claude Code wins |
| Debugging | Blind without pasted logs | Runs the failing command, sees the real error | Claude Code wins clearly |
| Refactoring | Fine for single files | Better for multi-file (can verify usages) | Claude Code wins |
| Testing | Can write tests, can't run them | Runs them, sees real pass/fail | Claude Code wins |
| Code review | Fine reading a pasted diff | Can run automatically against a PR diff in CI | Depends — see caution below |
| Documentation | Fine — this is the current pattern | No advantage for prose-heavy docs | Stay in chat |
| PR prep | Written manually from memory of the change | Drafted from the actual diff | Mild win |
| Release management | No advantage either way | No advantage either way | Neither |

## What this doesn't automatically justify

Adopting Claude Code for implementation is a separate question from putting AI review inside GitHub Actions, or building a Slack dashboard. Automated PR review exists to solve a *team* problem — reviewers who didn't write the code getting the same analysis as the author. On a solo project, that's largely restating what Claude Code already said during implementation, at the cost of maintaining a GitHub App, workflow permissions, and secrets. A known failure pattern in that tooling: default workflow permissions ship read-only, so a review job runs green but silently never posts anything — itself another instance of "the doc/config says X, the deployed behaviour is Y," the exact failure category this whole line of work is meant to reduce, not add to.

Slack-as-a-dashboard has the same shape of question: it solves a coordination problem for a team or for genuinely unattended running. Worth building once there's a second real consumer of the notifications (a collaborator, or the hands-off-while-travelling goal already tracked separately in `todo.md`) — not before.

## Recommendation

Adopt Claude Code for implementation, debugging, and test-running — that's a genuine, low-risk gap-closer, particularly given this project's own DoD gate already requires deployed-state verification that chat-Claude can't perform. Keep planning and architecture discussions in chat, where the slower, discussable format suits weighing trade-offs better than a terminal session. Hold off on CI-embedded AI review and a Slack dashboard until the schema stabilises and there's an actual second consumer of that automation — both solve team/unattended-operation problems this project doesn't have yet, and building them now adds exactly the kind of maintenance surface (auth, permissions, secrets) that's produced silent-failure incidents elsewhere on this project already.

**Suggested trial:** two weeks, Claude Code used only for implementation/debugging/test-running on real work, planning left in chat as normal. The signal that decides whether to keep it: did DoD verification against deployed state actually happen more often and more reliably than before. If yes, it's earned its place. If it just felt like a different way to do the same copy-paste, no harm in dropping back.

## Related terms you'll bump into

- **Claude Code** — Anthropic's agentic coding tool; runs in a terminal (or via IDE/desktop integrations) with direct file and shell access to a real repo, distinct from the claude.ai chat interface.
- **`claude-code-action`** — Anthropic's official GitHub Action for running Claude Code inside a CI/CD pipeline (PR review, issue-to-PR automation); a separate adoption decision from using Claude Code locally.
- **Headless mode** — running Claude Code non-interactively (a single prompt in, output out) rather than in its normal interactive terminal session; what makes it composable inside CI systems.
- **Definition of Done (DoD) gate** — this project's own standing process requiring gated commits (schema/prod-writing/public-facing/auth changes) to be verified against actual deployed state before committing, not just reasoned about — see `craftbeer-kiwi-dev-process.md`.

---
*Concept snapshot — craftbeer.kiwi project reference set*
