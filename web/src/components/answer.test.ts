import { describe, expect, it } from "vitest";
import { answerPlaceholder, canCheck, selectsAfter } from "./answer";

// Teen test 2026-10-26: a `b` problem said "like x = 4", the two-root problem didn't say both
// answers go in one box, Check took input the preview couldn't read, and a rejected answer had
// to be deleted by hand (R-18).

describe("the answer box (R-18)", () => {
  it("shows the server's example of the answer's form, or none", () => {
    expect(answerPlaceholder({ answer_example: "b = 4" })).toBe("Your answer, like b = 4");
    expect(answerPlaceholder({ answer_example: "x = 3, x = -3" })).toBe("Your answer, like x = 3, x = -3");
    expect(answerPlaceholder({})).toBe("Your answer");
  });

  it("lets Check send only what the preview can read in full", () => {
    for (const ok of ["5", "x = 5", "-3", "25/3", "±7", "7, -7", "x = 7, x = -7", "b = 4", "x = 6.5", "√49"]) {
      expect(canCheck(ok), ok).toBe(true);
    }
    for (const no of ["", "  ", "x =", "3x+", "(3+", "x^", "x = 5!", "x = ?", "x==5"]) {
      expect(canCheck(no), no).toBe(false);
    }
  });

  it("selects a wrong or unreadable answer so typing replaces it, but not a partial one", () => {
    expect(selectsAfter("incorrect")).toBe(true);
    expect(selectsAfter("unreadable")).toBe(true);
    expect(selectsAfter("partial")).toBe(false);
    expect(selectsAfter("correct")).toBe(false);
    expect(selectsAfter(null)).toBe(false);
  });
});
