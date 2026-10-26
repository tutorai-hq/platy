import { describe, expect, it } from "vitest";
import { applyMove, isSolved, pansLatex } from "./balance";
import { contrast, PALETTE } from "./palette";
import { balanceStage, missingStage, spotStage, workedStage } from "./progress";
import type { Pans, PuzzleMove, WorkedExamplePuzzle } from "./types";
import { LEVELS, seeded } from "../mock/generate";
import { gradeMove, itemFor, type LivePuzzle, newItemPuzzle, SKINS } from "../mock/puzzles";
import { REPAIRS_TO_BUILD, SLIPS } from "./slips";

type Shape = Pick<WorkedExamplePuzzle, "steps" | "why">;

const start: Pans = { left: { x: 3, units: 5 }, right: { x: 0, units: 20 } };

describe("balance scale", () => {
  it("takes units off both pans at once, so it stays level", () => {
    const r = applyMove(start, start, { op: "remove_units", n: 5 });
    expect(r).toEqual({ ok: true, pans: { left: { x: 3, units: 0 }, right: { x: 0, units: 15 } } });
  });

  it("refuses a count that isn't a whole number, since the browser's moves aren't trusted", () => {
    for (const n of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(applyMove(start, start, { op: "remove_units", n })).toEqual({ ok: false, reason: "nothing" });
    }
    for (const groups of [2.5, Number.NaN]) {
      expect(applyMove(start, start, { op: "split", groups })).toEqual({ ok: false, reason: "nothing" });
    }
  });

  it("refuses to take more units than a pan has", () => {
    expect(applyMove(start, start, { op: "remove_units", n: 6 })).toEqual({ ok: false, reason: "too_many" });
  });

  it("refuses a split that isn't even on both pans, which is why the order matters", () => {
    expect(applyMove(start, start, { op: "split", groups: 3 })).toEqual({ ok: false, reason: "uneven_units" });
  });

  it("says when it's the x-containers that won't split evenly", () => {
    const after = { left: { x: 3, units: 0 }, right: { x: 0, units: 15 } };
    expect(applyMove(after, start, { op: "split", groups: 5 })).toEqual({ ok: false, reason: "uneven_x" });
    expect(applyMove(start, start, { op: "split", groups: 2 })).toEqual({ ok: false, reason: "uneven_x" });
  });

  it("solves 3x + 5 = 20 in two moves", () => {
    const one = applyMove(start, start, { op: "remove_units", n: 5 });
    if (!one.ok) throw new Error("first move refused");
    const two = applyMove(one.pans, start, { op: "split", groups: 3 });
    if (!two.ok) throw new Error("second move refused");
    expect(isSolved(two.pans)).toBe(true);
    expect(pansLatex(two.pans)).toBe("x = 5");
  });

  it("starts over from the original pans", () => {
    const one = applyMove(start, start, { op: "remove_units", n: 2 });
    if (!one.ok) throw new Error("move refused");
    expect(applyMove(one.pans, start, { op: "start_over" })).toEqual({ ok: true, pans: start });
  });

  it("writes the pans as an equation", () => {
    expect(pansLatex(start)).toBe("3x + 5 = 20");
    expect(pansLatex({ left: { x: 3, units: 0 }, right: { x: 0, units: 15 } })).toBe("3x = 15");
  });

  it("isn't solved while anything else shares the pan with the x", () => {
    expect(isSolved({ left: { x: 1, units: 2 }, right: { x: 0, units: 7 } })).toBe(false);
    expect(isSolved(start)).toBe(false);
  });
});

describe("palette", () => {
  it("keeps white text readable on every primary color", () => {
    for (const c of Object.values(PALETTE)) expect(contrast(c.primary, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps every secondary color visible on the white card", () => {
    for (const c of Object.values(PALETTE)) expect(contrast(c.secondary, "#ffffff")).toBeGreaterThanOrEqual(3);
  });
});

describe("puzzle progress", () => {
  it("walks spot the error through find, fix, finish", () => {
    expect(spotStage({})).toBe("find");
    expect(spotStage({ found_error: "incorrect" })).toBe("find");
    expect(spotStage({ found_error: "correct" })).toBe("fix");
    expect(spotStage({ found_error: "correct", fixed_step: "correct" })).toBe("finish");
    expect(spotStage({ found_error: "correct", fixed_step: "correct", final_answer: "correct" })).toBe("done");
  });

  it("finishes missing step and balance on their one check", () => {
    expect(missingStage({ missing_line: "unreadable" })).toBe("fill");
    expect(missingStage({ missing_line: "correct" })).toBe("done");
    expect(balanceStage({ move: "correct" })).toBe("play");
    expect(balanceStage({ solved: "correct" })).toBe("done");
  });

  it("asks a worked example's faded steps in order, and why only when nothing is faded", () => {
    const step = { latex: "3x = 15", reason: "Subtract $5$ from both sides." };
    const why = { question: "Why?", choices: ["a", "b", "c"] };
    const watch: Shape = { steps: [step, step], why };
    const solo: Shape = { steps: [null, null], why: null };
    const finish: Shape = { steps: [step, null], why: null };
    expect(workedStage(watch, {})).toBe("why");
    expect(workedStage(watch, { why: "correct" })).toBe("done");
    expect(workedStage(finish, {})).toBe("final_answer");
    expect(workedStage(solo, {})).toBe("first_step");
    expect(workedStage(solo, { first_step: "incorrect" })).toBe("first_step");
    expect(workedStage(solo, { first_step: "correct" })).toBe("final_answer");
    expect(workedStage(solo, { first_step: "correct", final_answer: "correct" })).toBe("done");
  });
});

// R-37: every repair item a slip points at (R-40) exists, or is listed to build, and its checks
// verify: the right moves, graded the way the server grades them, solve it.
describe("repair items", () => {
  const solve = (p: LivePuzzle): boolean => {
    const moves: PuzzleMove[] = (() => {
      switch (p.template) {
        case "spot_the_error":
          return [{ check: "found_error", line: 0 }, { check: "fixed_step", text: p.n.fix }, { check: "final_answer", text: `x = ${p.n.answer}` }];
        case "missing_step":
          return [{ check: "missing_line", text: p.n.expected }];
        case "balance": {
          const { left } = p.n.start;
          const out: PuzzleMove[] = [];
          if (left.units > 0) out.push({ check: "move", move: { op: "remove_units", n: left.units } });
          if (left.x > 1) out.push({ check: "move", move: { op: "split", groups: left.x } });
          return out;
        }
        case "worked_example":
          return [{ check: "why", choice: p.n.order.indexOf(0) }];
      }
    })();
    let solved = false;
    for (const move of moves) {
      const v = gradeMove(p, move, SKINS.neutral);
      if (v?.outcome !== "correct") return false;
      p.outcomes[v.check] = v.outcome;
      if (v.pans && p.template === "balance") p.pans = v.pans;
      solved = v.solved;
    }
    return solved;
  };

  it("resolves every repair id in the slip map to an item whose checks verify, or lists it to build", () => {
    const repairs = new Set(SLIPS.map((s) => s.repair));
    for (const id of repairs) {
      if (REPAIRS_TO_BUILD.has(id)) {
        expect(itemFor(id), id).toBeNull();
        continue;
      }
      expect(itemFor(id), id).not.toBeNull();
      for (const level of LEVELS) {
        for (let seed = 1; seed <= 50; seed++) {
          const p = newItemPuzzle(id, seeded(seed), `${id}-${seed}`, level);
          expect(p.item.item_id).toBe(id);
          expect(solve(p), `${id} L${level} seed ${seed}`).toBe(true);
        }
      }
    }
  });

  it("has a repair item for every inverse operations and two-step slip", () => {
    for (const s of SLIPS.filter((x) => x.node === "inverse_operations" || x.node === "two_step_equations")) {
      expect(itemFor(s.repair), s.id).not.toBeNull();
    }
  });
});
