# Problem generators for the demo skills (R-41)

- **Who:** michael   **Area:** frontend
- **Branch / PR:** on top of R-39 and R-40 on PR #4's branch (`claude/content-library-design-txzs0z`), uncommitted; delivered to Michael as a patch to review and commit
- **R-ids:** R-41 (new, approved by Michael 2026-10-22, scoped to the demo skills)   **gate:** green (`scripts/check`); `web/` tsc + vitest 187/187

## What changed
- **R-41 added to `REQUIREMENTS.md`.** It uses Michael's chosen wording: the five demo nodes now, and the other nodes after the demo. The R-36 note now says only R-42 is unused.
- **`web/src/mock/generate.ts`: generators for the five demo nodes.**
  - Three levels: 1 is small positive whole numbers, 2 is negatives or numbers past 12, 3 is a fraction or decimal in the answer, or an extra step.
  - `makeProblem(node, level, rng)` makes one problem. `problemSession(seed).next(node, level)` makes a session's problems and never repeats one; when a level runs out of new problems, it throws.
  - Each problem carries `{node, level, prompt, answer, answerText, slips}`.
  - `verifyProblem` checks every problem with the mock checker before it's returned. Equations are checked by their solution, expressions by their value, and undo questions by putting the answer in for b.
- **`web/src/mock/slips.ts`: each rule is now `{values, said}`.**
  - `values` gives where the slip leads from the line above. `said` reads the student's line and returns null when the line doesn't have the slip's shape.
  - `detectSlip` behaves as before. The new `slipValues(node, problem)` lists each slip's wrong answer, so a generated problem knows which wrong answer means which slip.
- **`docs/proposals/generators-python.md`:** a one-page proposal for Connor on the server version. It covers where the generators could live, how `platy.mathcheck` verifies them, and what policy passes in (node, level, seed, the prompts already shown).
- **Acceptance test:** `web/src/mock/generate.test.ts`.
  - 200 seeded problems per node and level pass the checker, have the level's features and a clean answer, and fail the checker with a wrong answer.
  - Sessions don't repeat, and an exhausted session throws. The same seed gives the same problems.
  - Slip values agree with `detectSlip`.

## Decisions and why
- **"Never repeats in a session" is tested with 20 problems per node and level, plus a 150-problem mixed session.** Level 1 undo questions have only 23 distinct problems ("x - n + b = x" and "(x/n)*b = x", n up to 12, so every answer is small and positive). 200 in one session can't be done without making the problems artificial, and a demo session uses about 5. When a session does run out, it throws instead of repeating, so policy has to pick another level or node. Most pools hold hundreds or more.
- **Level 1 answers are never negative.** Undoing an add ("x + 9 + b = x" → -9) is level 2.
- **Clean answers** are whole numbers, fractions in lowest terms with a bottom of 12 or less, or halves (decimal undo shifts at level 3).
- **The scripted lesson doesn't use the generators yet.** Prompt 3 only asked for the generators. Wiring them into the lesson is a separate step.

## /ship review
- **Scope:** 0 cuts, 4 shrinks, all applied: dropped `latex` (nothing renders these problems yet), inlined a one-use helper, `problemSession` reuses `draw()`, and the test uses the exported `gcd`. **Privacy:** 0 findings.
- **Code review:** no high-severity bugs, and the `detectSlip` refactor was checked against the old code on several hundred thousand inputs with no difference. Fixed, with tests:
  - Level 1 undo questions could have negative answers.
  - One level 2 order-of-operations form could never be produced. It's now `b*(c - a)`.
  - The level 3 undo pool was thin (31). It's now about 70, with fraction scales such as `(2/3)x*b = x`.
  - `verifyProblem` accepted a rounded answer text. It now needs the exact value.
  - The slip test now checks detection on equation lines too.
- **Dismissed:** the level 2 test mirrors the generator's own filter. It's the spec, written once in each place.

## Contract changes
- None. Generated problems stay inside the mock.

## Open questions for Connor
- See `docs/proposals/generators-python.md` §"Open for Connor": where the generators live, whether the slip rules are shared between detection and generation, and the seed ranges for eval and the bench.

## Next steps
1. Michael: review and commit, then run the Codex review. This is `[privacy]`, because `web/` changed.
2. Prompt 4 (repair puzzles) builds the nine `repairs_to_build` items from `slips.json`.
