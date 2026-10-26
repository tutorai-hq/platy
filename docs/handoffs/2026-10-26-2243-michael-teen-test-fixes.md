# Teen-test fixes T1 to T8 and a re-run, one commit each, on a review branch

- **Who:** michael   **Area:** frontend
- **Branch / PR:** `claude/project-thread-4y9cnb`, fourteen commits on top of PR #4's branch (`claude/content-library-design-txzs0z` at b7da54a): T1 to T8, then five from a second tester run; no PR of its own, Michael merges it into PR #4 after review
- **R-ids:** R-01, R-17, R-27, R-03, R-18, R-06, R-13, R-26, R-36 (all existing)   **gate:** green (`scripts/check` ran on every commit); `web/` tsc + vitest 280/280

## What changed
Each commit closes one finding of the 2026-10-26 full `/teen-test` run (prompts T1 to T8 in Michael's round-2 prompts file).
- **T1, R-01 (4077c79):** a probe says why before it starts, is labelled "Quick check" instead of "Warm-up", every verdict stays on screen until the student taps on, and the way back to the problem is marked. `web/src/transport/mock.test.ts`, `web/src/components/ProblemCard.test.ts`.
- **T2, R-17 (2cf6a26):** a solve shows a tick and the answer, then **Next problem**, in place of the two-card pause. `mock.test.ts` "next problem". Its 1.5 s auto-advance went in the re-run (1a382c8, below): the button now waits for the tap.
- **T3, R-27 (e8148c7, 4c3dd7a):** Platy's latest line sits above the phone keypad (`web/src/session/tutorLine.ts`), action rows are pinned at the card's bottom on both devices (`dock-bottom`), and the Demo button lives in the header.
- **T4, R-03 (8c7643f):** the student's own chat bubble shows, a self-explanation gets a reply, and a puzzle waits for **Keep going** instead of moving on by itself.
- **T5, R-18 (a1a66bc):** the answer box takes focus on a laptop only (`autoFocus="laptop"`), selects its text after a reject, has a clear (×) button, and Check waits until the whole entry parses (`web/src/components/answer.ts`, `MathInput.test.ts`).
- **T6, R-06 (7df03ad):** every fixed line is at most two sentences and 25 words with no idioms, enforced by `web/src/mock/script.test.ts` over the script, puzzles and map words. The false lines on `x² = 49`, the "You didn't" after a miss and the off-topic reply are fixed, and the closing waits for **See my map**.
- **T7, R-13 (5b1eeef):** the map's legend lists every look on screen, "+17% today" reads as "Up 17 points today", "Review soon" became "Practice again soon", and a phone gets today's skills as a list plus **See the whole map** (`web/src/components/map.test.ts`).
- **T8, R-26 (552ce1c):** the test intro gives the count and time, Start, each answer box and Done take focus in turn, and the answer box keeps its place between questions (`web/src/mock/pretest.test.ts`).
- **Re-run:** see "Re-run of the testers" below.

## Decisions and why
- **A review branch, not PR #4** (Michael, on a card, 2026-10-26): one commit per finding, so each can be reviewed and merged into PR #4 on its own. Nothing touched PR #4 or main.
- **The test-session entries moved behind the Demo button** (the testers took "Running a test session?" for part of the lesson). The test-user kit's flow should now say: Demo → **Start the pre-test** on the welcome screen, Demo → **Start the post-test** on the end screen.
- **Browser checks used throwaway Playwright tooling outside the repo** (a cloud session can't load the teen-tester's Playwright MCP). No Playwright script or dependency was committed.

## Contract changes
Proposed for Connor, written up in `web/src/protocol.ts` and `web/README.md`:
- `problem.kind: "practice" | "probe" | "warmup"` and `problem.answer_example` (the answer's form, never the answer) on `problem`.
- Server `next_up {label}` and client `continue` for the moment between problems and before the map.
- `session_end.first_try`: how many problems were right first time, for the map's encouragement line.

## Open questions for Connor
- Should `first_try` come from the server (the mock counts solves with no miss and no partial), or should the client count it?
- Priya's finding that problems don't get harder when she's right is policy (R-41 levels from mastery), not the mock. Noted, not built.

## Next steps
1. Michael: review the fourteen commits and merge the branch into PR #4 (`git merge claude/project-thread-4y9cnb` on `claude/content-library-design-txzs0z`, or cherry-pick).
2. Then prompt A of the round-2 prompts (reconcile PR #4 with main, including the R-39 number collision), and the Codex review and iPhone keypad test still open from the earlier notes.
3. Update the test-user kit's session flow for the Demo-menu entry points.

## Re-run of the testers
The same four personas ran the full app again on 552ce1c. Report, screenshots and each tester's full write-up: `/mnt/project-files/teen-tester/2026-10-26-rerun.md` and beside it (project Library, not the repo). "Would come back" went from 3, 4, 5, 4 to 5, 4, 4, 6 (maya, jayden, priya, marcus): Maya and Marcus got further and scored higher, Priya dropped one because the problems still never get harder (policy, R-41). T1, T3, T4, T5, T7 and T8 landed as meant. The fixes also made five new problems, each fixed in its own commit:
- **R-17 (1a382c8):** the 1.5 s auto-advance on **Next problem** and **See my map** hit all four ("where'd the button go?", "I was still reading the check"). Nothing moves on by itself now; the button is focused, so Enter continues on a laptop. `MockTiming.wait` is set only by the demo timing; tests leave it unset and move on at once. `mock.test.ts` "the moment between problems".
- **R-06 (0a1ddd0):** a problem solved after a quick check or worked example counted as a first try ("Every problem right on the first try" after a detour). The mock now remembers that it came back to the problem. `mock.test.ts` "counts a problem solved after a detour as fixed".
- **R-27 (9e1d99b):** the pinned action row hid the keypad's last row at 1366x768, the worked example's third "why" choice and verdict lines; the phone's only Check was an arrow key; the chat under a puzzle card showed two lines. New content scrolls into view above the row (`web/src/components/intoView.ts` plus `scroll-padding-bottom` on `.problem`), the submit key says **Check**, and a phone card keeps to about half the screen.
- **R-06 (5b19c96):** six lines Marcus, a second-language reader, stumbled on ("underneath it", "a level further down", "take it over", "on its own", "what counts") are short literal sentences now, and `script.test.ts` bans the phrases. The moved-number slip hint says what to check.
- **R-36 (04d92b1):** the age screen says "Platy uses this to check your age, and doesn't save your birthday." in place of the line about "it".

Not built, ranked under "Fix first" in the report (candidates for prompts T9 onward): a retry of one's own line before any detour and a one-tap "put x back in" check on the spot-the-error puzzle (Maya quit there); **Practice again** replays the same five problems; the map's canned mastery ("Mastered" after one problem) and its reset after a second round; a bare "5" rejected on step problems but accepted on answer problems; "Not yet. Platy asked you about it in the chat." without the why; no R-30 confidence check or reflection; the laptop keypad taking half the card; the unexplained "Harbor Puffins", "Ade" and "Colors" on the worked example; the font's slashed zero; the test card running to the bottom edge at 768 px.

## Gotchas
- `script.test.ts` bans a list of idioms and caps every fixed line at two sentences and 25 words, so a new line in `script.ts`, `puzzles.ts` or `map.json` must stay plain and short, or the test names it.
- On a phone the answer box never takes focus on its own (R-18), so a browser script must tap it first; on a laptop it does, which keeps the keypad closed.
- Not pinned: the balance scale's row of extras (its move buttons come first). A three-line map node name ("Equations with a fraction coefficient") would collide with a tag if that node were ever due.
- `MockTiming.wait` (demo only) makes `next_up` wait for a `continue`; a test harness without it moves on at once. A test that sets `wait: true` must send `continue` after every solve and once before the map, or it hangs on the button.
- Anything that appears under the pinned row must scroll itself into view: `MathInput` takes `intoView`, other elements call `useIntoView`. The hook tolerates jsdom and server renders, which have no `scrollIntoView`.
