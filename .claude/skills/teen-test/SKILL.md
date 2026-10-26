---
name: teen-test
description: Simulated teen testers use the web/ app in a real browser (phone and Chromebook) and report frictions, confusion and fixes, ranked. Run by hand before demos and pilots, or as `/teen-test --quick <feature>` from /ship on any web/ change. Read-only on code; writes one report under var/teen-tests/.
---

# /teen-test

Made-up teens (13 to 16, Algebra 1, some struggling, some bored) use the app the way they would, and tell you what felt bad. It's the `/demo-check` + `ui-ux-tester` slot from `02-harness-proposal.md` §3.2b, rebuilt around teen personas. Device coverage traces to R-27 (phone + 1366x768 Chromebook). It reports; it never edits code and never gates a commit.

**Arguments:** `[--quick] [<feature, in a few words>]`
- **Full** (no `--quick`): all four personas in `personas.md`, each on their own device, on the whole app. Use before a demo, a pilot session or a YC checkpoint.
- **`--quick <feature>`**: two runs focused on one feature: `maya` on phone and `priya` on laptop (struggling + ahead, both devices). This is what `/ship` runs when `web/` changed.

## 0. Preconditions
- `web/` runs on the scripted mock only (P-13: tooling never touches real child data). If `VITE_PLATY_SERVER_URL` is set in the environment or in any `web/.env*` file, stop and say so.
- Browser: the `teen-tester` agent starts Playwright MCP (`@playwright/mcp`, pinned in its frontmatter) headless with an in-memory profile. It uses installed Google Chrome by default; with no Chrome, export `PLAYWRIGHT_MCP_EXECUTABLE_PATH=<path to a chromium binary>` before starting Claude Code.
- **Cloud sessions** (claude.ai/code) skip agent-frontmatter MCP servers: start Claude Code with `--mcp-config` defining `teen-phone` and `teen-laptop` with the frontmatter's args (plus `--executable-path`, and `--no-sandbox` as root).

## 1. Start the app
```bash
test -d web/node_modules || npm --prefix web ci
curl -sf http://localhost:5173 >/dev/null || (npm --prefix web run dev -- --port 5173 --strictPort > /dev/null 2>&1 &)
```
Run the second line with `run_in_background` if your shell blocks, then wait until `curl -sf http://localhost:5173` succeeds (up to ~30 s). Remember whether you started it, so you can stop it in step 5.

## 2. Brief the testers
Read `.claude/skills/teen-test/personas.md` and, for a focused run, the parts of `web/README.md` ("The demo path") and the changed `web/src` files that tell you **how a teen reaches the feature**. Then write each tester's brief:
- the persona block, copied whole
- `device: phone` or `device: laptop`
- **mission**, in the teen's terms, never in ours: "Your teacher said do today's practice on Platy. Get through it." A teen doesn't know the demo path, so never hand them answers, slips or menu items to try; the persona says what they get wrong.
- **focus** (quick mode): the feature in one line, plus where it lives. If the only way to reach it is the dashed **Demo** button, say which menu item, and say it's a developer shortcut.

## 3. Run them
Spawn one `teen-tester` agent per brief, **all in one message** so they run in parallel and independently. Each one has its own isolated browser, so they never share state.

## 4. Merge into one report
Write `var/teen-tests/YYYY-MM-DD-HHMM-<slug>.md` (UTC; `var/` is gitignored). It's synthetic (fake personas, mock tutor), so it may quote the testers' typing.
```markdown
# Teen test: <feature or "full app"> (<full|quick>)
- **When:** <UTC>   **Commit:** <git rev-parse --short HEAD> (+ "dirty" if uncommitted changes)
- **Runs:** <persona/device: outcome, would-come-back n/10>, ...

## Fix first
<Merge duplicate findings across personas. Rank by severity (S1 > S2 > S3), then by how many personas hit it, then phone over laptop. Each line: severity, tags, problem, who hit it, evidence file(s), the fix. At most 10.>

## Worked
<What more than one persona liked, or the single strongest reaction.>

## By persona
<Each tester's output, unchanged.>
```
Screenshots stay where Playwright saved them (`var/teen-tests/.browser/<device>/`); link them by path.

## 5. Report back and clean up
- Stop the dev server if you started it.
- Tell the user, in at most ~10 lines: the outcome line per persona, the top 3 "fix first" items and the report path. Don't fix anything; fixes go through the normal loop (one R-id, failing test first, `/ship`).
- From `/ship`: return the one-line summary `/ship` asks for (step 3).

## Limits
- The testers' prose is an LLM's judgment, not a teen's. Treat findings as leads for a real-teen session (the test-user kit), not as proof.
- The mock tutor's replies are canned, so `[mock script]` findings are about the script, not the future tutor.
- **Kill criterion** (from §3.2b): if two full runs in a row find nothing you didn't already know from using the app yourself, run full mode less often.
- Model: `teen-tester` runs on Sonnet (§3.2b, Q9). To try another model, change its `model:` line; the skill doesn't care which model plays the teen.
