# Two angles per demo skill (R-05)

- **Who:** michael   **Area:** frontend
- **Branch / PR:** `claude/project-thread-4y9cnb` (the review branch on top of PR #4's branch), one commit plus this note; Michael merges into PR #4 after review
- **R-ids:** R-05 (approved), reading prompt E's catalog (R-37)   **gate:** green (`scripts/check`); `web/` tsc + vitest 368/368 (11 new)

## What changed
- **Nine teach items** (`TEACH` in `web/src/mock/puzzles.ts`, descriptors in `web/src/content/catalog.json`, all `draft`), two angles per demo skill:
  - integer arithmetic: `teach-integer-number-line` (visual: moves on a number line, worked example) and `teach-integer-signs` (worked: a signed product with one more step);
  - order of operations: `teach-order-steps` (worked: each step named) and `teach-order-spot` (contrast: a wrong solution to find the slip in, spot-the-error);
  - inverse operations: `teach-inverse-undo-chain` (undo: what was done to x, undone in reverse, worked example) and `teach-inverse-balance` (balance: take the same off both pans);
  - one-step equations: `teach-one-step-worked` (worked: the same move written on both sides) and `teach-one-step-balance` (balance: split into equal groups);
  - two-step equations: `lin2-worked-example` (exists) and `teach-two-step-balance` (balance).
  Every item takes generated numbers, is skinned, keeps its hints in data, never shows a lesson problem or a probe, and never has the answer on screen at a fade the student writes it.
- **Worked examples carry their own words and fade as items.** `WorkedItem` holds the two-step example's `walkthrough` (reasons, why, choices) and `fades`; `WorkedInstance` gained `kind` (`equation` or `working`), `lines`, `alsoFirst`, `firstSlips`, `finalSlips` and `vars`. New generators: `numberLineWorked`, `signWorked`, `orderWorked`, `oneStepWorked`. Grading covers a worked-out expression (one step done, the rest left, then the value) as well as an equation; a slip key the item has no ask for falls back to its general ask. `newItemPuzzle` takes a fade, and the mock fades the item it started with instead of falling back to the two-step one.
- **`web/src/mock/teach.ts`:** `pickTeachItem(node, anglesTried)`, the first teach item on the skill whose angle hasn't been tried, in catalog order; null once every angle is used. `teachAngles(node)` lists them.
- **The mock switches angle (R-05).** It keeps the angles used per skill and the problem a teach went back to. An unexplained wrong line there (after the probe and repair branches have had their turn) says `SWITCH_ANGLE` ("Still tricky. Let me show it another way.") and offers **Show me how**; the primer panel's reason is the new `switch_angle` code. With every angle used, the usual ladder runs (ask why, then the pause).
- **`contrast` joins the angle vocabulary** (`ANGLES` in `catalog.ts`; the proposal's row says what it means).
- **`WorkedExample.tsx`:** the last-line prompt reads "the one number it comes to" when the problem has no x. Text only; no layout change, so the frontend-design skill wasn't needed.
- **Coverage grid regenerated:** every demo skill's teach cell is filled, the one-angle list is empty, 15 of 96 cells. README and `docs/proposals/item-descriptor.md` updated.

## Acceptance tests
- `web/src/content/catalog.test.ts` "gives every demo skill teach items from at least two angles": ≥2 distinct angles per demo node, each on a player the mock has.
- `web/src/transport/mock.test.ts` "changes the angle when the explanation doesn't land, and never repeats one while another is unused (R-05)": the arc to the gap, the undo chain, three fades, back on `2x + 5 = 17`, a second unexplained miss → `teach:switch_angle:inverse_operations` with a balance scale, back again, a third miss gets no third explanation; the angles used are all different and are every angle the catalog has for the skill.
- `web/src/mock/teach.test.ts` (the picker), `web/src/mock/puzzles.test.ts` "teach items (R-05)" (seven tests: text fills for every skin and fade, hints hold no answer, fades hand over one step at a time, each item is solved by its own lines and asks back about each known wrong line or value, the balance and spot items play through), `script.test.ts` now covers `TEACH` under the R-06 fixed-lines rules, `coverage.test.ts`.

## The demo arc changed, a little (Michael should know)
The arc's teach step now shows **`teach-inverse-undo-chain`** (inverse operations, undo angle) instead of the two-step worked example: the same kind of numbers and player, framed as "x was times a, then + b; undo the last move first". That fixes F's finding (inverse operations had no teach item) and the approved arc test's assertions hold unchanged. Then: back on `2x + 5 = 17`, another unexplained line such as `2x = 98` gets the balance scale on `x + b = c`; `2x = 22` still gets the repair and the fresh problem.

## Decisions and why
- **Catalog order is the selector's preference**, and every demo skill lists its worked example first, so the first time a gap is taught looks as it did, and the panel's `gap_found` text ("Teaching it with a worked example") stays true.
- **The undo chain's vehicle is a two-step equation**, because undoing in reverse order is what inverse operations are for. Its primary skill is `inverse_operations` and `touches` is empty: the catalog only allows prerequisites there, and two-step equations aren't one of inverse operations'.
- **Worked teach items fade through all three fades**, like the two-step example (backward fading, R-37). Balance and spot items run once. The arc's three skips are unchanged.
- **Reasons and the "why" belong to the item**, not a shared table, because each angle explains differently. The slip keys the generators emit are declared as asks on each item, and the tests fail on a key with no ask.
- **The order item stays at level 2 at most** (level-3 problems have five lines; the player shows two steps) and the number line at level 2 (level 3 is products). The sign item draws its own numbers so the product is the first step.
- **A one-step first line comes to `x = answer` already** (`x + 7 - 7 = 12 - 7`), so skipping is judged by the line written as a solution, and the last line has to have x by itself on one side.
- **The switch waits its turn**: the first unexplained miss probes (R-01), a slip with a repair repairs, and only then does a miss on the problem the teach went back to switch angle. One switch per angle in the catalog; then nothing is repeated.

## Contract changes
- `primer.json` reason `switch_angle` (R-42 panel), text "That explanation didn't land. Teaching {skill} again from a different angle." No protocol change; the worked example's wire is as it was.
- Descriptor vocabulary: `angle` gains `contrast`.

## For Connor
- The real item selector (handshake plan C.11) needs an **"angles tried this session" input per skill**. The mock's rule: the first teach item on the skill whose angle isn't in that list, in catalog order; none left means no re-teach, and policy falls back to asking why. The arc's angle switch is `teach:switch_angle` in the primer view.
- `contrast` as an angle in the descriptor (a sixth value; the proposal's open questions are unchanged otherwise).

## Known gaps and leads (Michael's call)
- From the demo lesson, the switch is reachable on inverse operations (the arc's gap) and on one-step equations (when the deeper probe passes). The integer and order teach items are reachable only through the catalog and tests today, the same gap as the C note on their repairs; a Demo entry is yours to call.
- All nine descriptors are `draft` until you review the text.
- `/ship`'s reviewers and the teen tester weren't run (the skills don't load in this cloud session). Child-facing text changed: nine items, one script line, one prompt. All of it is under the R-06 fixed-lines test.
- `CLAUDE.md` still has nothing on `npm --prefix web run coverage` (from F); yours.

## Next steps
1. Michael: review and merge the branch into PR #4 (the merge of main from the A note still needs your commit).
2. Prompt H of `claude-code-prompts-2.md`: story problems.
