// The on-screen math keypad (R-18): which keys there are and what each does to the answer
// box. Pure, so it's tested without a browser; MathInput applies the result to the field.
// Every key types plain text the parser already reads, so the box stays editable by hand.

export type KeyAction =
  | { kind: "insert"; text: string }
  | { kind: "backspace" }
  | { kind: "left" }
  | { kind: "right" }
  /** Brings the device's own keyboard back, for letters and words. */
  | { kind: "keyboard" }
  /** Sends the box, like Enter: on a small phone the docked keypad can cover the Check button. */
  | { kind: "submit" };

export interface Key {
  label: string;
  /** What a screen reader says. */
  aria: string;
  /** How it looks: operators tinted, letters in math italics, editing keys quiet; digits plain. */
  tone?: "op" | "var" | "edit";
  action: KeyAction;
}

const type = (label: string, aria: string, tone?: Key["tone"], text = label): Key => ({
  label, aria, tone, action: { kind: "insert", text },
});
const edit = (label: string, aria: string, action: KeyAction): Key => ({ label, aria, tone: "edit", action });

// Two blocks side by side: letters and structure on the left, a calculator pad on the right with
// a tall send key down its right edge.
export const KEYPAD: { symbols: Key[]; numbers: Key[] } = {
  symbols: [
    type("x", "x", "var"),
    type("y", "y", "var"),
    type("x²", "squared", "op", "^2"),
    type("(", "open bracket", "op"),
    type(")", "close bracket", "op"),
    type("a⁄b", "fraction", "op", "/"),
    type(",", "comma", "op"),
    edit("←", "move left", { kind: "left" }),
    edit("→", "move right", { kind: "right" }),
    edit("abc", "show keyboard", { kind: "keyboard" }),
    edit("⌫", "delete", { kind: "backspace" }),
  ],
  numbers: [
    type("7", "7"), type("8", "8"), type("9", "9"), type("÷", "divided by", "op"),
    type("4", "4"), type("5", "5"), type("6", "6"), type("×", "times", "op"),
    type("1", "1"), type("2", "2"), type("3", "3"), type("−", "minus", "op", "-"),
    type("0", "0"), type(".", "point"), type("=", "equals", "op"), type("+", "plus", "op"),
    // A word, not an arrow: on a phone this key is the only Check in reach (teen test 2026-10-26).
    { label: "Check", aria: "check", action: { kind: "submit" } },
  ],
};

export interface Field {
  value: string;
  /** The browser's selection; equal when it's just a caret. */
  start: number;
  end: number;
}

export function press(field: Field, action: KeyAction): { value: string; caret: number } {
  const { value, start, end } = field;
  const selected = start !== end;
  switch (action.kind) {
    case "insert":
      return { value: value.slice(0, start) + action.text + value.slice(end), caret: start + action.text.length };
    case "backspace":
      if (selected) return { value: value.slice(0, start) + value.slice(end), caret: start };
      if (start === 0) return { value, caret: 0 };
      return { value: value.slice(0, start - 1) + value.slice(start), caret: start - 1 };
    case "left":
      return { value, caret: selected ? start : Math.max(0, start - 1) };
    case "right":
      return { value, caret: selected ? end : Math.min(value.length, end + 1) };
    case "keyboard":
    case "submit":
      return { value, caret: end };
  }
}
