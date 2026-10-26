# "Your map" end-of-session screen (R-13)

- **Who:** michael   **Area:** frontend
- **Branch / PR:** on top of R-42 (960b8e3) on PR #4's branch (`claude/content-library-design-txzs0z`)
- **R-ids:** R-13 (existing; no new R-id)   **gate:** green (`scripts/check`); `web/` tsc + vitest 221/221

## What changed
- **Protocol (proposed for Connor):** `session_end` gains `map: [{skill_id, before, after, due}]`.
  - `before` and `after` are each skill's mastery at the start and end of the session.
  - `due` is the primer's call that the skill needs review soon.
  - It carries skill ids, numbers and a flag only.
- **The layout comes from `skill_map.json` itself** (`web/src/content/map.ts`), never a hand-made copy (A-6).
  - Each skill sits in the column of its longest prerequisite chain.
  - Rows line up across columns, so a long prerequisite line runs along a gap between rows and never passes under a box.
- **Each skill's state comes only from the report** (`mapStates`), checked in this order:
  1. due (the primer's flag, shown even on a mastered skill);
  2. mastered (0.8 or more);
  3. unlocked today (every prerequisite mastered now, not at the start);
  4. next to unlock (still locked, with every prerequisite mastered or up today, at least one up today, and not itself practiced);
  5. learning (practiced today);
  6. open;
  7. locked.
  - A one-point change counts as practiced. A drop never makes a skill "next".
- **`YourMap`** (`web/src/components/YourMap.tsx`, "Your map" in `styles.css`):
  - Today's gains fill in one by one, foundations first.
  - Then a skill marked "Unlocked today" or "Next to unlock" fades in.
  - A skill that went down says "Practiced", not a minus number.
  - Reduced motion shows the end state.
  - The SVG has a hidden text list for screen readers.
  - On a phone the map scrolls sideways, starting at today's work but far enough along to show the next skill.
- **One line of encouragement about effort** comes from a fixed table (`web/src/content/map.json`), counting the skills practiced.
- **App:** a session that ends with a map shows "Your map". Without a map, it falls back to the old "Nice session!" screen. The map lives in memory and is dropped at the next start.
- **Mock:** `MockPrimer` has made-up starting beliefs for all 16 skills. `report()` marks a skill due when it's on the demo path, wasn't practiced and is under 0.8.
- **Acceptance tests:**
  - `web/src/components/map.test.ts`: rendered nodes and edges match `skill_map.json` exactly, states come from the report alone, no edge crosses a box, one-point changes count, drops don't make "next", the due flag shows on mastered skills, encouragement, and the reducer keeps or drops the map.
  - `web/src/transport/mock.test.ts`: the session ends with every skill's mastery.
- Screenshots are in `/mnt/project-files/your-map/`, at 1366x768 and 390x844.

## Decisions and why
- **The state rules live in the browser for now,** because the server doesn't exist yet. Connor's policy would own the 0.8 threshold and the due call (from forgetting).
- **Drops show "Practiced".** A lower number at the end is the primer changing its mind, and the screen is about effort.
- **"Due" outranks "mastered".** A forgetting model flags exactly the mastered skills that are fading.

## /ship review
- **Scope:** 14 keep.
  - Applied: `mock/primer.ts` imports `MASTERED` instead of repeating it.
  - Applied: the legend keeps only "Practiced today" and "Mastered", because the nodes say "Review soon" and "Next to unlock" themselves.
- **Scope, dismissed:**
  - Dropping the clamp: the report will come from a server, so bad numbers are still possible.
  - Splitting the diff: it's one prompt and one R-id.
- **Privacy:** 0 findings (ids and numbers only, memory only, nothing logged or stored).
- **Code review:** four fixes, each with a failing test first.
  - Long edges passed under boxes and looked like links that don't exist.
  - A prerequisite that went down could make a skill "Next to unlock".
  - Floating point dropped some one-point changes (0.40 to 0.41).
  - "Mastered" hid the due flag.
- **Code review, minor fix:** the phone scroll now keeps the next skill's moment on screen.

## Contract changes
- Proposed `map` on `session_end` (see `web/README.md`).

## Open questions for Connor
- Should the policy send `map` on every `session_end`? Is 0.8 its mastered threshold?
- Should `due` come from pyBKT plus a forgetting rule?

## Next steps
1. Michael: run `/codex:adversarial-review --wait Check against PRIVACY.md. Find any path where conversation content, audio, photos or PII escapes the gateway.` on prompts 1 to 6.
2. Prompt 7 (pre/post test, R-26).
