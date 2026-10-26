import { describe, expect, it } from "vitest";
import skillMap from "../../../src/platy/skills/data/skill_map.json";
import { detectSlip } from "../mock/slips";
import { itemFor } from "../mock/puzzles";
import { REPAIRS_TO_BUILD, SLIPS, slipHint } from "./slips";

// The demo path's skills (prompt 2's scope).
const DEMO_NODES = ["integer_arithmetic", "inverse_operations", "one_step_equations", "two_step_equations", "order_of_operations"];

const nodeIds = new Set(skillMap.nodes.map((n) => n.id));

// R-40: every slip is detected on its own examples, leaves a correct step alone, and points
// at a repair item.
describe("slip map (R-40)", () => {
  it("covers the five demo skills with three to five slips each, on real skill-map nodes", () => {
    for (const node of DEMO_NODES) {
      expect(nodeIds.has(node)).toBe(true);
      const n = SLIPS.filter((s) => s.node === node).length;
      expect(n, node).toBeGreaterThanOrEqual(3);
      expect(n, node).toBeLessThanOrEqual(5);
    }
    for (const s of SLIPS) expect(nodeIds.has(s.node), s.id).toBe(true);
  });

  it("gives every slip its own id", () => {
    expect(new Set(SLIPS.map((s) => s.id)).size).toBe(SLIPS.length);
  });

  it("detects each slip on at least two of its own examples", () => {
    for (const s of SLIPS) {
      expect(s.examples.length, s.id).toBeGreaterThanOrEqual(2);
      for (const ex of s.examples) expect(detectSlip(s.node, ex), `${s.id}: ${ex.prev} -> ${ex.next}`).toBe(s.id);
    }
  });

  it("flags nothing on a correct step", () => {
    for (const s of SLIPS) {
      expect(s.correct.length, s.id).toBeGreaterThanOrEqual(1);
      for (const ex of s.correct) expect(detectSlip(s.node, ex), `${s.id}: ${ex.prev} -> ${ex.next}`).toBeNull();
    }
  });

  it("flags nothing on a wrong step that matches no known slip", () => {
    expect(detectSlip("two_step_equations", { prev: "2x + 5 = 17", next: "2x = 99" })).toBeNull();
    expect(detectSlip("integer_arithmetic", { prev: "(-6)*(-4)", next: "7" })).toBeNull();
  });

  it("names a slip only when the line looks like the slip, not just when its value matches", () => {
    // Each solves to a slip's wrong value, but the student never made that move.
    expect(detectSlip("two_step_equations", { prev: "3x - 4 = 11", next: "x - 4 = 8" })).toBeNull();
    expect(detectSlip("two_step_equations", { prev: "2x + 5 = 17", next: "2x = 20" })).toBeNull();
    expect(detectSlip("two_step_equations", { prev: "2x + 5 = 17", next: "2x + 5 = 25" })).toBeNull();
    expect(detectSlip("two_step_equations", { prev: "2x + 5 = 17", next: "2x = 12 + 10" })).toBeNull();
    // Taking the brackets out of a product isn't ignoring them.
    expect(detectSlip("order_of_operations", { prev: "(-3)(-5)", next: "-8" })).toBeNull();
    expect(detectSlip("order_of_operations", { prev: "2(3 + 4)", next: "27" })).toBeNull();
  });

  it("names no slip when two slips on the same skill fit the line equally", () => {
    // 2x = -2: multiplying gives -4, and so does subtracting the 2.
    expect(detectSlip("one_step_equations", { prev: "2x = -2", next: "x = -4" })).toBeNull();
  });

  it("finds a slip from a prerequisite skill on a later line, the gap two levels down", () => {
    // Line 2 of 2x + 5 = 17: dividing went wrong, which is a one-step slip, not a two-step one.
    expect(detectSlip("two_step_equations", { prev: "2x = 12", next: "x = 10" })).toBe("coefficient_subtracted");
  });

  it("keeps hints short, and never gives a number or a line to copy (R-02)", () => {
    for (const s of SLIPS) {
      expect(s.hint.length, s.id).toBeLessThanOrEqual(140);
      expect(s.hint, s.id).not.toMatch(/[0-9=]/);
      // Saying part of the answer is right hands that part over.
      expect(s.hint, s.id).not.toMatch(/looks right|size|is right/i);
      expect(slipHint(s.id)).toBe(s.hint);
    }
    expect(slipHint("no_such_slip")).toBeNull();
  });

  it("points every slip at a repair item that exists or is listed to build", () => {
    for (const s of SLIPS) expect(itemFor(s.repair) !== null || REPAIRS_TO_BUILD.has(s.repair), s.id).toBe(true);
    // The to-build list holds nothing that already exists, and nothing no slip needs.
    const used = new Set(SLIPS.map((s) => s.repair));
    for (const id of REPAIRS_TO_BUILD) {
      expect(itemFor(id), id).toBeNull();
      expect(used.has(id), id).toBe(true);
    }
  });
});
