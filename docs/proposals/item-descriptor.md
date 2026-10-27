# Proposal: the item descriptor and catalog (R-37)

*For Connor. Written 2026-10-27 with the web mock's catalog; nothing on the Python side is built.*

## What exists now
`web/src/content/catalog.json` holds one descriptor per content item the mock runs: 15 today, the three lesson puzzles, the worked example and eleven repair items. `web/src/content/catalog.ts` validates the file by hand when it loads (no new dependency), and `catalog.test.ts` is the acceptance test. The mock reads an item's skill and player from the catalog; the item's text stays in `puzzles.ts` and moves to `prompts/` with the server. The file is plain JSON, trimmed from `docs/content-library.md` §5 to what exists, so a pydantic model (`extra="forbid"`, frozen, `schema_version`) can load it unchanged.

## The fields
| Field | Meaning | Today |
|---|---|---|
| `schema_version` | 1, on the file and on each descriptor, so a descriptor can become its own file later without changing | 1 |
| `id` | kebab-case, unique in the catalog | `repair-order-brackets` |
| `version` | whole number from 1; bump when the item's text or generator changes | 1 |
| `status` | `draft` or `live`. Live means the math check passed and a human reviewed it | the three puzzles on main are live, the rest draft until reviewed |
| `format` | `puzzle`, `worked_example`, `story`, `reel` | puzzle, worked_example |
| `template` | the player: `spot_the_error`, `missing_step`, `balance`, `worked_example`; null for a format without one | |
| `role` | `teach`, `practice`, `repair`, `review`, `apply`, `hook` | teach (worked example), repair (the rest) |
| `skills` | `{primary, touches[]}`, skill-map node ids; every touch is in the primary's prerequisite chain (A-6) | |
| `slips` | slip ids (R-40) the item repairs; a repair names at least one, and the list agrees with `slips.json`'s `repair` both ways | |
| `angle` | `balance`, `undo`, `worked`, `story`, `visual`, `contrast` (a wrong solution to find the slip in); an R-05 retry takes one not tried yet | |
| `difficulty` | `{min, max}` generator levels, 1 to 3 (R-41) | |
| `interest_tags` | from `soccer`, `football`, `gaming`; empty means any interest, through the item's skins (R-38) | all empty |
| `reading_level` | a school grade, whole; an estimate until measured | 6 |

**What fails validation:** an unknown or missing field; an id that isn't kebab-case, or repeated; a skill that isn't a node, or a touch that isn't a prerequisite of the primary; a slip not in `slips.json`; a repair with no slip; a `slips.json` repair with no descriptor, or one that doesn't list the slip pointing at it; any value outside its vocabulary; a template that doesn't fit the format; difficulty or reading level out of range. The probe rule ("no item reuses a skill-map probe's equation", R-01) is a test over generated instances rather than a descriptor check, because today's items are templates with no fixed equation: every item over every level and 50 seeds, every lesson puzzle over 300. It found one: the balance scale drew the two-step probe `3x + 4 = 19` at seed 30. The generators now re-draw past any probe (`showsProbe` in `puzzles.ts`). The story templates (`stories.json`, prompt H) draw their numbers too, so they take the same test (`stories.test.ts`: every template, interest, level and seed). When an item with a fixed equation arrives (a rendered reel, a recorded story), its math block joins the descriptor and that check moves into the validator.

**Left out until a media item exists** (all in §5): `media`, `duration_s`, `interaction`, `evidence`, `sensitive_tags`, `base_item`, `tutor_notes`, `provenance`, `license`, and the template fields `generator`, `slots` and `skins` (the mock's items are the templates, with slots in code). §5's `misconceptions` is `slips` here, since the slip map is the misconception list.

## Where the file could live (§11, question 3; your call)
1. `src/platy/content/items/catalog.json` as packaged data, read with `importlib.resources`, under the `[pedagogy]` trigger so the eval runs when it changes. A `Catalog` pydantic model beside `SkillMap`, validated the same way.
2. One JSON file per item in that folder, as §5 first described. The per-descriptor `schema_version` is for this; the validator's rules don't change.
3. Stay in `web/` until the server has a content module, and let the mock be the only reader.

Either way the rule stands: the primer reads descriptors only, never an item's text or media, and nothing in a descriptor is about a student.

## R-43 (proposed, not approved)
Today "checks verify" means the mock's own grading solves every repair item over every level and 50 seeds (`content.test.ts`, "repair items"). With R-43, that becomes a Python test on the same catalog with `platy.mathcheck` deciding each check, and `status: live` requires it to pass.

## Open for Connor
1. One `role` per item: the three lesson puzzles are repairs on the demo arc and free play from the Demo menu. Is a single role right, or does an item carry a list?
2. Slips: the catalog's `slips` and `slips.json`'s `repair` both exist and are validated to agree. Which is the source of truth on the server?
3. `interest_tags`: the three skins now, §5's thirty-odd tags later. Does the vocabulary live in the catalog file or next to the personality-file mapping?
4. Does the R-06 length cap apply to fixed item text, like a 300-word story?
5. `reading_level` is a guess per item. Is a measured readability score worth adding, and which?
