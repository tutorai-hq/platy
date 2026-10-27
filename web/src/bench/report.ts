import skillMap from "../../../src/platy/skills/data/skill_map.json";
import { skillName } from "../content/primer";
import { runStudent, type StudentResult } from "./run";
import { STUDENTS } from "./student";

// The bench report (R-01): per student, the gap planted against the gap found; per node, how
// many students were right first time and how many were right on the fresh problem after a
// repair. It measures the mock primer's logic, not learning; the learning number is R-26.

export interface NodeCounts {
  node: string;
  /** Students who met a lesson problem on the node. */
  met: number;
  first_try_right: number;
  /** Students who got a fresh problem on the node after a repair. */
  fresh_met: number;
  fresh_right: number;
}

export async function runBench(fixtures = STUDENTS, seed?: number): Promise<StudentResult[]> {
  const out: StudentResult[] = [];
  for (const f of fixtures) out.push(await runStudent(f, seed));
  return out;
}

/** Per-node counts over every student, in skill-map order, for nodes any student met. */
export function nodeCounts(results: readonly StudentResult[]): NodeCounts[] {
  const out: NodeCounts[] = [];
  for (const n of skillMap.nodes) {
    const c: NodeCounts = { node: n.id, met: 0, first_try_right: 0, fresh_met: 0, fresh_right: 0 };
    for (const r of results) {
      const o = r.nodes[n.id];
      if (!o) continue;
      if (o.first_try !== null) {
        c.met++;
        if (o.first_try) c.first_try_right++;
      }
      if (o.fresh !== null) {
        c.fresh_met++;
        if (o.fresh) c.fresh_right++;
      }
    }
    if (c.met > 0 || c.fresh_met > 0) out.push(c);
  }
  return out;
}

const list = (xs: readonly string[]) => (xs.length > 0 ? xs.join(", ") : "none");

export function renderReport(results: readonly StudentResult[], counts = nodeCounts(results)): string {
  const lines: string[] = ["Simulated-student bench (R-01): the mock primer, two lesson problems, rule-based students.", ""];
  let agree = 0;
  for (const r of results) {
    const ok = r.found === r.expected.found;
    if (ok) agree++;
    const planted = r.planted.length > 0 ? r.planted.join(" + ") : "no gap";
    lines.push(`${r.id}: planted ${planted}${r.slips.length > 0 ? ` (slip ${r.slips.join(", ")})` : ""}; found ${r.found ?? "none"}${ok ? "" : ` (expected ${r.expected.found ?? "none"})`}`);
    const fresh = Object.entries(r.nodes).filter(([, o]) => o.fresh !== null).map(([n, o]) => `${skillName(n) ?? n} ${o.fresh ? "right" : "wrong"}`);
    lines.push(`  probes ${r.probes}; items ${list(r.items)}; repairs ${r.repairs}; fresh problem ${list(fresh)}`);
    lines.push(`  ${r.finished ? `ended after ${r.turns} turns, ${r.solved} solved` : `stopped by the cap after ${r.turns} turns`}${r.expected.note ? `. ${r.expected.note}` : ""}`);
  }
  lines.push("", `Gap found as expected: ${agree} of ${results.length}.`, "", "Per node: right first time / students who met it; right on the fresh problem / students who got one.");
  for (const c of counts) lines.push(`  ${skillName(c.node) ?? c.node}: before ${c.first_try_right}/${c.met}, after ${c.fresh_right}/${c.fresh_met}`);
  return lines.join("\n") + "\n";
}

/** The report for `npm --prefix web run bench`. */
export async function benchText(): Promise<string> {
  const results = await runBench();
  return renderReport(results);
}
