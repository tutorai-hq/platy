# Repair puzzles for the demo slips (R-37)

*Renumbered 2026-10-26: the step-by-step solving requirement this note calls R-39 is now R-48. R-39 is Connor's "Stay on math" (main, 2026-10-22).*

- **Who:** michael   **Area:** frontend
- **Branch / PR:** on top of R-39, R-40 and R-41 on PR #4's branch (`claude/content-library-design-txzs0z`)
- **R-ids:** R-37 (approved; no new R-id)   **gate:** green (`scripts/check`); `web/` tsc + vitest 200/200

## What changed
- **Three new repair items, on the existing players** (`REPAIRS` in `web/src/mock/puzzles.ts`). No new player types.
  - `repair-two-step-coefficient` (missing step): the first step is shown and the last line is blank. It is for "subtracted the number in front of x" on a two-step problem. Writing `x = c - b - a` gets a question about that move, not the answer.
  - `repair-inverse-undo` (balance scale): "x + b = c". Take the units off and x is alone.
  - `repair-inverse-divide` (balance scale): "ax = c". Split into a groups.
- **Numbers come from the generators** (`lastStep`, `oneStepBalance` in `web/src/mock/generate.ts`). The two-step repair uses the student's level, with level 3 capped at 2, because fraction answers are for solving, not for practising one move. The balance scales always use level 1, because the scale draws every unit.
- **No puzzle uses a problem from the student's lesson** (`isOneOf`, which compares equations however they're written). This also applies to the three older items that slips point at (`lin2-*`). So a puzzle never walks through the steps of a problem the student still has to solve (R-02).
- **Every inverse operations and two-step slip now has a repair item.** `slips.json` lists 6 left to build (below).
- **Demo wiring** (`web/src/transport/mock.ts`, `mock/script.ts`):
  - A slip on a step line opens that slip's repair puzzle, once per session. For example, `2x = 22` on `2x + 5 = 17` opens the spot-the-error puzzle about the sign.
  - When the puzzle ends, a fresh generated two-step problem (`g1`) takes the slipped problem's place, with "Now a fresh one, to make sure the fix sticks."
  - The fresh problem is never a lesson problem or the repair puzzle just shown. A pause during the repair still leads to the fresh problem after the warm-up, not back to the slipped one.
- **Acceptance tests:**
  - `web/src/content/content.test.ts` "repair items": every repair id in `slips.json` resolves to an item whose checks verify (every level × 50 seeds, solved through `gradeMove`), or it is listed to build.
  - `web/src/mock/puzzles.test.ts` "repair items": skins fill, hints don't give the answer, no lesson problem appears, and level and answer checks.
  - `web/src/transport/mock.test.ts`: slip → repair → fresh problem, fresh-problem checks over 24 seeds, and pause during the repair.
- Older transport tests that used `2x = 22` as a plain wrong line now use `2x = 99`, because `2x = 22` opens a repair.

## Decisions and why
- **The repair comes right after the slip,** like the answer-box misconceptions, instead of after a hint. The demo arc is "catch a slip on one line, repair with a puzzle, confirm with a fresh problem".
- **Once per session:** a second slip gets the usual "what did you do to each side?" question, so a student isn't sent into puzzle after puzzle.
- **The fresh problem replaces the slipped one** instead of coming back to it. The repair is about the same move, so going back would be a copy.
- **The `frontend-design` skill wasn't needed:** no new UI. The items use the existing players and styles.

## /ship review
- **Scope:** 0 cuts. Shrink dismissed: `level` stays a field on the transport (always 1 for now), because that's where the primer's level will plug in.
- **Privacy:** 0 findings (no storage, logging, network or new dependencies).
- **Code review:** four findings, all fixed with failing tests first:
  - The older items could show a lesson problem. For example, the balance puzzle could be `2x + 5 = 17` itself.
  - A pause during the repair went back to the slipped problem.
  - The fresh problem could repeat s2 or the repair puzzle.
  - "No number on screen is the answer" missed `3x - 5 = 10` (answer 5), and the balance scales could have the answer already on the left.
- **Codex:** `web/` is `[privacy]`, so Michael or Connor runs `/codex:adversarial-review` (see Next steps).

## Contract changes
- None. Repair items use the existing `puzzle` events and templates.

## Still to build (in `slips.json` `repairs_to_build`)
- `repair-one-step-coefficient` (4 one-step slips, such as `2x = 12` → `x = 10`). This is the next most useful one for the demo, because the step solver detects these slips on two-step problems too.
- `repair-one-step-direction`
- `repair-integer-signs`, `repair-integer-subtraction`
- `repair-order-precedence`, `repair-order-brackets`

## Known gaps
- `repair-inverse-undo` and `repair-inverse-divide` exist and verify, but the mock lesson can't reach them yet. Undo slips only fire on "x - 4 + b = x" style questions, which the scripted lesson doesn't ask. They'll be reached once the primer probes inverse operations (prompt 5's demo arc).
- The older `lin2-*` items keep their own number ranges, not the generators'.

## Next steps
1. Michael: run `/codex:adversarial-review --wait Check against PRIVACY.md. Find any path where conversation content, audio, photos or PII escapes the gateway.` on prompts 1 to 4.
2. Prompt 5 ("what Platy is thinking" panel, R-42) needs Michael's OK on the R-42 wording first.
