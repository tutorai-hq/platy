import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import skillMap from "../../../src/platy/skills/data/skill_map.json";
import { EDGES, edgeRoute, encouragement, H, LAYOUT, mapStates, NODES, W } from "../content/map";
import type { SkillReport } from "../protocol";
import { initialState, reducer } from "../session/state";
import { YourMap } from "./YourMap";

// R-13: "Your map" is generated from skill_map.json (A-6), and a skill's state comes only from
// the session's mastery report.

const render = (report: SkillReport[]) => renderToStaticMarkup(createElement(YourMap, { report }));
const attrs = (html: string, name: string) => [...html.matchAll(new RegExp(`${name}="([^"]+)"`, "g"))].map((m) => m[1]!);
const report = (after: Record<string, number>, before: Record<string, number> = {}, due: string[] = []): SkillReport[] =>
  skillMap.nodes.map((n) => ({
    skill_id: n.id,
    before: before[n.id] ?? after[n.id] ?? 0,
    after: after[n.id] ?? 0,
    due: due.includes(n.id),
  }));

// Foundations mastered, the equations path in progress: the demo student.
const BASE = {
  integer_arithmetic: 0.85, order_of_operations: 0.75, fraction_operations: 0.7, reciprocals: 0.45,
  inverse_operations: 0.65, combining_like_terms: 0.85, distributive_property: 0.85, simplifying_expressions: 0.82,
  one_step_equations: 0.6, two_step_equations: 0.4,
};

describe("Your map (R-13)", () => {
  it("draws exactly the nodes and edges in skill_map.json", () => {
    const html = render(report(BASE));
    expect(attrs(html, "data-node").sort()).toEqual(skillMap.nodes.map((n) => n.id).sort());
    const edges = skillMap.nodes.flatMap((n) => n.prerequisites.map((p) => `${p}&gt;${n.id}`));
    expect(attrs(html, "data-edge").sort()).toEqual(edges.sort());
    for (const n of skillMap.nodes) expect(html).toContain(n.name.split(" ")[0]);
  });

  it("lays every skill out after its prerequisites", () => {
    const layer = new Map(NODES.map((n) => [n.id, n.layer]));
    for (const n of NODES) for (const p of n.prerequisites) expect(layer.get(p)!).toBeLessThan(n.layer);
  });

  it("takes each skill's state from the session's mastery report alone", () => {
    // Nothing reported: only the skills with no prerequisites are open.
    const empty = mapStates([]);
    for (const n of NODES) expect(empty.get(n.id)?.state, n.id).toBe(n.prerequisites.length === 0 ? "open" : "locked");

    // The demo arc: the path moved but two-step isn't mastered yet.
    const arc = mapStates(
      report({ ...BASE, two_step_equations: 0.57, one_step_equations: 0.31, inverse_operations: 0.41 }, BASE, ["order_of_operations"]),
    );
    expect(arc.get("integer_arithmetic")?.state).toBe("mastered");
    expect(arc.get("two_step_equations")).toMatchObject({ state: "learning", moved: true, before: 0.4, after: 0.57 });
    expect(arc.get("order_of_operations")?.state).toBe("due");
    // Its other prerequisite is mastered, and two-step was practiced: one step away.
    expect(arc.get("multi_step_equations")?.state).toBe("next");
    expect(arc.get("equations_with_fractions")?.state).toBe("locked");

    // Two-step mastered today: multi-step opens.
    const clean = mapStates(report({ ...BASE, two_step_equations: 0.95 }, BASE));
    expect(clean.get("two_step_equations")?.state).toBe("mastered");
    expect(clean.get("multi_step_equations")?.state).toBe("unlocked_today");

    // The rendered states are exactly these.
    const html = render(report({ ...BASE, two_step_equations: 0.95 }, BASE));
    const shown = [...html.matchAll(/data-node="([^"]+)" data-state="([^"]+)"/g)].map((m) => [m[1], m[2]]);
    expect(shown).toEqual(NODES.map((n) => [n.id, clean.get(n.id)!.state]));
  });

  it("routes every edge around the boxes it doesn't join", () => {
    // A cubic segment, sampled; no point may fall inside a box other than the edge's own two.
    const at = (s: number[][], t: number) =>
      [0, 1].map((k) => (1 - t) ** 3 * s[0]![k]! + 3 * (1 - t) ** 2 * t * s[1]![k]! + 3 * (1 - t) * t ** 2 * s[2]![k]! + t ** 3 * s[3]![k]!);
    for (const { from, to } of EDGES) {
      for (const seg of edgeRoute(from, to)) {
        for (let i = 0; i <= 50; i++) {
          const [x, y] = at(seg, i / 50) as [number, number];
          for (const n of NODES) {
            if (n.id === from || n.id === to) continue;
            const b = LAYOUT.pos.get(n.id)!;
            const inside = x > b.x - 1 && x < b.x + W + 1 && y > b.y - 1 && y < b.y + H + 1;
            expect(inside, `${from}>${to} crosses ${n.id}`).toBe(false);
          }
        }
      }
    }
  });

  it("counts a one-point change as practiced", () => {
    for (const [b, a] of [[0.4, 0.41], [0.81, 0.82], [0.56, 0.57]] as const) {
      expect(mapStates(report({ two_step_equations: a }, { two_step_equations: b })).get("two_step_equations")?.moved).toBe(true);
    }
  });

  it("only calls a skill next to unlock when a prerequisite went up today", () => {
    // Two-step went down: multi-step isn't one step closer.
    const drop = mapStates(report({ ...BASE, two_step_equations: 0.3 }, BASE));
    expect(drop.get("multi_step_equations")?.state).toBe("locked");
  });

  it("shows the primer's review flag even on a mastered skill", () => {
    const views = mapStates(report(BASE, BASE, ["integer_arithmetic"]));
    expect(views.get("integer_arithmetic")?.state).toBe("due");
  });

  it("clamps numbers it can't use, and ignores skills that aren't in the map", () => {
    const views = mapStates([
      { skill_id: "two_step_equations", before: -3, after: Number.NaN, due: false },
      { skill_id: "not_a_skill", before: 0, after: 1, due: true },
    ]);
    expect(views.get("two_step_equations")).toMatchObject({ before: 0, after: 0, moved: false });
    expect(views.has("not_a_skill")).toBe(false);
  });

  it("has one line of encouragement about effort, from the fixed table", () => {
    expect(encouragement(mapStates(report(BASE)))).toMatch(/^Showing up is the hard part/);
    expect(encouragement(mapStates(report({ ...BASE, two_step_equations: 0.5 }, BASE)))).toMatch(/practiced a skill/);
    expect(encouragement(mapStates(report({ ...BASE, two_step_equations: 0.5, one_step_equations: 0.7 }, BASE)))).toMatch(/practiced 2 skills/);
  });

  it("keeps the map in memory for the end screen only, and drops it at the next start", () => {
    let s = reducer(initialState, { type: "started" });
    s = reducer(s, { type: "server", event: { type: "session_end", solved: 2, map: report(BASE) } });
    expect(s.map).toHaveLength(skillMap.nodes.length);
    expect(reducer(s, { type: "started" }).map).toBeNull();
    expect(reducer(s, { type: "restart" }).map).toBeNull();
  });
});
