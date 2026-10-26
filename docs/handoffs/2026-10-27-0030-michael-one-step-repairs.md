# Repair puzzles for the one-step slips (R-37)

- **Who:** michael   **Area:** frontend
- **Branch / PR:** `claude/project-thread-4y9cnb` (the review branch on top of PR #4's branch), one commit plus this note; Michael merges into PR #4 after review
- **R-ids:** R-37 (approved; no new R-id), with R-40 slips and R-41 numbers   **gate:** green (`scripts/check`); `web/` tsc + vitest 292/292 (12 new)

## What changed
- **Four repair items for the five one-step slips,** on the existing players (`REPAIRS` in `web/src/mock/puzzles.ts`). No new player types, no UI change, no protocol change.
  - `repair-one-step-coefficient` (balance scale, "ax = c"): for `multiplied_instead_of_divided` and `coefficient_subtracted`. The only move that works is the split; taking units off the x side asks "what undoes times?".
  - `repair-one-step-multiply` (one line, "x/k = c"): for `divided_instead_of_multiplied`. The student writes `x = kc`; dividing again gets asked about.
  - `repair-one-step-sign` (one line, "−ax = c"): for `coefficient_sign_dropped`. The answer without its sign gets "sign and all".
  - `repair-one-step-direction` (one line, "x + b = c" or "x − b = c"): for `add_subtract_wrong_direction`. The instructions name which way to undo ("Here $8$ is taken away from x"), and applying the number again gets asked about.
- **Numbers come from the one-step generator** (`oneStepLine` in `web/src/mock/generate.ts`, next to `lastStep` and `oneStepBalance`) at the student's level, capped at 2 (level 3 is fraction answers, not this one move); the sign item always uses level 2, where the number in front of x can be negative; the scale always uses level 1, because it draws every unit. No number on screen is the answer, and no instance is a lesson problem.
- **The one-line items** reuse the missing-step player with a single blank line. `MissingInstance` gained `slips` (the wrong values to ask about, per instance) and `vars` (instance words for the text slots, like which way to undo), and `finalAnswer` takes a list of slips instead of one.
- **Demo wiring** (`web/src/transport/mock.ts`): `2x = 12` then `x = 10` on `2x + 5 = 17` opens the one-step coefficient repair, then a fresh two-step problem, once per session, exactly as the two-step repair does. The repair's `avoid` list now includes the lines the student has written on the problem, so the scale is never `2x = 12` itself (it would walk them to the problem's answer, R-02).
- **`slips.json`:** `repairs_to_build` is down to the four integer and order items; `divided_instead_of_multiplied` points at `repair-one-step-multiply` and `coefficient_sign_dropped` at `repair-one-step-sign`.
- **Acceptance tests:** `web/src/content/content.test.ts` "repair items" (every repair id resolves and verifies over every level × 50 seeds, solved through `gradeMove`; every inverse, one-step and two-step slip has a repair); `web/src/mock/puzzles.test.ts` "repair items" (one describe per new item: form, no answer on screen, the asks, levels); `web/src/transport/mock.test.ts` (the `x = 10` slip opens the repair and a fresh problem follows; a second slip gets the question; 25 seeds never build the scale on a lesson line).
- `web/README.md` step 10 mentions the one-step repair.

## Decisions and why
- **Three items for the coefficient family, not one.** The prompt allowed a split. The scale can't draw a negative number in front of x or an x that is divided, and each of those slips needs its own words ("keep the sign", "what undoes dividing"). Hints and asks are specific instead of generic slot-filled sentences.
- **The direction item names the move in its instructions,** as the prompt asked, because the slip is about direction: the practice is in choosing "take away" or "add back" and doing it.
- **Instance words (`vars`) rather than a template per form,** so the item text stays in one place in `puzzles.ts` and the instance only supplies "added to x" or "taken away from x".
- **No change to `MissingStep.tsx`.** With one line the prompt reads "What goes in line 1?", which is fine for a repair; a per-item prompt would mean new child-facing text in a component.

## Contract changes
- None. The items use the existing `puzzle` events and templates.

## Still to build (in `slips.json` `repairs_to_build`)
- `repair-integer-signs`, `repair-integer-subtraction`, `repair-order-precedence`, `repair-order-brackets` (prompt C). These skills have expressions, not equations, so the existing templates may need a new one; prompt C says to stop and ask before adding a player type.

## Known gaps and leads
- `REPAIRS` text isn't under the R-06 fixed-lines test (`script.test.ts` covers `ITEMS`, `WORKED_FADES`, `WALKTHROUGH` and the script). The new items were written to its limits anyway. Adding `REPAIRS` would need one older intro shortened (`repair-inverse-divide` has three sentences).
- `x/4 = 6` renders as plain `x/4 = 6`, not a stacked fraction, because the instance's LaTeX is the checker text so `isOneOf` can still read it.
- `/ship`'s reviewers and `/teen-test --quick` weren't run here (the skills don't load in this cloud session); the change is data, generators and tests, with no new UI.

## Next steps
1. Michael: review and merge the branch into PR #4 (the merge of main from the earlier note still needs your commit).
2. Prompt C: the integer and order-of-operations repairs.
