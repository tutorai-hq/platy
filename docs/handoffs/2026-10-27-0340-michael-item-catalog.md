# Item descriptor, catalog and checker (R-37)

- **Who:** michael   **Area:** frontend
- **Branch / PR:** `claude/project-thread-4y9cnb` (the review branch on top of PR #4's branch), one commit plus this note; Michael merges into PR #4 after review
- **R-ids:** R-37 (approved), with R-01 (no probe reuse) and R-40 (slip ids)   **gate:** green (`scripts/check`); `web/` tsc + vitest 352/352 (8 new)

## What changed
- **`web/src/content/catalog.json` (new):** one descriptor per item the mock runs, 15 today (the three lesson puzzles, the worked example, eleven repairs), with the fields prompt E listed: `schema_version, id, version, status, format, template, role, skills {primary, touches[]}, slips[], angle, difficulty {min, max}, interest_tags[], reading_level`. Plain JSON, `schema_version` on the file and on each descriptor, so Connor's pydantic model (`extra="forbid"`, frozen) can load the same file, or each descriptor as its own file, unchanged.
- **`web/src/content/catalog.ts` (new):** typed loader plus a hand-written validator (no dependency). It runs when the module loads and throws on any problem, so a bad descriptor fails the build and the tests. Checks: unknown or missing fields, kebab-case unique ids, every vocabulary (status, format, template, role, angle, interest tags), template fits format, `skills.primary` is a node and every touch is in its prerequisite chain (A-6), every slip is in `slips.json`, a repair names at least one slip, the catalog and the slip map agree both ways on which item repairs which slip, difficulty within the generators' levels, reading level a whole grade. Exports `CATALOG`, `descriptorFor`, `skillOf`, `templateOf`, `PROBE_EQUATIONS`, `validateCatalog`, `prerequisiteChains`.
- **The mock reads metadata from the catalog.** `Item` in `puzzles.ts` is text only now; `skill_id` and `template` are gone from the 15 item literals. `toWire` takes the skill from `skillOf`, and `transport/mock.ts` takes a repair's player from `templateOf` and its skill from `skillOf`.
- **No item on a probe's equation (R-01).** `newPuzzle` and `newItemPuzzle` re-draw while `showsProbe(live)` is true, checked against every skill-map probe parsed once (`equationKey` in `generate.ts`, `expressionKey` in `working.ts`). Writing the test first found a real case: **the balance scale drew the two-step probe `3x + 4 = 19` at seed 30** (a 3-in-300 chance per draw; the missing-step and worked-example generators can draw it too). A student who'd just been probed with that equation would have met it again on the scale.
- **Acceptance test `web/src/content/catalog.test.ts`:** every descriptor passes; every skill is a node and every touch a prerequisite; slips exist and the two files agree; vocabularies; `extra="forbid"` behaviour (unknown field, missing field, bad id, duplicate id, bad file header); exactly one descriptor per mock item and vice versa (the three fades of the worked example are one item); the mock gets skill and player from the catalog; no probe equation from any item over every level and 50 seeds, and 300 seeds per lesson puzzle. Each failure the prompt names is also proved by tampering with a descriptor and reading the validator's message.
- **`docs/proposals/item-descriptor.md` (new, one page):** the fields and meanings for Connor, what fails, what's left out until a media item exists, the three places the file could live (§11 q3), the R-43 note, five open questions.
- `web/README.md`: a paragraph on the catalog and the probe guard; the structure list names it.

## Decisions and why
- **`status`: live only for the three puzzles on main;** the worked example and every repair are `draft` until you've reviewed PR #4 and this branch. §5 ties `live` to a human review, and that's the honest state. The mock doesn't gate on status (selection is R-44, Connor's); flipping them is a one-word edit each when you merge.
- **`role` is single-valued,** as in §5. The three lesson puzzles are `repair` (the slip map points at them); the Demo menu's free play isn't a role. Flagged for Connor.
- **`slips` on the item and `repair` on the slip both stay,** validated to agree both ways, because the prompt keeps `slips.json` as the source of repair ids and §5 wants the item to name what it repairs. Which one the server treats as the truth is Connor's question.
- **`interest_tags` are the three skins** (`soccer`, `football`, `gaming`); `neutral` is no tag. All items are templates skinned at runtime (R-38), so every list is empty, meaning "any interest". A rendered reel for soccer fans would carry `["soccer"]`.
- **`difficulty` says what each generator really does:** the signs repair uses level-3 numbers at every level (`{3, 3}`), the brackets repair starts at 2, the one-step balance scales stay at level 1, and the lesson puzzles' own generators have one size.
- **`reading_level` is 6 everywhere**, an estimate matching §5's example, not a measurement. Open question 5 in the proposal.
- **The probe check is a test over generated instances, not a descriptor rule,** because no item today has a fixed equation. When one does (a story, a rendered reel), its math block joins the descriptor and the check moves into the validator; the proposal says so.
- **Where items live on the server is not decided here** (§11 q3). The proposal lists the options and leaves it to Connor, as the prompt asked.

## Contract changes
- None on the wire. `puzzle.skill_id` now comes from the catalog instead of the item literal; same values.

## For Connor (via Michael)
- The five questions at the end of `docs/proposals/item-descriptor.md`: one role per item or a list; catalog `slips` or `slips.json` `repair` as the source of truth; where the interest-tag vocabulary lives; whether R-06's length cap applies to item text; whether to measure reading level.
- Where the catalog lives on the server (§11 q3): packaged data under `[pedagogy]`, one file per item, or stay in `web/` for now.
- R-43 (proposed, not approved) would turn "checks verify" into a Python test on this catalog with `platy.mathcheck`; today it's the mock's own grading in `content.test.ts`.

## Known gaps and leads (Michael's call)
- `/ship`'s reviewers and `/teen-test --quick` weren't run (the skills don't load in this cloud session). Nothing child-facing changed except that the balance scale, missing-step and worked-example puzzles can no longer show `3x + 4 = 19`.
- The catalog validator's messages are English for the test output, not child-facing; they never reach the screen.

## Next steps
1. Michael: review and merge the branch into PR #4 (the merge of main from the earlier note still needs your commit), flip `status` to `live` on what you've reviewed, and pass the Connor questions on.
2. Prompt F of `claude-code-prompts-2.md`: the node × role coverage grid, which reads this catalog.
