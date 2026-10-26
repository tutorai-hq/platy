# Step-by-step solving with moving algebra (R-39)

*Renumbered 2026-10-26: the step-by-step solving requirement this note calls R-39 is now R-48. R-39 is Connor's "Stay on math" (main, 2026-10-22).*

- **Who:** michael   **Area:** frontend
- **Branch / PR:** on top of PR #4's branch (`claude/content-library-design-txzs0z`), uncommitted; delivered to Michael as a patch to review and commit himself
- **R-ids:** R-39 (new, approved by Michael 2026-10-22)   **gate:** green (`scripts/check`); `web/` tsc + vitest 172/172

## What changed
- **R-39 added to `REQUIREMENTS.md`** (Content library section) with Michael's approved wording; the R-36 note now says R-40–R-42 are unused.
- **New `StepSolver` card** (`web/src/components/StepSolver.tsx`): on a `steps` problem the student writes one line at a time under the equation, lines aligned on the equals sign. An accepted line gets a check; a wrong line stays on screen, marked, with the text left in the box to fix. The next line opens only after the server accepts the last one. It reuses PR #4's `LineEntry` and keypad.
- **Motion on an accepted line** (under 600 ms): kept terms slide down from the line above; a term that crosses the equals sign flies over and flips sign (`+ 5` → `- 5`); a coefficient crosses as `÷ 2` (or `÷ 3` → `× 3`); a move written out on both sides drops in; worked-out terms in the line above dim together. `prefers-reduced-motion`: a 150 ms fade only. The plan comes from the pure `web/src/math/terms.ts` (`planStep`), tested in `web/src/math/terms.test.ts`. It's display only and never grades.
- **Mock step checker** `web/src/mock/steps.ts` (stand-in for `platy.mathcheck`): `valid` when the line is a linear equation in x with the same solution as the line above; `solved` when x stands alone opposite a finished number; `invalid`; `unreadable`. Acceptance test: `web/src/mock/steps.test.ts`.
- **Mock lesson** now opens with two step problems, `2x + 5 = 17` and `3x - 4 = 11` (skill `two_step_equations`), then the old three answer-box problems. Wrong lines: first ask what was done to each side (R-03), then a look-again nudge, third wrong line brings the pause (R-21). No reply ever states the next line (R-02). Opening and closing lines no longer say "three".
- **Shared helper:** `substitute` and the linear-sampling check moved from `web/src/mock/grade.ts` into `web/src/math/evaluate.ts` (`linearOf`) so the term splitter and the grader share one linearity test.
- Checked with Playwright at 1366×768 (keyboard only), 390×844 (touch, typed and keypad-only) and with reduced motion.

## Decisions and why
- **Skipping ahead counts:** `x = 6` written straight under `2x + 5 = 17` is `solved`. The task's acceptance test asked for that. R-39's "the final answer alone never counts" is read as the answer box (no lines), which a `steps` problem ignores. Open question below.
- **No "same line" nudge.** A line that only restates the one above is equivalent, so it's valid under R-39 as written (scope-skeptic CUT; a nudge would be a new rule).
- **Motion stays in this change** although scope-skeptic wanted it split out: Michael's prompt 1 asks for it as the core of the task. If R-39 should name it, that's Michael's wording to add.
- **A finished line needs a plain number:** `x = 12/2` and `1x = 6` are valid, not solved; one more line finishes them.
- **The tutor stays quiet on a valid line.** The motion is the feedback, so the student keeps going.
- **The browser sends a line only when the reducer takes it**, one at a time, so its lines and the server's can't drift.

## Contract changes
- Proposed for Connor (`web/src/protocol.ts`, `web/README.md` § Session contract): `problem` gains `format: "answer" | "steps"`; client `step {problem_id, line, text}` (line counts from 1); server `step_result {problem_id, line, result}` with `result` in `valid | solved | invalid | unreadable`. R-40 (slip map) will propose a slip id on it. On a `steps` problem the server ignores a bare `answer`. The server holds accepted lines in session memory only, drops them at problem end and on any reset, and never logs them or puts them in error text (P-1, P-10, A-4).

## Open questions for Connor
- Do you accept `step`/`step_result` and `format`? The real checker is `platy.mathcheck`: same solution set as the previous line, plus the "finished" rule above.
- Who picks `format` per problem: policy, or a field on the item?

## Open questions for Michael
- Should a first line that is already the answer (`x = 6`) count as solved, or should Platy ask for one line of work first?

## Next steps
1. Michael: review and commit the patch, then run the Codex review `/ship` asks for (`[privacy]`, web/ changed): `/codex:adversarial-review --wait Check against PRIVACY.md. Find any path where conversation content, audio, photos or PII escapes the gateway.`
2. Prompt 2 (R-40 slip map) fills the slip slot under a marked line.

## Gotchas
- `diagrams/AS-BUILT.md` wasn't regenerated (gate file); the pre-commit hook does it at commit time. Only its privacy-hash stamp should change.
- KaTeX renders a lone `+ 5` as a unary plus, so the step card draws the sign between terms as its own piece.
