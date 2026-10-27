# Repair puzzles for the integer and order-of-operations slips (R-37)

- **Who:** michael   **Area:** frontend
- **Branch / PR:** `claude/project-thread-4y9cnb` (the review branch on top of PR #4's branch), one commit plus this note; Michael merges into PR #4 after review
- **R-ids:** R-37 (approved; no new R-id), with R-40 slips and R-41 numbers   **gate:** green (`scripts/check`); `web/` tsc + vitest 320/320 (28 new)

## What changed
- **Every slip on the demo path now has a repair.** `slips.json` `repairs_to_build` is empty, and `content.test.ts` "repair items" asserts it: every slip id resolves to an item whose checks verify over every level × 50 seeds.
- **Four items on the existing players,** no new player type (`REPAIRS` in `web/src/mock/puzzles.ts`):
  - `repair-integer-signs` (spot the error): a level-3 integer problem worked out a line at a time, with the sign of one product or quotient wrong and the lines after it following from that. For `negative_times_negative_negative`, `integer_sign_dropped` and `order_sign_dropped`.
  - `repair-order-precedence` (spot the error): an order problem worked strictly left to right (brackets still first), wrong from the line where that changes the value. For `left_to_right_ignoring_precedence`.
  - `repair-order-brackets` (spot the error): an order problem worked with its brackets skipped, wrong from the first line. For `brackets_ignored`. Level 1 is bumped to 2, where the generator's forms have brackets.
  - `repair-integer-subtraction` (missing step): a three-number sum `n1 ± n2 - n3` with its middle line missing and the answer shown below it, so the student writes "what the first two make, minus the last". For `subtraction_treated_as_addition`.
- **`web/src/mock/working.ts` (new):** `workOut` writes an expression's working the way a student would ("20 - 3*6", "20 - 18", "2"), in the usual order or left to right, and can plant one slip; `firstWrong` finds the wrong line by what the lines come to; `sameExpression`, `sameSum`, `isNumeralText`, `unbracketed` (moved here from `slips.ts`). The mock grader never uses a hard-coded index: `wrong` is `firstWrong(expression, lines)`, and the fix is any line that comes to the value and isn't the line above copied.
- **Generators** (`web/src/mock/generate.ts`): `signChain`, `orderChain`, `sumLine`, all from `makeProblem` for `integer_arithmetic` / `order_of_operations`, rejecting a lesson problem, a line with the same value as one on the problem, and any instance that shows the answer anywhere on screen. `SpotInstance` gained `kind: "equation"` and there's a `WorkingSpotInstance` (`kind: "working"`); `MissingInstance.blank` can be `"working"`. `clashes()` is `isOneOf` plus same value or same expression.
- **Expression step lines** (`web/src/mock/steps.ts`): `checkStep` falls through to `checkWorking` when neither line is an equation: `valid` when the value is the same, `solved` when the line is one number, `unreadable` otherwise. So a `steps` problem on an expression skill routes a detected slip to its repair, then a fresh problem to work out (`confirmProblem` has a value variant, "Work it out one line at a time"). `script.ts` gained the two unreadable lines for value problems, and `SpotTheError.tsx` / `StepSolver.tsx` pick their wording by whether the problem has an equals sign.
- **R-06:** `REPAIRS` is now under the fixed-lines test in `script.test.ts` (≤ 2 sentences, ≤ 25 words, no idioms); `repair-inverse-divide`'s intro was shortened to pass it.
- **Acceptance tests:** `content.test.ts` "repair items" (both tests); `puzzles.test.ts` "repair items" (a describe for the worked-out items and one for the subtraction item: lines consistent after the wrong one, never the last line wrong, fix accepted in any right form, every ask, no number in a hint, levels); `working.test.ts` (the stepper); `steps.test.ts` (expression lines); `mock.test.ts` "expression repairs" (one slip of each skill opens its repair; the order one is played through to a fresh problem, solved line by line).
- `web/README.md`: the R-48 and R-41 paragraphs mention expression lines and the new repairs.

## Decisions and why
- **How these slips reach the student.** They didn't: the demo lesson has only two-step problems, probing goes two_step → one_step → inverse (never integer or order), and a wrong probe answer never looks for a slip. The smallest wiring consistent with R-01/R-48 was to let the step solver take expression lines, so any lesson problem on an expression skill gets the same slip → repair → fresh problem path as an equation. **The demo lesson is unchanged;** the new items only show when a lesson includes an integer or order problem (the mock tests use a one-problem lesson). Giving them a demo entry is below.
- **Lines are checker text, flat.** A left-to-right line prints as "17*6", not "(20 - 3)*6", because that is what the student means and `firstWrong` has to evaluate it that way.
- **The signs item uses level-3 numbers at every level,** because levels 1 and 2 have at most one product and the slip needs a signed product or quotient with something after it.
- **The fix accepts any right next line,** not only the one the generator had in mind, so "20 - 6*3" is as good as "20 - 18"; the value by itself is "skipped", the line above copied is "copied".

## Contract changes
- None on the wire. `step_result` and the `puzzle` events are unchanged; `confirmProblem`'s value variant sends `variable: null`, which `answerExample` already handles.

## Known gaps and leads (Michael's call)
- **A way into these repairs from the demo:** a Demo menu entry or a lesson problem on `order_of_operations` (for example `20 - 3*(4 + 2)`, where `17*6` on line 2 opens the precedence repair). Alternatively slip-aware probes, where a wrong probe answer on `(-6)*(-4)` opens the signs repair instead of probing deeper; that changes the approved demo arc, so it needs a decision.
- `MissingStep.tsx` still says "What goes in line 1?" for the subtraction item; the instructions carry the real prompt.
- `/ship`'s reviewers and `/teen-test --quick` weren't run here (the skills don't load in this cloud session); the UI change is two wording switches.

## Next steps
1. Michael: review and merge the branch into PR #4 (the merge of main from the earlier note still needs your commit).
2. Prompt D: the confidence check (R-30).
