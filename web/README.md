# Platy web (child tutor UI)

The browser side of Platy. Right now it runs a demo of the child tutoring session against a
scripted mock tutor, so it needs no backend.

Stack: React 19 + Vite + TypeScript, KaTeX for math, Atkinson Hyperlegible (bundled, not
fetched from a font host). Plain CSS, no UI kit.

## Run it

You need Node 20 or newer to run the app, and Node 22.12 or newer for `npm test` (vitest 5).

```bash
cd web
npm install
npm run dev
```

Then open http://localhost:5173 and press **Start practice**.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Unit tests (math parser, answer checking, mock tutor, session state, privacy guardrails) |
| `npm run typecheck` | TypeScript, strict |
| `npm run check` | Both of the above |
| `npm run build` | Production build into `web/dist/` |

## The demo path

First, the age question (R-36): pick any birth date more than 13 years ago (a month exactly 13
years ago counts as not yet, since there's no day). A later date shows the "Thanks for stopping
by" screen, which holds until you reload the page.

1. **Problems 1 and 2, `2x + 5 = 17` and `3x - 4 = 11`, line by line (R-39).** Write one step
   under the equation and press Enter (or the keypad's **↵**). A good line gets a check, and the
   algebra moves: a term that crosses the equals sign flies over and flips its sign
   (`2x = 12`), a divisor goes across as `÷ 2` (`x = 6`), a move written out on both sides drops in
   (`3x - 4 + 4 = 11 + 4`), and worked-out terms fade together (`3x = 15`). A wrong line
   (`2x = 22`) stays on screen, marked, with your text left in the box to fix. The first wrong
   line starts the primer's probing (item 10); after that, Platy asks what you did to each side
   instead of giving the line (R-02, R-03). When the wrong line is a known
   slip (R-40, `src/content/slips.json`), a short hint names the mistake under it: `2x = 22`
   says the number was moved without being undone. On line 2, `x = 10` (from `2x = 12`) is caught
   as a one-step slip, the skill one level down. Skipping ahead (`x = 6` straight
   away) is fine; a line that isn't an equation gets a nudge.
   With reduced motion on, lines just fade in.
2. **Problem 3, `3x + 5 = 20`** (answer box). Try `15` first: Platy names the slip ("$3x = 15$ is right, one
   more step"). Any other wrong answer gets "what did you do first?" instead of the answer
   (R-02, R-03). Type a reply in the chat and Platy nudges. `x = 5` solves it.
3. **The reset.** After a correct answer the chat clears with a "fresh page" moment (R-17).
4. **Problem 4, `2(x - 3) = 10`.** `6.5` shows the "the 2 multiplies the −3 too" catch. `8` solves it.
5. **Problem 5, `x² = 49`.** Use the **x²** key. `7` alone is "part of the way there"; `±7`,
   `7, -7` or `x = 7 or x = -7` solves it.
6. **Three misses on one problem** (or three wrong lines) brings up the pause screen, then an easier warm-up, then
   back to the problem (R-21).
7. **The math keypad (R-18)** sits under every math box. On a phone (try it at 390×844 with touch)
   it docks at the bottom like a keyboard while the box has focus, and the phone's own keyboard
   stays down. **abc** brings that keyboard back for letters and words, and **↵** checks the
   answer. On a laptop the keypad stays under the box; its keys are out of the Tab order because
   a keyboard types everything directly.

8. **Puzzles (R-37).** On problem 3, answer `25/3` (adding the 5 instead of subtracting it).
   Platy sends you to a spot-the-error puzzle about the same slip, then back to problem 3.
   Tap the wrong line, rewrite it, then finish it; Platy asks before it corrects (R-03), gives
   no hint before a first try (R-02), and asks a reflection question at the end (R-30).

9. **Worked examples (R-37).** Open **Demo → Worked example**. Platy shows a solved two-step
   equation a step at a time, each line with the move that made it, then asks why the first step
   works (R-03). **Keep going** brings a new problem with the last step left for you, then one
   where you write both. In the real app the primer would pick how many steps to leave from the
   student's mastery; the mock just goes through all three in order, then back to the lesson.

10. **The demo arc and "what Platy is thinking" (R-01, R-42).** Open **Demo → Show what Platy is
   thinking**: a dark panel beside the chat shows mastery per skill on the path, the primer's
   hypothesis, and a reason for each move, newest first (laptops only). Then on `2x + 5 = 17`:
   write `2x = 99`, and Platy probes one level down (`x - 8 = -3`, answer `-11`), then one more
   (`x - 4 + b = x`, answer `-4`). That's the gap: a worked example teaches it, three fades
   (**Demo → Skip** moves through them). Back on `2x + 5 = 17`, write `2x = 22`: a repair puzzle
   on that one move, then a fresh generated problem confirms the fix. A right answer on a probe
   ends the probing early and goes back to the problem.

11. **"Your map" (R-13).** **End session** (or the end of the lesson) shows the whole skill map,
   drawn from `skill_map.json`. Today's skills fill in one by one, foundations first, then the next
   skill gets its moment: "Unlocked today" when today's work opened it (solve `2x + 5 = 17`
   cleanly, then end the session: multi-step equations unlocks), or "Next to unlock" when it's one
   step away. Skills due for review are marked, and one line of encouragement about effort comes
   from `src/content/map.json`. Long prerequisite lines run along the gaps between rows, so no line
   passes under a box. On a phone the map scrolls sideways, starting at today's work but far enough
   along to show the next skill. Nothing is saved; the next session starts without it.
12. **Pre-test and post-test (R-26).** On the welcome screen or an end screen, under "Running a test session?",
   **Start the pre-test** or **Start the post-test**. Each is 10 questions, two per demo skill at
   level 2, one at a time, with no hints and no feedback, then a score in total and per skill.
   The post form asks the same kind of question as the pre form in each slot, with new numbers of
   the same size, and never repeats one. Both forms are fixed (`src/mock/pretest.ts`), so every
   student sits the same two tests. Nothing is kept: the adult running the session writes the
   score down. Only shown on the scripted mock for now.

The dashed **Demo** button (mock only) jumps to any screen on cue: skip a problem, each of the
three puzzles (spot the error, missing step, balance scale), the worked example, the pause screen, the
safety-resources panel (R-22) and the dropped-connection screen (P-3). **Switch interest**
re-skins the puzzle on screen (soccer, football, gaming, plain) without changing its numbers,
and **Colors** on a puzzle picks your own team colors (R-38).

Things to say in chat: "just tell me the answer" (Platy won't), "I'm stuck" (gets a hint).

## How it's put together

```
src/
  protocol.ts            the session event contract (proposal, see below)
  transport/
    mock.ts              in-browser stand-in for Platy's server, replays mock/script.ts
    websocket.ts         the real transport: POST /sessions, then a WebSocket
    index.ts             picks mock unless VITE_PLATY_SERVER_URL is set
  mock/                  scripted lesson, answer, step and slip checking, and puzzle items, skins,
                         problem generators and grading (all go away with the real backend)
  content/               puzzle types, balance-scale moves, team-color palette, slip map
  math/                  child-math parser, LaTeX output, KaTeX rendering, keypad keys, and the
                         terms of each line for the step solver's motion
  session/               reducer + hook holding all session state in memory
  components/            ProblemCard, StepSolver, PuzzlePlayer (+ puzzles/), MathInput, Chat,
                         Overlays, Mascot
```

### Pointing it at a real server

```bash
VITE_PLATY_SERVER_URL=http://localhost:8000 npm run dev
```

Nothing else changes: the UI only sees `ServerEvent`s from `protocol.ts`.

## Session contract (proposal for the backend)

`POST /sessions {mode}` returns `{session_id}`, then a WebSocket at `/sessions/{id}/live`
carries JSON events.

Server to client: `tutor_message {message_id, delta, done}` (streamed), `problem {problem_id,
skill_id, prompt (LaTeX), instruction, position, total}`, `answer_result {problem_id, result}`,
`reset {reason}`, `pause_suggested`, `topic_switch {label}`, `safety_escalation {resources}`,
`error {code}`, `session_end {solved}`.

Client to server: `child_message {text}`, `answer {problem_id, text}`, `hint_requested
{problem_id}`, `resume`, `end_session`.

Puzzles (R-37, R-38) add `puzzle {puzzle}`, `puzzle_result {instance_id, check, outcome}` and
`puzzle_done {instance_id}` from the server, and `puzzle_move {instance_id, move}`,
`puzzle_hint {instance_id}`, `puzzle_next {instance_id}` and `slot_pick {colors}` from the
client. `docs/content-library.md` §6.5 explains them, including why the chat waits between one
problem or puzzle and the next.

Step-by-step solving (R-39, proposed for Connor to accept) adds `format: "answer" | "steps"` to
`problem`, `step {problem_id, line, text}` from the client (`line` counts from 1, one line at a
time) and `step_result {problem_id, line, result, slip?}` from the server, where `result` is
`valid`, `solved`, `invalid` or `unreadable`, and `slip` is the slip-map id an `invalid` line
matches (R-40). The browser looks up that slip's hint in `src/content/slips.json`, the same
file the server can load; the server looks for slips in the problem's skill first, then its
prerequisites. The server holds the accepted lines in that
session's memory only: they're dropped at the problem's end and on any reset, and never logged or
put in error text (P-1, P-10, A-4). It checks each new line against the last with
`platy.mathcheck`. On a
`steps` problem the server ignores a bare `answer`, so the final answer alone never counts. The
motion is drawn in the browser from the two lines (`src/math/terms.ts`) and never grades.

Generated problems (R-41): `src/mock/generate.ts` makes problems for the five demo skills at three
levels (1 small positive whole numbers, 2 negatives or bigger numbers, 3 a fraction or decimal
answer or an extra step). They're seeded, never repeat within a session, are checked before
they're returned, and carry the wrong answers their slips lead to. The scripted lesson doesn't
use them only for repair puzzles and the fresh problem after one. The real generators belong on the
server (`docs/proposals/generators-python.md`).

The primer view (R-42, proposed for Connor to accept) adds `primer_state {mastery, hypothesis,
move}` from the server, sent after each of the primer's moves to a demo session only. It carries
codes and numbers only: `mastery` is `[{skill_id, p}]` on the current path, `hypothesis` is
`{code, skill_id}` or null, and `move` is `{code, reason, skill_id}`. The browser turns each code
into words from `src/content/primer.json` and shows nothing for a code it doesn't know, so no free
text from the server and nothing the student wrote reaches the panel. In the mock,
`src/mock/primer.ts` stands in for the primer with a small BKT update; the real numbers come from
Connor's policy and pyBKT mastery (A-5).

Detours that wait for a tap (R-01, proposed after the 2026-10-26 teen test) add `kind:
"practice" | "probe" | "warmup"` to `problem`, `next_up {label}` from the server and `continue` from
the client. Before a detour (a quick check one or two levels down, a repair puzzle, the worked
example that teaches a gap, or the way back to the problem), the server says why in the chat and
sends `next_up`. The browser keeps the screen as it is, including a marked line and a quick check's
verdict, and shows one button with that label in place of the answer box's buttons. The server
ignores answers and lines until `continue`; the chat stays open. Teen testers read the old
straight swap as "I failed and it's hiding it".

"Your map" (R-13, proposed) adds `map: [{skill_id, before, after, due}]` to `session_end`: each
skill's mastery when the session started and when it ended, and whether the primer wants it
reviewed soon. Numbers and skill ids only. The browser works out each skill's state from that
report and the map's edges alone (`src/content/map.ts`): due for review whenever the primer says
so (even when mastered), mastered at 0.8 or more, unlocked when every prerequisite is mastered,
and next to unlock when its prerequisites are mastered or went up today, at least one of them
today. A drop never makes a skill "next". Connor's policy would set the threshold and the "due" call from its forgetting model.

`answer_result`, `instruction`/`position`/`total` on `problem`, and `resume` are additions to the
plan's first draft; they let the problem card give feedback and show progress. Answers are sent
as the child typed them (`x^2 = 49`, `±7`, and `×` and `÷` from the keypad); the server does the
grading.

## Privacy rules this code follows

- Child content lives in React state only and is gone on a reset, at session end or on refresh.
  No browser storage, cookies, URL params or console logging (P-1, P-10).
- No analytics, error tracking or remote fonts/scripts. The only network calls are to
  Platy's own server (P-2, P-11).
- Errors fail closed to a calm screen with a code, with no retry or fallback (P-3).

`src/privacy.test.ts` checks the mechanical parts of this on every `npm test`.

## Not done yet

Players for the other content formats (videos, songs, stories, the whiteboard), voice and
photo input, onboarding mode (which also fills the personality file in V1), the age gate's
mid-session half (R-36: ending the session when a student turns out to be under 13 needs a server
event) and a landing page. There's no parent side in V1 beyond the safety parent notice on the
demo panel (R-22): V1 is for students 13 and up, and parent features come in V2/V3 (`REQUIREMENTS.md` § Audience).
