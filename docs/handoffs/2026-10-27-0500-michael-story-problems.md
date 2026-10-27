# Story problems (R-37)

- **Who:** michael   **Area:** frontend
- **Branch / PR:** `claude/project-thread-4y9cnb` (the review branch on top of PR #4's branch), one commit plus this note; Michael merges into PR #4 after review
- **R-ids:** R-37 (approved), with R-38 skins, R-48 line-by-line solving, R-02   **gate:** green (`scripts/check`); `web/` tsc + vitest 392/392 (24 new)

## What changed
- **Five story templates** in `web/src/content/stories.json` (`points-a-game`, `saving-up`, `packing-bags`, `given-away`, `season-penalty`), each 2–3 sentences with slots for the skin's team, player, container and units (R-38, made-up teams only) and the numbers `a`, `b`, `c`. Each claims a form (`ax + b = c` or `ax - b = c`), carries two story hints and two wrong setups with the story question to ask when one is picked (the sign the wrong way; the two numbers swapped). All descriptors `story-<id>` in `catalog.json`: format `story`, role `apply`, primary `two_step_equations`, angle `story`, levels 1–2, reading level 7, `draft`.
- **`web/src/mock/stories.ts`:** `newStory(template, level, rng, avoid)` draws the numbers (level 1: up to 9 a time, up to 12 one-off, answer 2–12; level 2 up to 12, 40 and 20), makes the answer a whole count of at least 2 that appears in none of the story's numbers, never a lesson or probe equation (R-01), and shuffles three choices (the right equation and the two slips). `gradeSetup` grades by equivalence (any equation with the story's solution counts, except `x = answer` itself), `slipHintFor` matches a wrong setup however it's written, `storyText`/`storyLine` fill a template for a skin, `storyProblem` builds the step problem whose prompt is the equation (`format: "story"`).
- **Protocol (proposed for Connor):** `Problem.format` gains `"story"` and `Problem.story?: {text, choices}`; `prompt` is `""` until the setup is right. Client `setup {problem_id, text}`; server `setup_result {problem_id, result}`; after `correct`, the server sends the `problem` again with the equation as its prompt and the solving instruction. The same problem sent again with a new `story` is a new skin.
- **Reducer:** `SessionState.setup {problem_id, pending, rejected}` while a story waits for its equation; `setup_sent` holds one equation at a time; `setup_result` marks a turned-down one; a story `problem` with an empty prompt or while lines exist only re-skins; one with a prompt and no lines starts `steps`. Hook: `setup(problem_id, text)` echoes the pick in the chat and sends it.
- **UI:** `StoryCard.tsx` (new): the count, the story as the one bold element (the ladder's problem-row wash with a rule, 1.2rem, roomy lines, under 60 characters wide), the question, three equation buttons rendered with KaTeX (a turned-down one keeps the ladder's warm mark and "?", the one out is dimmed), one status line, the hint button. `StepSolver` takes `story` and keeps it above the ladder, quiet (1rem, soft ink). App renders the StoryCard while `setup` is set, then the StepSolver. Chat holds while a setup is out. frontend-design dials: VARIANCE 3, MOTION 2 (no new motion), DENSITY 3.
- **Mock:** the demo lesson is now `s1`, the story (`st1`), `s2`, `p1`–`p3` (`defaultLesson(seed)` in `mock.ts`; template and numbers from the seed). On a story: `setup` events and equations typed into the chat are graded; a right one re-sends the problem with its equation, says `STORY_SOLVE` and the lines take over; a wrong one is a miss with the slip's story question or `STORY_SETUP_OTHER`, three misses suggest a pause (R-21); hints before the setup are the template's story hints, after it the solving hints start over; answers and lines before the setup are ignored; **Switch interest** re-sends the story in the new skin. Back on a story after a detour, its equation stays chosen. Primer view reasons `story_setup_right` / `story_setup_wrong`.
- Script lines `STORY_INTRO`, `STORY_INSTRUCTION`, `STORY_SOLVE`, `STORY_SETUP_OTHER`, `STORY_SETUP_UNREADABLE` (R-06 test covers them and the templates' hints). Coverage grid regenerated: two-step's apply cell filled, 16 of 96 cells, 29 items. README (demo path item 13, problem numbers shifted by the story, contract paragraph, structure) and `docs/proposals/item-descriptor.md` updated.

## Acceptance tests
- `web/src/mock/stories.test.ts` (the prompt's acceptance test): every template × interest × level 1–2 × 50 seeds: the numbers give the template's equation, the checker verifies it and the step solver finishes on the answer, the answer is a whole count ≥ 2, never a lesson or probe equation, three distinct choices with exactly one right, every text 2–3 sentences with every slot filled and no `=`, the answer in no number of the story, and Flesch–Kincaid ≤ 7 for the story, the hints and the slip questions (an in-test syllable counter, no dependency). Plus seeding and level sizes, grading by equivalence (swapped sides, `a*x`, a step in, never `x = answer`), `storyProblem`, and the skin changing nothing but the words.
- `web/src/transport/mock.test.ts` "story problems (R-37)" (9 tests): the lesson order and the story's wire (no prompt, the words in the student's interest), a wrong setup's story question and no `=` said, the same slip written another way, unreadable text, the plain question for an unknown wrong setup, a right setup however written → the equation → lines → `s2`, a typed equation in the chat, story hints then solving hints, the interest switch before and after the setup, the pause after three wrong setups, and 25 seeds whose story never shares an equation with a probe or lesson problem.
- `web/src/session/state.test.ts` "story problems (R-37)" (6 tests), `web/src/components/StoryCard.test.ts` (3), `catalog.test.ts` (story ids are mock items), `coverage.test.ts`, `script.test.ts` (story hints under R-06).

## The demo arc changed (Michael should know)
After the fresh problem confirms the fix, **the story problem comes next as the "apply" step**, then `3x - 4 = 11`. Problem numbering in the demo is now 1 `2x + 5 = 17`, 2 the story, 3 `3x - 4 = 11`, 4 `3x + 5 = 20`, 5 `2(x - 3) = 10`, 6 `x² = 49`; the README's demo path says so. The approved arc test (`harness(STEP_LESSON)`) is unchanged and green; the arc's probes, teach and repair are as before.

## Decisions and why
- **Multiple choice plus a typed equation**, as the prompt allowed for the demo: three equations, one right. Typing an equivalent equation into the chat is graded too, so a student who writes `28 = 3x + 7` isn't told to tap.
- **The equation never leaves the server early.** The prompt is empty during the setup and the right equation is one of three on the card; which one is right is never on the wire until the server says `correct`. The alternative (`setup_result` carrying the equation) was dropped: re-sending the `problem` is what the real server would do and keeps one path for the card.
- **Equivalence, not string**: `gradeSetup` uses the same linear-form check as the step grader (`hasSolution`), so `3x = 21` counts as a setup. The solution alone (`x = 4`) doesn't, or the story would be skippable.
- **Every template fits every interest.** Two drafts leaned on gaming ("every level") or a van; they were reworded so soccer, football, gaming and plain all read naturally. The esports team "wins points a game" too.
- **Reading level is measured on the filled text at the worst numbers** (three-digit totals add syllables), which pushed three sentences shorter ("go up or down" instead of "bigger or smaller").
- **The story sits between `s1` and `s2`, in the default lesson only**: tests that pass `STEP_LESSON` see the lesson they always did, and `s2` stays the last step problem for the R-30 end-of-session beat.
- **A detour keeps the setup**: back on the story after a probe or a teach, the equation stays chosen (`present(back)`), so nobody re-answers a question they got right.
- **No new solver, no new motion**: the StoryCard is a setup stage; solving is the StepSolver with the story kept in view, as the prompt said.

## Contract changes
- Proposed: `Problem.format "story"`, `Problem.story`, `setup`, `setup_result` (README "Session contract"). `primer.json` reasons `story_setup_right`, `story_setup_wrong`.

## For Connor
- The story generator and grader belong on the server (`platy.mathcheck` for the equivalence check); `stories.json` is the shared data file, like `slips.json`. The server has to send the `problem` again after a correct setup, with the prompt filled.
- Whether the real app offers three taps, a typed equation, or both (the mock takes both).

## Known gaps and leads (Michael's call)
- `linear_equation_word_problems` (the top node) stays listed with no item: it needs variables on both sides (prompt J), as the prompt said.
- All five descriptors are `draft` until you review the text. The R-06 cap applies to the hints; the story text itself (up to ~30 words, 3 sentences) sits outside it by design.
- The pre/post test has no story question; R-26's forms are fixed.
- `/ship`'s reviewers and the teen tester weren't run (the skills don't load in this cloud session). Child-facing text changed: five stories, their hints and questions, five script lines, two prompts.
- `CLAUDE.md` still has nothing on `npm --prefix web run coverage` (from F); yours.

## Next steps
1. Michael: review and merge the branch into PR #4 (the merge of main from the A note still needs your commit).
2. Prompt I of `claude-code-prompts-2.md`: the simulated-student bench on the mock.
