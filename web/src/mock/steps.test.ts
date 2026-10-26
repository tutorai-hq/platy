import { describe, expect, it } from "vitest";
import { checkStep } from "./steps";

// R-48: each line is checked as a valid next step from the line above it.
describe("checkStep (R-48)", () => {
  it("accepts a valid next step", () => {
    expect(checkStep("2x + 5 = 17", "2x = 12")).toBe("valid");
    expect(checkStep("2x = 12", "x = 12/2")).toBe("valid");
    expect(checkStep("3x - 4 = 11", "3x = 15")).toBe("valid");
    expect(checkStep("x/3 + 2 = 6", "x/3 = 4")).toBe("valid");
  });

  it("accepts a line that writes out the move on both sides", () => {
    expect(checkStep("2x + 5 = 17", "2x + 5 - 5 = 17 - 5")).toBe("valid");
    expect(checkStep("2x + 5 - 5 = 17 - 5", "2x = 12")).toBe("valid");
  });

  it("accepts a skipped-but-valid step and calls it solved", () => {
    expect(checkStep("2x + 5 = 17", "x = 6")).toBe("solved");
    expect(checkStep("3x - 4 = 11", "x = 5")).toBe("solved");
  });

  it("calls a line solved only when x stands alone and the other side is a plain number", () => {
    expect(checkStep("2x = 12", "x = 6")).toBe("solved");
    expect(checkStep("2x = 12", "6 = x")).toBe("solved");
    expect(checkStep("2x = 12", "X = 6")).toBe("solved");
    expect(checkStep("2x = -12", "x = -6")).toBe("solved");
    expect(checkStep("3x = 2", "x = 2/3")).toBe("solved");
    expect(checkStep("2x = 3", "x = 1.5")).toBe("solved");
    // Equivalent, but there's still a sum or a fraction to finish.
    expect(checkStep("2x = 12", "x = 12/2")).toBe("valid");
    expect(checkStep("2x + 5 = 17", "x = 6 + 0")).toBe("valid");
    expect(checkStep("2x = 12", "1x = 6")).toBe("valid");
  });

  it("accepts equivalent forms: sides swapped, terms reordered, both sides scaled", () => {
    expect(checkStep("2x + 5 = 17", "12 = 2x")).toBe("valid");
    expect(checkStep("2x + 5 = 17", "5 + 2x = 17")).toBe("valid");
    expect(checkStep("2x + 5 = 17", "17 = 2x + 5")).toBe("valid");
    expect(checkStep("2x + 5 = 17", "4x + 10 = 34")).toBe("valid");
    expect(checkStep("2x + 5 = 17", "2x - 12 = 0")).toBe("valid");
    expect(checkStep("2x + 5 = 17", "x + 2.5 = 8.5")).toBe("valid");
  });

  it("lets the student finish a line by working out what's left", () => {
    expect(checkStep("x = 12/2", "x = 6")).toBe("solved");
    expect(checkStep("1x = 6", "x = 6")).toBe("solved");
    expect(checkStep("x = 6 + 0", "x = 6")).toBe("solved");
    expect(checkStep("2x = 17 - 5", "2x = 12")).toBe("valid");
  });

  it("marks invalid steps", () => {
    // Added the 5 instead of subtracting it.
    expect(checkStep("2x + 5 = 17", "2x = 22")).toBe("invalid");
    // Divided only one term.
    expect(checkStep("2x + 6 = 10", "x + 6 = 5")).toBe("invalid");
    // Subtracted the coefficient instead of dividing.
    expect(checkStep("3x = 12", "x = 9")).toBe("invalid");
    // Sign slip moving a negative term.
    expect(checkStep("3x - 4 = 11", "3x = 7")).toBe("invalid");
    // Moved only on one side.
    expect(checkStep("2x + 5 = 17", "2x = 17")).toBe("invalid");
    // A wrong final answer is a wrong line, not a solution.
    expect(checkStep("2x = 12", "x = 5")).toBe("invalid");
    // No x left and not true.
    expect(checkStep("2x + 5 = 17", "5 = 17")).toBe("invalid");
  });

  it("can't read a line that isn't a linear equation in x", () => {
    expect(checkStep("2x = 12", "6")).toBe("unreadable");
    expect(checkStep("2x = 12", "x = ")).toBe("unreadable");
    expect(checkStep("2x = 12", "x^2 = 36")).toBe("unreadable");
    expect(checkStep("2x = 12", "x < 6")).toBe("unreadable");
    expect(checkStep("2x = 12", "hello")).toBe("unreadable");
    expect(checkStep("2x = 12", "x = 6 = 6")).toBe("unreadable");
  });
});
