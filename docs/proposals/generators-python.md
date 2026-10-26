# Proposal: problem generators on the server (R-41)

*For Connor. Written 2026-10-23 alongside the web mock; nothing here is built yet.*

## What exists now
`web/src/mock/generate.ts` generates problems for the five demo nodes (`integer_arithmetic`, `inverse_operations`, `one_step_equations`, `two_step_equations`, `order_of_operations`). Each node has three levels:
- **Level 1:** small positive whole numbers.
- **Level 2:** negatives or numbers past 12.
- **Level 3:** a fraction or decimal in the answer, or an extra step.

Each problem has `{node, level, prompt, answer, answer_text, slips}`. `slips` lists the wrong answers that known slips from `slips.json` (R-40) lead to. The generators are seeded, a session never repeats a problem, and every problem passes a checker before it is returned. The checker in the web mock is a stand-in. On the server, it should be `platy.mathcheck`.

The acceptance test is `web/src/mock/generate.test.ts`. It covers 200 problems per node and level, plus the session, determinism and slip checks. It is the spec to port.

## Where the Python version could live
- **`src/platy/content/generators/`**, one module per node, each a pure function `generate(level, rng) -> Draft`. It sits beside `skills/` and makes no I/O, so it fits the Boundaries list in CLAUDE.md.
- Verification stays in `platy.mathcheck`, the one module that imports sympy:
  - Equations use `solution_set_is`.
  - Expressions use `expressions_equal`.
  - Undo questions ("x - 4 + b = x") need one new helper, `is_identity(equation)`.
- The slip rules and their `values` (where each slip leads) belong next to `mathcheck`. In the mock they're in `web/src/mock/slips.ts`, with the `rule` text in `slips.json` as the spec. A slip check is a value comparison plus a shape check on the student's line, so it's cheap to run in sympy.
- Problem text and answers are math, not child-facing prose, so they don't need `prompts/`. The slip hints are child-facing text, and moving them to `prompts/` is an open question in the R-40 handoff.

## What policy needs from them
- **Input:** `(node, level, seed)`, plus the session's set of prompts already shown, so it never repeats. The seed comes from the session, so a replay (or the simulated-student bench) gets the same problems.
- **Output:** the problem (prompt, answer, answer text), its level, and the slip values. Policy can then tell the tutor, before the student answers, which wrong answers point to which slip.
- **Level choice is policy's, not the generator's.** For example: start at level 1, step up after two clean solves, and step down after a slip. This feeds the ~70-85% success target in the primer review.
- **Failure:** if no new problem is left at that level, the generator raises, and policy picks another level or node. It never repeats a problem silently. Most pools hold hundreds of problems. The smallest is level 1 undo questions, with 23 ("x - n + b = x" and "(x/n)*b = x" for n up to 12), so a long session can reach it.

## Privacy
Generated problems hold no child data. The seed and the "already shown" set live in the session's memory only and are dropped at the session's end, like the rest of session state (P-1).

## Open for Connor
1. Does `src/platy/content/` fit your layout, or should generators sit under `skills/`?
2. Should the slip `values` be shared logic (one rule list for detection and generation, as in the mock)?
3. What range of seeds do the eval and bench runs use?
