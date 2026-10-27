import { describe, expect, it } from "vitest";
import { firstWrong, isNumeralText, numeralsIn, sameExpression, sameSum, unbracketed, workOut } from "./working";

// R-37: the integer and order-of-operations repairs show an expression worked out a line at a
// time, with one line wrong. The stepper writes the lines the way a student would, and the wrong
// line is found by what the lines come to, never by where the slip was planted.

const lines = (expr: string, order: "usual" | "left_to_right" = "usual") => workOut(expr, order)?.lines;

describe("workOut", () => {
  it("works an expression out in the usual order, one operation per line, brackets first", () => {
    expect(lines("20 - 3*(4 + 2)")).toEqual(["20 - 3*6", "20 - 18", "2"]);
    expect(lines("(-6)*(-4) - 5 + 2")).toEqual(["24 - 5 + 2", "19 + 2", "21"]);
    expect(lines("5*(-4) - 3*2")).toEqual(["-20 - 3*2", "-20 - 6", "-26"]);
    expect(lines("(-42)/(-6) + 3*(-5)")).toEqual(["7 + 3*(-5)", "7 + (-15)", "-8"]);
    expect(lines("18/3 - 4*5")).toEqual(["6 - 4*5", "6 - 20", "-14"]);
    expect(lines("2(3 + 4)")).toEqual(["2*7", "14"]);
    expect(lines("-6 * (-4)")).toEqual(["24"]);
  });

  it("works strictly left to right when told to, the way the precedence slip does", () => {
    expect(lines("20 - 3*(4 + 2)", "left_to_right")).toEqual(["20 - 3*6", "17*6", "102"]);
    expect(lines("5 + 3*4", "left_to_right")).toEqual(["8*4", "32"]);
    expect(lines("18/3 - 4*5", "left_to_right")).toEqual(["6 - 4*5", "2*5", "10"]);
  });

  it("plants a slip on one operation, and the lines after it follow from the wrong value", () => {
    const flawed = workOut("(-6)*(-4) - 5 + 2", "usual", (r) => (r.op === "*" ? -r.value : null));
    expect(flawed?.lines).toEqual(["-24 - 5 + 2", "-29 + 2", "-27"]);
    expect(flawed?.reductions.map((r) => r.op)).toEqual(["*", "-", "+"]);
    // The slip fires once: a second product keeps its sign.
    const once = workOut("5*(-4) - 3*2", "usual", (r) => (r.op === "*" ? -r.value : null));
    expect(once?.lines).toEqual(["20 - 3*2", "20 - 6", "14"]);
  });

  it("returns null for anything that isn't an expression in numbers", () => {
    expect(workOut("2x + 5 = 17")).toBeNull();
    expect(workOut("x + 3")).toBeNull();
    expect(workOut("hello")).toBeNull();
    expect(workOut("")).toBeNull();
  });
});

describe("firstWrong", () => {
  it("finds the first line that no longer comes to the expression's value", () => {
    expect(firstWrong("20 - 3*(4 + 2)", ["20 - 3*6", "17*6", "102"])).toBe(1);
    expect(firstWrong("20 - 3*(4 + 2)", ["20 - 3*6", "20 - 18", "2"])).toBe(-1);
    expect(firstWrong("(-6)*(-4) - 5 + 2", ["-24 - 5 + 2", "-29 + 2", "-27"])).toBe(0);
    expect(firstWrong("20 - 3*(4 + 2)", ["20 - 3*6", "x = 2"])).toBe(1);
  });
});

describe("line helpers", () => {
  it("tells one number from a line still to work out", () => {
    for (const t of ["24", "-24", " -8 ", "3.5"]) expect(isNumeralText(t), t).toBe(true);
    for (const t of ["20 - 18", "2*3", "x", "", "7 + (-15)"]) expect(isNumeralText(t), t).toBe(false);
  });

  it("knows the same expression written with different spacing, and a different one", () => {
    expect(sameExpression("20 - 3*6", "20-3*6")).toBe(true);
    expect(sameExpression("20 - 3*6", "20 - 18")).toBe(false);
    expect(sameExpression("20 - 3*6", "20 - 6*3")).toBe(false);
    expect(sameExpression("x", "x")).toBe(false);
  });

  it("knows a sum with its terms in any order", () => {
    expect(sameSum("-5 - 3", "-3 - 5")).toBe(true);
    expect(sameSum("-5 - 3", "-3 + (-5)")).toBe(true);
    expect(sameSum("-5 - 3", "-5 + 3")).toBe(false);
    expect(sameSum("-8", "-5 - 3")).toBe(false);
  });

  it("drops the brackets the way the brackets slip does", () => {
    expect(unbracketed("20 - 3*(4 + 2)")).toBe("20 - 3*4 + 2");
    expect(unbracketed("6 - 2*(5 + 4)")).toBe("6 - 2*5 + 4");
    expect(unbracketed("2(3 + 4)")).toBe("2*3 + 4");
    expect(unbracketed("(5 + 7)/4 - 2*(6 - 3)")).toBe("5 + 7/4 - 2*6 - 3");
  });

  it("lists the numbers on a line, signs aside", () => {
    expect(numeralsIn("20 - 3*(4 + 2)")).toEqual([20, 3, 4, 2]);
    expect(numeralsIn("-24 - 5")).toEqual([24, 5]);
  });
});
