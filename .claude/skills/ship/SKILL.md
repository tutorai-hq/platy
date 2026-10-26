---
name: ship
description: The per-task review loop for The Primer. Run when a task's code and tests are done. Gate, then eval if triggered, then diagram, then the reviewers in parallel, then a summary and commit message. Commits non-gate changes; gate-file changes are Connor's or Michael's to commit.
---

# /ship

Run this at the end of every task. It is the review step and the last step before the commit. **You may commit non-gate changes yourself. Gate-file changes are committed only by Connor or Michael, with `ALLOW_GATE_CHANGE=1`, which you never set** (CLAUDE.md, The loop, step 3).

## 0. Task header (required)
State it before anything else. If you can't fill a line, stop and ask:
```
R-id: R-xx            acceptance test: tests/...::test_...
arch: none | <what changes>
```

## 1. Mechanical steps (stop at the first failure and fix it; don't review a red tree)
```bash
scripts/check
for s in privacy mastery_math pedagogy gate; do echo "[$s]"; scripts/gate.py match $s --changed; done
```
Each `match` prints the files it found; exit 1 means none.
- **pedagogy** matched → `scripts/gate.py eval-gate`. It fails closed with no eval, and a pass is cached so pre-commit won't pay twice. Record `eval: pass`, `skipped (cached)` or `n.a.`
- Always run `scripts/diagram`, then `git diff -- diagrams/AS-BUILT.md` (the whole file if it's untracked). **Architecture changed = the diff touches anything besides the `<!-- stamp: -->` line.**
- **gate** matched → `gate files changed: yes`, and name them. Weakening the gate needs Connor's or Michael's explicit OK.

## 2. Reviewers (in parallel, one message, each independent and read-only)
Give each one the diff command (`git diff HEAD`, or `git status --short` + file reads before the first commit, plus untracked files), the task header, and the AS-BUILT.md diff.

| Reviewer | When |
|---|---|
| `scope-skeptic` agent | always |
| `architect-reviewer` agent | always (include the `arch:` line and the AS-BUILT diff) |
| `/code-review` (Skill `code-review`, level `medium`) | unless the diff is docs- or tests-only |
| `privacy-boundary-reviewer` agent | `[privacy]` matched (pyproject.toml is in it, so new dependencies count) |
| Codex (**Connor or Michael runs it**, see below) | `[privacy]` or `[mastery_math]` matched |

**Codex:** its commands are user-only (`disable-model-invocation`). When triggered, print the exact command for Connor or Michael, then triage when its output comes back:
- `[privacy]`: `/codex:adversarial-review --wait Check against PRIVACY.md. Find any path where conversation content, audio, photos or PII escapes the gateway.`
- `[mastery_math]`: `/codex:adversarial-review --wait Check the BKT update equations and parameter handling against DECISIONS.md A-5 (pyBKT, multigs buckets).`
- Never `/codex:rescue` on boundary or math code (it's denied in settings anyway).

**Triage every finding:** fix it (a reproducible bug gets a failing test first) or dismiss it in one line saying why. **Codex findings are hypotheses:** reproduce each as a failing test, or dismiss it, and never apply a Codex rewrite. Append one line per Codex review to `.claude/codex-log.md`: `YYYY-MM-DD <sha-or-"uncommitted"> <focus> accepted:<n> dismissed:<n>`. After any fix, re-run step 1.

## 3. Summary for Connor or Michael (exactly this block)
```
R-id: R-xx — <task>        acceptance test: <path::name> PASS
gate: green | eval: pass/skipped (cached)/n.a. | gate files changed: y/n (<files>)
architecture changed: y/n, declared: y/n        [+ architect-reviewer verdict]
scope: KEEP k / CUT c / SHRINK s   (CUTs acted on: …)
drift: <A-ids or none>   privacy: <P-ids or none / not triggered>   codex: <n accepted / n dismissed / not triggered>
fixed: …   dismissed: … (one line each)
teen-test: <persona/device outcome, …> | top: <S-level + problem> | report: <path>   (only if web/ changed)
```
**`web/` changed →** before writing the block, run `/teen-test --quick <the feature, in a few words>` (Skill `teen-test`) and fill the `teen-test:` line from its summary. It reports and never blocks the commit; S1 findings get named in `fixed:` or `dismissed:` like any other finding.

## 4. Commit message
Run the `change-summarizer` agent (default mode, short message). Show the message.

## 5. Handoff
Run `/handoff` so the note lands in the same commit. If `gate files changed: n`, you may stage with `git add -A` and commit with the step 4 message; otherwise Connor or Michael commits. Then **stop**. Pre-commit re-runs the gate, the eval (cached) and the diagram (stamp fresh, so no LLM call), and stages AS-BUILT.md into the commit.
