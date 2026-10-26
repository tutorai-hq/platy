import { describe, expect, it } from "vitest";
import { type Equation, equationTerms, planStep, termLatex } from "./terms";

const eq = (text: string): Equation => {
  const e = equationTerms(text);
  if (!e) throw new Error(`not an equation: ${text}`);
  return e;
};
const plan = (a: string, b: string) => planStep(eq(a), eq(b));
const shown = (e: Equation) => ({
  left: e.left.map((t, i) => termLatex(t, i === 0)),
  right: e.right.map((t, i) => termLatex(t, i === 0)),
});

describe("equationTerms", () => {
  it("splits each side into signed terms", () => {
    expect(shown(eq("2x + 5 = 17"))).toEqual({ left: ["2x", "+ 5"], right: ["17"] });
    expect(shown(eq("-3x - 4 = 11 - 2"))).toEqual({ left: ["-3x", "- 4"], right: ["11", "- 2"] });
    expect(shown(eq("x/3 = 4"))).toEqual({ left: ["\\frac{x}{3}"], right: ["4"] });
  });

  it("gives a term that isn't linear in x no value, so it never matches an x term", () => {
    const [sq, x] = eq("x^2 + x = 12").left;
    expect(Number.isNaN(sq!.a)).toBe(true);
    expect(x).toMatchObject({ a: 1, b: 0 });
    // So x^2 = 4 to x = 4 never reads as x staying put.
    expect(plan("x^2 = 4", "x = 4").kept).toEqual([{ from: { side: "right", index: 0 }, to: { side: "right", index: 0 } }]);
  });

  it("isn't an equation for anything else", () => {
    expect(equationTerms("2x + 5")).toBeNull();
    expect(equationTerms("x < 4")).toBeNull();
  });
});

describe("planStep (R-48 motion)", () => {
  it("flies a term across the equals sign and flips its sign", () => {
    const p = plan("2x + 5 = 17", "2x = 12");
    expect(p.motion).toEqual({ kind: "move", source: { side: "left", index: 1 }, to: "right", before: "+ 5", after: "- 5" });
    expect(p.kept).toEqual([{ from: { side: "left", index: 0 }, to: { side: "left", index: 0 } }]);
  });

  it("moves a term from the right side too", () => {
    expect(plan("5 = x - 3", "8 = x").motion).toMatchObject({ kind: "move", source: { side: "right", index: 1 }, to: "left", after: "+ 3" });
  });

  it("sends a coefficient over as a division", () => {
    expect(plan("2x = 12", "x = 6").motion).toEqual({
      kind: "scale", source: { side: "left", index: 0 }, to: "right", before: "2", after: "\\div 2",
    });
    expect(plan("x/3 = 4", "x = 12").motion).toMatchObject({ kind: "scale", before: "\\div 3", after: "\\times 3" });
  });

  it("drops in a move written out on both sides", () => {
    expect(plan("2x + 5 = 17", "2x + 5 - 5 = 17 - 5").motion).toEqual({
      kind: "write", added: [{ side: "left", index: 2 }, { side: "right", index: 1 }],
    });
  });

  it("fades out what was worked out", () => {
    expect(plan("2x + 5 - 5 = 17 - 5", "2x = 12").motion).toEqual({
      kind: "combine",
      gone: [{ side: "left", index: 1 }, { side: "left", index: 2 }, { side: "right", index: 0 }, { side: "right", index: 1 }],
    });
  });

  it("keeps terms when the sides swap, without flipping them", () => {
    const p = plan("2x = 12", "12 = 2x");
    expect(p.kept).toEqual([
      { from: { side: "right", index: 0 }, to: { side: "left", index: 0 } },
      { from: { side: "left", index: 0 }, to: { side: "right", index: 0 } },
    ]);
  });

  it("shows no flying term for a skipped step", () => {
    expect(plan("2x + 5 = 17", "x = 6").motion).toEqual({ kind: "none" });
  });
});
