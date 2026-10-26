# Pre-test and post-test (R-26)

- **Who:** michael   **Area:** frontend
- **Branch / PR:** on top of R-13 "Your map" (0414c63) on PR #4's branch (`claude/content-library-design-txzs0z`)
- **R-ids:** R-26 (existing; the item design is Michael's, 2026-10-22)   **gate:** green (`scripts/check`); `web/` tsc + vitest 228/228

## What changed
- **`REQUIREMENTS.md` R-26** now records Michael's item design in place of "the item design is Open": 10 questions on the 5 demo skills, two per skill, at level 2, with a different seed for each form.
- **The two forms** are in `web/src/mock/pretest.ts`.
  - Each is two rounds through the skills, easiest first, so the same skill never comes twice in a row.
  - Both forms are fixed, so every student sits the same two tests.
  - Each post question is the same kind as the pre question in its slot: same layout, signs and number sizes, with new numbers. Michael's yes on this is pending (below).
  - No post question repeats a pre question, however it's written.
- **One checker for both forms** (`gradeTestAnswer`). Only a finished number counts: `-3`, `x = -3`, `-3 = x` or a fraction in lowest terms. Retyping the question, or leaving the working unfinished (`-24/8`), doesn't count.
- **`TestRunner`** (`web/src/components/TestRunner.tsx`):
  - an intro;
  - one question at a time, with "Next question" or "Skip this one", and no hints or feedback;
  - then the score, in total and per skill.
  - Answers sit in a ref until the score is worked out, then they're dropped. The score is counts and skill ids only, and shows on screen only.
- **Fixed text** is in `web/src/mock/script.ts` (`TEST_*`).
- **Entry points:** "Running a test session?" with **Start the pre-test** and **Start the post-test**, on the welcome screen and on both end screens. So the post-test follows practice without a reload. Shown on the scripted mock only (`usesMock()`).
- **Acceptance tests** are in `web/src/mock/pretest.test.ts`:
  - each form covers every skill equally (2 each, level 2);
  - no shared problems;
  - both forms grade with the same checker;
  - only finished numbers count;
  - matched kinds per slot;
  - the score holds no typed text;
  - no hint or verdict words on any question.
- Screenshots are in `/mnt/project-files/pre-post-test/`.

## For the test-user kit (add to its session flow)
1. After the consent form and before any practice, choose **Start the pre-test** on the welcome screen. The teen takes it alone, with no help.
2. Write the score from the end screen on the paper sheet, both the total and the five per-skill counts. Platy keeps nothing, so the score is lost once **Done** is pressed.
3. Run the practice session as normal, then **End session**.
4. On "Your map", choose **Start the post-test**. Write that score down the same way.
5. The gain is post minus pre, overall and per skill. A week-later retest would use the post form again, or a third form if we add one.

## Decisions and why
- **The per-skill rows stay on the score screen,** though "a simple score" was the ask. The proof plan (handshake plan E) is per-node before and after, and the adult needs those counts to write down.
- **Matched forms:** with a plain second seed, slots came out uneven (for example, −156 against 10). A change in score could then reflect easier questions rather than learning.
- **Strict grading:** the test measures whether the student can finish the working, so the checker never evaluates what they type.

## /ship review
- **Scope:** 11 keep.
- **Scope, dismissed:**
  - Shrinking the score to the total only: the per-skill counts are the YC per-node proof.
- **Scope, open with Michael:** matched post forms. A card is posted; it's kept as built until he answers.
- **Privacy:** 0 findings (answers only in a ref, dropped at the score; nothing stored, logged or sent).
- **Code review:** two fixes.
  - With a failing test first: unsimplified answers counted, including the question retyped.
  - Checked in the browser: the post-test couldn't be reached after practice without a reload. The end screens now offer it.
- **Code review, dismissed:**
  - The shape loop could run out on another seed. The seeds are fixed, and the tests build both forms.
  - A paste of thousands of `(` crashes the answer box's preview. This was already true of every answer box (see Follow-ups). The test's checker no longer parses input.

## Contract changes
- None. The test runs in the browser on the mock. On the server, the forms would come from `platy.mathcheck` generators, and the same rules would apply.

## Follow-ups (not built)
- `MathInput`'s preview crashes on very deep nesting (pre-existing). Cap the input length or catch it in `childMathToLatex`.

## Next steps
1. Michael: answer the matched-forms card.
2. Michael: run `/codex:adversarial-review --wait Check against PRIVACY.md. Find any path where conversation content, audio, photos or PII escapes the gateway.` on prompts 1 to 7.
3. Michael: do the iPhone keypad test.
