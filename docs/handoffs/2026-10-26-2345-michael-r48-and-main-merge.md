# Step-by-step solving is R-48, and the branch is ready to merge main

- **Who:** michael   **Area:** docs + frontend comments
- **Branch / PR:** `claude/project-thread-4y9cnb` (the review branch on top of PR #4's `claude/content-library-design-txzs0z`), three commits after the teen-test fixes; the merge commit itself is Michael's (Next steps)
- **R-ids:** R-48 (renumbered from R-39), R-26 (recorded), R-30 and R-39 (Connor's, carried from main)   **gate:** green (`scripts/check` on every commit, and on the trial merge of main: 342 passed); `web/` tsc + vitest 280/280

## What changed
- **R-26 (7516c6b):** the matched post-test forms Michael chose on a card on 2026-10-26 are recorded in R-26, and the pre/post-test handoff note's open item is closed. The patch had waited since the "Demo build prompts" session for a machine that could commit.
- **R-48 (44c8083):** step-by-step solving is R-48. Connor approved R-39 "Stay on math" on main (cf54f19) the same day Michael approved R-39 "Step-by-step solving" here, so the first merge of main would have pointed every R-39 in `web/` at the wrong rule. Renamed in `REQUIREMENTS.md`, `web/` (comments, test names, README) and the four handoff notes written on this branch, which get a one-line note at the top instead of an edited history. The one R-39 left in `web/` (`mock.ts`, the off-topic redirect) is Connor's rule.
- **Merge preparation (54b543a):** `REQUIREMENTS.md` carries Connor's R-30, R-39 and R-08 lines byte for byte from main, and the R-36 note names the free numbers (R-28, R-29 and P-14 reserved; R-31 to R-35 unused; R-43 to R-47 proposed).
- **Trial merge of `origin/main` (573f22a) into the branch, not committed:** two conflicts, `REQUIREMENTS.md` (one line, the R-36 note) and `diagrams/AS-BUILT.md` (generated). With the resolutions below, `scripts/check` is green on the merged tree (342 passed) and `scripts/diagram` regenerates the diagram. Main touches nothing under `web/`.

## Decisions and why
- **Connor keeps R-39; step-by-step moves to R-48** (Michael's call through the round-2 prompts file, 2026-10-26, which recommended it). Connor's R-39 is in R-08's eval list and in CLAUDE.md, so renumbering his would have meant editing main. R-48 is the next number nobody has claimed; R-43 to R-47 are the content-library proposals.
- **The merge commit is Michael's, not this session's.** Main's history carries Connor's `DECISIONS.md` change (A-12, d07e3a9). The pre-commit tripwire compares the index with HEAD, so on a merge commit it lists `DECISIONS.md` and blocks without `ALLOW_GATE_CHANGE=1`, which only Connor or Michael set. Nothing in the merge changes a gate file by hand.
- **`--ours` for `REQUIREMENTS.md`:** the branch's version already holds everything main added there. The trial merge's diff against main shows only R-26's item design, the R-36 note's wording, and the content section's R-40 to R-42 and R-48.

## Contract changes
- None. `web/README.md`'s proposed `format: "answer" | "steps"`, `step` and `step_result` now cite R-48.

## Open questions for Connor
- **R-39 is yours (stay on math); Michael's step-by-step is now R-48.** Your eval case for R-39 and CLAUDE.md are unchanged.
- The pre-commit tripwire blocks any merge of main that carries a gate-file change, even one of yours. If that's unwanted, `scripts/gate.py --staged` could skip files whose staged content equals `MERGE_HEAD`'s while `.git/MERGE_HEAD` exists. It's a gate file, so the edit is yours or Michael's.

## Next steps
1. **Michael: merge main into the review branch** (on the Mac, in `~/Documents/GitHub/tutorAI`):
   ```
   git fetch origin
   git checkout claude/project-thread-4y9cnb && git pull --ff-only
   git merge origin/main                        # conflicts in REQUIREMENTS.md and diagrams/AS-BUILT.md
   git checkout --ours REQUIREMENTS.md          # the branch's version (see above)
   git checkout --theirs diagrams/AS-BUILT.md   # the hook regenerates it anyway
   git add REQUIREMENTS.md diagrams/AS-BUILT.md
   ALLOW_GATE_CHANGE=1 git commit               # DECISIONS.md rides along from main (Connor's A-12)
   git push
   ```
   Then PR #4's branch: `git checkout claude/content-library-design-txzs0z && git merge --ff-only claude/project-thread-4y9cnb && git push`.
2. Tell Connor about R-48 (the line above).
3. Prompt B of the round-2 prompts (one-step repairs) continues on the review branch; it doesn't depend on the merge.

## Gotchas
- `git grep -n "R-39"` should return only Connor's rule (`REQUIREMENTS.md`, the R-08 line, `mock.ts`'s off-topic comment) plus history in `docs/handoffs/`. A new "R-39" in `web/` is a mistake unless it's about staying on math.
- After `git merge --no-commit`, running `scripts/diagram` leaves `diagrams/AS-BUILT.md` modified in the working tree, and `git merge --abort` then refuses ("not uptodate"). Run `git checkout -- diagrams/AS-BUILT.md` first.
