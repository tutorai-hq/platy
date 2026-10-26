# Added /teen-test: simulated teens use web/ in a real browser and report frictions; /ship runs a quick pass on web/ changes

- **Who:** michael   **Area:** harness
- **Branch / PR:** claude/project-thread-fxqstl / uncommitted (Michael commits from a patch)
- **R-ids:** R-27 (devices); harness slot `02-harness-proposal.md` §3.2b   **gate:** green (`scripts/check`); no `[privacy]`, `[mastery_math]`, `[pedagogy]` or `[gate]` paths touched

## What changed
- **`.claude/agents/teen-tester.md`:** plays one teen persona, drives the app with Playwright MCP (`@playwright/mcp@0.0.83`, headless, in-memory profile, only `http://localhost:5173` allowed) as an iPhone 13 (390x844) or a 1366x768 Chromebook, then reports S1/S2/S3 findings with screenshot evidence, a would-come-back score and a think-aloud log. Read-only, Sonnet; code-running browser tools are disallowed.
- **`.claude/skills/teen-test/`:** `SKILL.md` starts the dev server, briefs testers, runs them in parallel and merges one ranked report into `var/teen-tests/` (gitignored). `personas.md` has four made-up teens: maya (struggling, phone), jayden (bored, phone), priya (ahead, laptop), marcus (repeating, laptop).
- **`.claude/skills/ship/SKILL.md`:** "UI changed → consider /demo-check" became: when `web/` changed, run `/teen-test --quick <feature>` (maya/phone + priya/laptop) and add a `teen-test:` line to the summary. It reports; it never blocks a commit.

## Decisions and why
- Built the planned `/demo-check` `ui-ux-tester` (§3.2b) instead of a new tool, with teen personas instead of "a 14-year-old and a parent" (V1 has no parents, A-9 note). The accessibility tester from §3.2b isn't built yet.
- §3.2b said "never per commit"; Michael asked for every new feature to be tested, so `/ship` runs the two-run quick mode on `web/` changes only. Full mode (four personas) stays a by-hand run before demos and pilots.
- Browser MCP servers live in the agent's frontmatter, so no `.claude/settings.json` or `.mcp.json` change was needed and the main session never carries browser tools (§3.2b).

## Contract changes
- New dev tool fetched by `npx` at run time: `@playwright/mcp@0.0.83` (pinned; listed in §3.5 as an approved dev dependency). It needs Google Chrome installed, or `PLAYWRIGHT_MCP_EXECUTABLE_PATH`.

## Open questions for Connor
- "jev models": Michael asked what you meant. The tester is model-agnostic (one `model:` line), so it can switch once that's clear.

## Next steps
1. Michael: run `/teen-test` once on the Mac (needs Chrome) to see a full run; it costs roughly $1–3 per run on Sonnet.
2. The first dry run (puzzle player) found real issues, e.g. the end screen says "You solved 0 problems" after a solved puzzle, and the phone chat shows about 1.5 lines during a puzzle. They're leads for the "Demo build prompts" work, not fixed here.

## Gotchas
- Cloud sessions (claude.ai/code) skip MCP servers defined in agent frontmatter. Use `--mcp-config` with servers named `teen-phone` and `teen-laptop` there (SKILL.md step 0); as root, Chromium also needs `--no-sandbox`.
- Passing a `filename` to Playwright's screenshot tool writes into the repo root; the agent is told not to.
