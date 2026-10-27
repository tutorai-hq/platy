import { describe, expect, it } from "vitest";
import skillMap from "../../../src/platy/skills/data/skill_map.json";
import { CATALOG } from "../content/catalog";
import { SLIPS } from "../content/slips";
import { PROBE_BELOW } from "../mock/primer";
import { detectSlip } from "../mock/slips";
import type { Problem } from "../protocol";
import { nodeCounts, renderReport, runBench } from "./report";
import { TURN_CAP } from "./run";
import { rightLines, SimStudent, solve, STUDENTS } from "./student";

// R-01 acceptance: for each fixture student, the gap the mock primer names equals the planted
// gap (or the fixture says why not); a student with no gap is never probed past one level; after
// the repair, the fresh problem on the node is right; and the report's per-node counts add up.
// This measures the mock primer's logic, not learning (that's R-26 with real teens).

const NODES = new Set(skillMap.nodes.map((n) => n.id));
/** The nodes the demo's probing can reach from a two-step miss: one or two levels down (R-01). */
const REACHABLE = new Set([PROBE_BELOW.two_step_equations!, PROBE_BELOW[PROBE_BELOW.two_step_equations!]!]);
const results = runBench();
// Eight students through the mock, two of them to the turn cap: a few seconds in all, paid once.
const BENCH_MS = 30_000;
const byId = async (id: string) => (await results).find((r) => r.id === id)!;
const problem = (skill_id: string, prompt: string, kind: Problem["kind"] = "practice"): Problem => ({
  problem_id: "q", skill_id, prompt, instruction: "", format: "steps", kind, position: 1, total: 2,
});

describe("simulated-student bench (R-01)", () => {
  it("has six to eight students in plain JSON, keyed to skill-map nodes and slip-map ids", () => {
    expect(STUDENTS.length).toBeGreaterThanOrEqual(6);
    expect(STUDENTS.length).toBeLessThanOrEqual(8);
    expect(new Set(STUDENTS.map((s) => s.id)).size).toBe(STUDENTS.length);
    const slipIds = new Set(SLIPS.map((s) => s.id));
    for (const s of STUDENTS) {
      for (const g of s.gaps) expect(NODES.has(g), `${s.id}: ${g}`).toBe(true);
      for (const slip of s.slips) expect(slipIds.has(slip), `${s.id}: ${slip}`).toBe(true);
      expect(s.answers_right_elsewhere).toBe(true);
      if (s.expected.found !== null) expect(NODES.has(s.expected.found)).toBe(true);
    }
    // The prompt's cases: no gap, inverse operations only, integer arithmetic only, the coefficient slip only, two gaps.
    expect(STUDENTS.map((s) => [s.gaps.join("+"), s.slips.join("+")])).toEqual(expect.arrayContaining([
      ["", ""], ["inverse_operations", ""], ["integer_arithmetic", ""], ["", "coefficient_subtracted"], ["one_step_equations+inverse_operations", ""],
    ]));
  });

  it("answers by rule: wrong on a gap and on what needs it until taught, the slip's line until repaired, right elsewhere", () => {
    const gap = new SimStudent({ id: "t", gaps: ["inverse_operations"], slips: [], answers_right_elsewhere: true, expected: { found: null } });
    expect(gap.hasGap("two_step_equations")).toBe(true);
    expect(gap.hasGap("one_step_equations")).toBe(true);
    expect(gap.hasGap("order_of_operations")).toBe(false);
    expect(gap.line(problem("two_step_equations", "2x + 5 = 17"), [])).toBe("x = 7");
    expect(gap.answer(problem("one_step_equations", "x - 8 = -3", "probe"))).toBe("-11");
    expect(gap.answer(problem("order_of_operations", "20 - 3*(4 + 2)", "probe"))).toBe("2");
    gap.taught("one_step_equations"); // not its gap: nothing learned
    expect(gap.hasGap("two_step_equations")).toBe(true);
    gap.taught("inverse_operations");
    expect(gap.hasGap("two_step_equations")).toBe(false);
    expect(gap.line(problem("two_step_equations", "2x + 5 = 17"), [])).toBe("2x = 12");
    expect(gap.line(problem("two_step_equations", "2x + 5 = 17"), ["2x = 12"])).toBe("x = 6");

    const slip = new SimStudent({ id: "t", gaps: [], slips: ["constant_moved_without_undoing"], answers_right_elsewhere: true, expected: { found: null } });
    expect(slip.line(problem("two_step_equations", "2x + 5 = 17"), [])).toBe("2x = 22");
    expect(slip.line(problem("two_step_equations", "3x - 4 = 11"), [])).toBe("3x = 7");
    slip.repaired("constant_moved_without_undoing");
    expect(slip.line(problem("two_step_equations", "2x + 5 = 17"), [])).toBe("2x = 12");
    // The mock's detector names the slip lines the students write (R-40).
    expect(detectSlip("two_step_equations", { prev: "2x + 5 = 17", next: "2x = 22" })).toBe("constant_moved_without_undoing");
    expect(detectSlip("two_step_equations", { prev: "2x = 12", next: "x = 10" })).toBe("coefficient_subtracted");
    expect(solve(problem("inverse_operations", "x - 4 + b = x", "probe"))).toBe(4);
    expect(solve(problem("two_step_equations", "x/3 - 2 = 4"))).toBe(18);
    expect(rightLines("x/3 - 2 = 4", 18)).toEqual(["x = 18"]);
  });

  it("names each student's planted gap when it is within the primer's reach, and otherwise what the fixture says", async () => {
    for (const r of await results) {
      expect(r.found, `${r.id}: ${r.moves.join(" ")}`).toBe(r.expected.found);
      // The acceptance rule itself: a gap one or two levels down is found as planted.
      const planted = r.planted.filter((g) => REACHABLE.has(g));
      if (planted.length === 1 && r.planted.length === 1) expect(r.found, r.id).toBe(planted[0]);
      // A found gap was taught with an item on that skill, and the student was right on the problem it came back to.
      if (r.found !== null) {
        expect(r.items.some((id) => CATALOG.find((d) => d.id === id)?.skills.primary === r.found && CATALOG.find((d) => d.id === id)?.role === "teach"), r.id).toBe(true);
        expect(r.moves).toContain(`teach:gap_found:${r.found}`);
      }
    }
    const inverse = await byId("gap-inverse-operations");
    expect(inverse.probes).toBe(2);
    expect(inverse.moves.filter((m) => m.startsWith("probe:"))).toEqual(["probe:probe_prerequisite:one_step_equations", "probe:probe_deeper:inverse_operations"]);
    expect(inverse.nodes.two_step_equations).toEqual({ first_try: false, fresh: null });
    expect(inverse.finished).toBe(true);
    const oneStep = await byId("gap-one-step-equations");
    expect(oneStep.moves.filter((m) => m.startsWith("probe:"))).toEqual(["probe:probe_prerequisite:one_step_equations", "probe:probe_deeper:inverse_operations", "probe:probe_passed:inverse_operations"]);
    expect(oneStep.finished).toBe(true);
  }, BENCH_MS);

  it("never probes a student with no gap past one level, and brings a slip's fresh problem, which the student gets right", async () => {
    for (const r of (await results).filter((r) => r.planted.length === 0)) {
      expect(r.probes, r.id).toBeLessThanOrEqual(1);
      expect(r.found, r.id).toBeNull();
      expect(r.teaches, r.id).toBe(0);
      expect(r.finished, r.id).toBe(true);
    }
    const none = await byId("no-gap");
    expect(none).toMatchObject({ probes: 0, items: [], repairs: 0, solved: 2 });
    expect(none.nodes).toEqual({ two_step_equations: { first_try: true, fresh: null } });
    for (const id of ["slip-constant-moved", "slip-coefficient", "gap-inverse-with-slip"]) {
      const r = await byId(id);
      expect(r.repairs, id).toBe(1);
      expect(r.moves, id).toContain("pose_problem:fix_check:two_step_equations");
      expect(r.nodes.two_step_equations, id).toEqual({ first_try: false, fresh: true });
      expect(r.learned.repaired, id).toEqual(r.slips);
    }
    expect((await byId("slip-constant-moved")).items).toEqual(["lin2-undo-sign-spot-error"]);
    expect((await byId("slip-coefficient")).items).toEqual(["repair-one-step-coefficient"]);
  }, BENCH_MS);

  it("says plainly where the mock's logic runs out: a deeper gap is misnamed, and a second gap is never found", async () => {
    const deep = await byId("gap-integer-arithmetic");
    expect(deep.found).toBe("inverse_operations");
    expect(deep.finished).toBe(false);
    const two = await byId("two-gaps");
    expect(two.found).toBe("inverse_operations");
    expect(two.learned.taught).toEqual(["inverse_operations"]);
    expect(two.moves.filter((m) => m.startsWith("probe:")).length).toBe(2); // never probed again
    expect(two.finished).toBe(false);
  }, BENCH_MS);

  it("adds up per node, and the report names every student and every count", async () => {
    const rs = await results;
    const counts = nodeCounts(rs);
    expect(counts.map((c) => c.node)).toEqual(["two_step_equations"]);
    for (const c of counts) {
      const met = rs.filter((r) => r.nodes[c.node]?.first_try !== null && r.nodes[c.node] !== undefined);
      expect(c.met).toBe(met.length);
      expect(c.first_try_right).toBe(met.filter((r) => r.nodes[c.node]!.first_try === true).length);
      expect(c.first_try_right + met.filter((r) => r.nodes[c.node]!.first_try === false).length).toBe(c.met);
      const fresh = rs.filter((r) => r.nodes[c.node]?.fresh != null);
      expect(c.fresh_met).toBe(fresh.length);
      expect(c.fresh_right + fresh.filter((r) => r.nodes[c.node]!.fresh === false).length).toBe(c.fresh_met);
      expect(c.met).toBeLessThanOrEqual(rs.length);
    }
    expect(counts[0]).toMatchObject({ met: rs.length, first_try_right: 1, fresh_met: 3, fresh_right: 3 });
    const text = renderReport(rs, counts);
    for (const r of rs) expect(text).toContain(`${r.id}: planted`);
    expect(text).toContain("Gap found as expected: 8 of 8.");
    expect(text).toContain("Two-step equations: before 1/8, after 3/3");
    expect(text).toContain(`stopped by the cap after ${TURN_CAP} turns`);
    // Codes and numbers only: nothing a student typed is in the report.
    expect(text).not.toMatch(/\d+x [+-] \d+ = \d+/);
  }, BENCH_MS);
});
