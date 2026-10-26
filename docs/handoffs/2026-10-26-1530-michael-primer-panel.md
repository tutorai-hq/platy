# "What Platy is thinking" panel and the demo arc (R-42, R-01)

- **Who:** michael   **Area:** frontend
- **Branch / PR:** on top of R-37 repairs (490a1c5) on PR #4's branch (`claude/content-library-design-txzs0z`)
- **R-ids:** R-42 (new, approved by Michael 2026-10-26), with R-01 probing in the mock   **gate:** green (`scripts/check`); `web/` tsc + vitest 210/210

## What changed
- **R-42 added to `REQUIREMENTS.md`** with the approved wording. The R-36 note now says R-31 to R-35 are unused.
- **Protocol (proposed for Connor):** `primer_state {mastery, hypothesis, move}` from the server, after each of the primer's moves, to a demo session only.
  - `mastery` is `[{skill_id, p}]` on the current path.
  - `hypothesis` is `{code, skill_id}` or null.
  - `move` is `{code, reason, skill_id}`.
  - It carries codes, skill ids and numbers only.
- **Words come from a fixed table.** `web/src/content/primer.json` maps each move, reason and hypothesis code to text, and `primer.ts` fills `{skill}` from `skill_map.json`. An unknown code or skill shows nothing, so neither free text from a server nor anything the student wrote can reach the panel.
- **`PrimerPanel`** (`web/src/components/PrimerPanel.tsx`, `.primer` in `styles.css`): a dark column beside the chat with:
  - the hypothesis;
  - mastery bars per skill, which ease to new values (700 ms);
  - the probed skill, which pulses once;
  - the last three moves with their reasons, newest first.
  It shows on screens wider than 1100px and is hidden on phones. Reduced motion turns off the easing and the pulse.
- **The demo flag:** **Demo → Show what Platy is thinking**. It's off by default and exists only with the mock transport.
- **Session state** keeps the primer view through resets, since it holds no chat, and drops it at the session's end, on an error or at a new start.
- **The demo arc in the mock** (`web/src/transport/mock.ts`, `mock/primer.ts`, `mock/script.ts`):
  - The first wrong line on a two-step step problem starts probing (R-01), using the skill map's own first probe for each node.
    - It probes `one_step_equations` first, then `inverse_operations` if that's missed too.
    - The deepest miss is the gap. If the deeper probe passes, the level above it is the gap.
    - If the first probe passes, the prerequisites are solid and it goes straight back to the problem.
  - The gap is taught with the worked example (three fades), then the problem that showed it comes back.
  - A later slip goes to its repair puzzle and then a fresh problem (R-37, R-41), as in prompt 4. A solved fresh problem sets "the fix is holding".
  - `MockPrimer` stands in for the primer with a small BKT update. Its starting beliefs and parameters are made up so the arc reads clearly.
- **Skill ids:** p1, p2 and the warm-up now use skill-map ids instead of the old `alg1.*` ids, so the panel can name them. p3 (`x² = 49`) has no node in the map, so the panel names no skill for it.
- **Acceptance tests:**
  - `web/src/session/state.test.ts` "primer view (R-42)".
  - `web/src/components/PrimerPanel.test.ts`: the panel never renders chat, lines or answers; unknown codes show nothing; every code has words.
  - `web/src/transport/mock.test.ts` "primer view (R-42)": the full arc, the deeper-probe pass, skip and pause during a probe, and canaries never reaching `primer_state`.
  - Playwright screenshots at 1366x768, plus a phone check that the panel is hidden.
- The older step tests now get past the first probe with a `probed()` helper, since the first wrong line probes.

## Decisions and why
- **Probe on the first wrong line, before any repair.** R-01 says to diagnose the missing prerequisite before teaching. Repairs still fire on later slips.
- **The panel is off until the demo menu turns it on,** and only the mock has that menu. A real session never shows it.
- **The move list keeps the last three moves.** "A one-line reason for each move" reads better as a short history than one line, and three fit at 768px tall.

## /ship review
- **Scope:** 12 keep. Cut and applied:
  - a "no hints on a probe" reply, a rule nobody asked for (a probe has no hints, so the usual "that's all my hints" line answers);
  - an unreachable `inverse_operations` probe level.
- **Scope, dismissed:**
  - Showing only the latest reason: the history makes the arc readable.
  - The `about` key in `primer.json`: it matches `slips.json`.
  - Splitting the diff: it's one prompt and one R-id.
- **Privacy:** 0 findings.
- **Code review:** two fixes, with failing tests first:
  - Skip during a probe skipped past the problem that started it.
  - Skip or pause during a probe left a stale "suspects a gap" hypothesis.
- **Code review, dismissed:**
  - The answer box's own "Not yet" or "That's right!" shows on a probe. It's the standard answer card.
  - The client's solved count goes up on a correct probe until the session's end. It's only shown at the end, and the server's count is used there.
  - Chat replies on a probe use the usual hint and no-answer lines.
  - Worked-example evidence counts for two-step, the item's skill. The gap gets a teaching bump instead.

## Contract changes
- New proposed server event `primer_state` (see `web/README.md`). Connor's policy would emit it, with pyBKT mastery (A-5), only to a demo session.

## Open questions for Connor
- Should `primer_state` be in the real protocol behind a demo flag set at session start, and who may turn that flag on?
- Should the code list in `primer.json` be the policy's move and reason vocabulary, or a mapping from his own codes?

## Follow-ups (not built)
- A probe card says "Warm-up", because position 0 means warm-up. A "Quick check" label needs a `kind` on `problem`.
- Probe answers show the answer card's usual verdict. A probe-specific card could hide it.

## Next steps
1. Michael: run `/codex:adversarial-review --wait Check against PRIVACY.md. Find any path where conversation content, audio, photos or PII escapes the gateway.` on prompts 1 to 5.
2. Prompt 6 ("Your map", R-13).
