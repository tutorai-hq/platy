import { describe, expect, it } from "vitest";
import { answerExample, checkAnswer, readAnswer } from "./answers";

describe("readAnswer", () => {
  it.each([
    ["5", [5]],
    ["x = 5", [5]],
    ["5=x", [5]],
    ["x=10/2", [5]],
    ["x = 7 or x = -7", [7, -7]],
    ["7, -7", [7, -7]],
    ["±7", [7, -7]],
    ["sqrt(49)", [7]],
  ])("%s", (text, values) => {
    expect(readAnswer(text)).toEqual(values);
  });

  it("refuses anything that isn't a number", () => {
    expect(readAnswer("banana")).toBeNull();
    expect(readAnswer("x + 1")).toBeNull();
    expect(readAnswer("x < 5")).toBeNull();
    expect(readAnswer("")).toBeNull();
  });
});

describe("checkAnswer", () => {
  it("grades against the solution set", () => {
    expect(checkAnswer("x=5", [5])).toBe("correct");
    expect(checkAnswer("x=6", [5])).toBe("incorrect");
    expect(checkAnswer("7", [7, -7])).toBe("partial");
    expect(checkAnswer("±7", [7, -7])).toBe("correct");
    expect(checkAnswer("7, 8", [7, -7])).toBe("incorrect");
    expect(checkAnswer("hmm", [5])).toBe("unreadable");
  });
});

describe("answerExample (R-18)", () => {
  it("uses the problem's own letter, and two values when there are two solutions", () => {
    expect(answerExample("b", [5])).toBe("b = 4");
    expect(answerExample("x", [7, -7])).toBe("x = 3, x = -3");
    expect(answerExample(null, [24])).toBe("4");
  });

  it("never shows a solution (R-02)", () => {
    expect(answerExample("x", [4])).toBe("x = 3");
    expect(answerExample("x", [-4])).toBe("x = 3");
    expect(answerExample("x", [3, -3])).toBe("x = 4, x = -4");
  });

  it("has none for an expression, where a number would mislead", () => {
    expect(answerExample(null, [Number("2*x + 7")])).toBeUndefined();
    expect(answerExample("x", [])).toBeUndefined();
  });
});
