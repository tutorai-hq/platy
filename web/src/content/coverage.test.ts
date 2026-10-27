import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import skillMap from "../../../src/platy/skills/data/skill_map.json";
import { DEMO_NODES } from "../mock/generate";
import { CATALOG, ROLES } from "./catalog";
import { coverage, coverageMarkdown, defaultInputs, GENERATED_LINE, isEmpty, renderCoverage } from "./coverage";

// R-37: the coverage grid is computed from catalog.json and skill_map.json, never kept by hand,
// and docs/content/coverage.md is what the generator produces.

describe("content coverage grid (R-37)", () => {
  const grid = coverage(defaultInputs());
  const cell = (node: string, role: string) => grid.rows.find((r) => r.node === node)!.cells.find((c) => c.role === role)!;

  it("has every skill-map node once, in map order, with every role", () => {
    expect(grid.rows.map((r) => r.node)).toEqual(skillMap.nodes.map((n) => n.id));
    for (const row of grid.rows) expect(row.cells.map((c) => c.role)).toEqual([...ROLES]);
  });

  it("fills each cell from the catalog alone, and counts a demo node's generator as practice", () => {
    expect(cell("two_step_equations", "repair").items).toEqual(["lin2-balance", "lin2-missing-step", "lin2-undo-sign-spot-error", "repair-two-step-coefficient"]);
    expect(cell("two_step_equations", "teach").items).toEqual(["lin2-worked-example", "teach-two-step-balance"]);
    expect(cell("inverse_operations", "teach").items).toEqual(["teach-inverse-balance", "teach-inverse-undo-chain"]);
    expect(cell("inverse_operations", "practice")).toMatchObject({ items: [], generator: [1, 2, 3] });
    expect(cell("reciprocals", "practice")).toMatchObject({ items: [], generator: null });
    expect(isEmpty(cell("reciprocals", "practice"))).toBe(true);
    expect(isEmpty(cell("inverse_operations", "practice"))).toBe(false);
    for (const row of grid.rows) {
      for (const c of row.cells) {
        for (const id of c.items) expect([CATALOG.find((i) => i.id === id)!.skills.primary, CATALOG.find((i) => i.id === id)!.role]).toEqual([row.node, c.role]);
      }
    }
    // Every item is in exactly one cell.
    const placed = grid.rows.flatMap((r) => r.cells.flatMap((c) => c.items));
    expect([...placed].sort()).toEqual(CATALOG.map((d) => d.id).sort());
    expect(grid.filled).toBe(grid.rows.flatMap((r) => r.cells).filter((c) => !isEmpty(c)).length);
    // A new descriptor lands in its cell: nothing here is kept by hand.
    const extra = { ...CATALOG[0]!, id: "reciprocals-hook-reel", skills: { primary: "reciprocals", touches: [] }, role: "hook" as const };
    const more = coverage({ ...defaultInputs(), items: [...CATALOG, extra] });
    expect(more.rows.find((r) => r.node === "reciprocals")!.cells.find((c) => c.role === "hook")!.items).toEqual(["reciprocals-hook-reel"]);
    expect(more.filled).toBe(grid.filled + 1);
  });

  it("lists the demo path's gaps first, in map order, then slips with no repair, then skills with one angle", () => {
    expect(grid.demoGaps.map((g) => g.node)).toEqual(skillMap.nodes.map((n) => n.id).filter((id) => (DEMO_NODES as readonly string[]).includes(id)));
    for (const g of grid.demoGaps) expect(g.roles).toEqual(ROLES.filter((r) => isEmpty(cell(g.node, r))));
    // The story problems fill two-step equations' apply cell (R-37).
    expect(grid.demoGaps.find((g) => g.node === "two_step_equations")!.roles).toEqual(["review", "hook"]);
    expect(cell("two_step_equations", "apply").items).toEqual(["story-given-away", "story-packing-bags", "story-points-a-game", "story-saving-up", "story-season-penalty"]);
    expect(grid.slipsWithoutRepair).toEqual([]);
    // R-05: every demo skill has two angles now; a catalog with one would be listed here.
    expect(grid.oneAngle).toEqual([]);
    const only = coverage({ ...defaultInputs(), items: CATALOG.filter((d) => d.skills.primary !== "inverse_operations" || d.angle === "undo") });
    expect(only.oneAngle.map((n) => [n.node, n.angle])).toEqual([["inverse_operations", "undo"]]);
    const broken = coverage({ ...defaultInputs(), slips: [{ id: "s", node: "reciprocals", repair: "repair-not-built" }] });
    expect(broken.slipsWithoutRepair).toEqual([{ id: "s", node: "reciprocals", repair: "repair-not-built" }]);
    const listed = coverage({ ...defaultInputs(), toBuild: new Set(["repair-order-brackets"]) });
    expect(listed.slipsWithoutRepair.map((s) => s.id)).toEqual(["brackets_ignored"]);
  });

  it("renders every node in order, an empty cell as a dash, and a crowded cell as a count with a footnote", () => {
    const md = renderCoverage(grid, CATALOG.length);
    const rows = md.split("\n").filter((l) => l.startsWith("| **"));
    expect(rows.map((l) => /`([a-z_]+)`/.exec(l)![1])).toEqual(skillMap.nodes.map((n) => n.id));
    expect(rows.find((l) => l.includes("`reciprocals`"))).toMatch(/\| (— \| ){5}— \|$/);
    expect(rows.find((l) => l.includes("`inverse_operations`"))).toContain("| generator L1–L3 | repair-inverse-divide, repair-inverse-undo |");
    // Footnotes are numbered in map order; one-step's four repairs come before two-step's.
    const twoStep = rows.find((l) => l.includes("`two_step_equations`"))!;
    const n = /4 items\[\^(\d+)\]/.exec(twoStep)![1];
    expect(n).toBe("2");
    expect(md).toContain(`[^${n}]: lin2-balance, lin2-missing-step, lin2-undo-sign-spot-error, repair-two-step-coefficient`);
    expect(md).toContain(`${CATALOG.length} items; ${grid.filled} of ${skillMap.nodes.length * ROLES.length} cells filled.`);
    expect(md).toContain("## Slips with no repair\n\nNone.");
    expect(md.split("\n")[2]).toBe(GENERATED_LINE);
  });

  it("is what docs/content/coverage.md holds", () => {
    const path = join(import.meta.dirname, "../../../docs/content/coverage.md");
    const generated = coverageMarkdown();
    expect(generated).toContain(GENERATED_LINE);
    expect(readFileSync(path, "utf8"), "run npm --prefix web run coverage").toBe(generated);
  });
});
