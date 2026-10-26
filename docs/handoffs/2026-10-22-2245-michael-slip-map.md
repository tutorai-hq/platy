# Slip map for the demo path (R-40)

*Renumbered 2026-10-26: the step-by-step solving requirement this note calls R-39 is now R-48. R-39 is Connor's "Stay on math" (main, 2026-10-22).*

- **Who:** michael   **Area:** frontend
- **Branch / PR:** on top of the step-solver change (R-39) on PR #4's branch, uncommitted; delivered to Michael to review and commit himself
- **R-ids:** R-40 (new, approved by Michael 2026-10-22)   **gate:** green (`scripts/check`); `web/` tsc + vitest 182/182

## What changed
- **R-40 added to `REQUIREMENTS.md`** with Michael's approved wording; the R-36 note now says R-41 and R-42 are unused.
- **`web/src/content/slips.json`**: 18 slips on the five demo nodes (`integer_arithmetic` 3, `order_of_operations` 3, `inverse_operations` 3, `one_step_equations` 5, `two_step_equations` 4). Each has an id, node, name, the rule in words, a hint, a repair item id, 2–3 examples and a correct step. Plain JSON with `schema_version`, so the server can load the same file.
- **`web/src/content/slips.ts`**: typed loader (`SLIPS`, `slipHint`, `REPAIRS_TO_BUILD`).
- **`web/src/mock/slips.ts`**: mock detector, a stand-in for `platy.mathcheck`. Each rule rebuilds where one known wrong move leads (from the line above's a, b, c, or the expression's value) and compares values, so any arrangement of the same wrong line matches. It looks in the problem's own skill first, then its prerequisites from `skill_map.json`, so `2x = 12` → `x = 10` on a two-step problem is caught as the one-step slip `coefficient_subtracted`.
- **Wrong lines show the slip's hint** in place of the generic mark (`StepSolver.tsx`); the mock sends `slip` on `step_result` for invalid lines.
- Acceptance test: `web/src/content/slips.test.ts` (every slip detected on its examples, no flag on its correct step, nodes real, hints have no digits or `=`, repair ids exist or are listed to build). Wiring: `state.test.ts`, `mock.test.ts`.

## Decisions and why
- **Hints never contain a number or `=`** (tested), so a hint can't hand over a line (R-02).
- **Detection by value, not by text**: a slip matches whatever form the student writes it in. The real version is sympy on the server.
- **A slip is named only when the line looks like that slip**: equation slips also check the shape of the student's line (x alone, or the number in front of x kept, or x plus a number), and the number side must be one number. So `3x - 4 = 11` → `x - 4 = 8` gets no slip even though it solves to a slip's wrong value. If two slips on the same skill both fit, neither is named.
- **Hints never say part of the answer is right** ("the size looks right" handed over the number), tested by a short banned-phrase check.
- **Three slips point at existing items** (`lin2-undo-sign-spot-error`, `lin2-balance`, `lin2-missing-step`); nine new repair ids are listed in `repairs_to_build` for prompt 4.

## Contract changes
- `step_result` gains `slip?: string`, a slip-map id; the browser looks up the hint in `slips.json`.

## /ship review
- Code review found 7 issues; 6 fixed with tests (shape check on equation lines, brackets that multiply, `-6 * (-4)` read as two negatives, hints that confirmed the size, undo questions sorted by how b is used with the two scale slips renamed `undo_scale_by_repeating` / `undo_scale_with_negative`, more ways of dividing only some terms, ties left unnamed). Dismissed: `-6 * -4` with no brackets, since the parser can't read `* -4` at all and problems are written with brackets.
- Scope review: 0 privacy findings; shrinks applied (shared sign-dropped rule, `near` reused from grade.ts, `DEMO_NODES` moved into the test, `slipById` inlined).

## Open questions for Connor
- Hints are fixed child-facing text in `web/src/content/slips.json`, outside `src/platy/prompts/`. Fine for the mock; when the server sends them, should they move to `prompts/` so the eval gate covers them?
- Where does the slip map live server-side (beside `skill_map.json`, or in the item library), and does `platy.mathcheck` own the detection? The `rule` text in each slip is the spec.

## Next steps
1. Michael: review and commit, then run the Codex review (`[privacy]`, web/ changed).
2. Prompt 3 (R-41 generators) feeds generated numbers to these rules.
