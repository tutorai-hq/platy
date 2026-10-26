import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./state";
import { chatScrollTop, latestTutorLine } from "./tutorLine";

const msg = (from: ChatMessage["from"], text: string, id = text): ChatMessage => ({ id, from, text, streaming: false });

describe("Platy's line above the phone keypad (R-27, teen test 2026-10-26)", () => {
  it("is the newest tutor line, even after the student has written", () => {
    expect(latestTutorLine([msg("tutor", "First."), msg("tutor", "Try $2x = 8$."), msg("child", "x=4")])).toBe("Try $2x = 8$.");
  });

  it("skips a reply that hasn't streamed any words yet", () => {
    expect(latestTutorLine([msg("tutor", "Earlier line."), msg("tutor", " ", "empty")])).toBe("Earlier line.");
  });

  it("is nothing on a fresh page", () => {
    expect(latestTutorLine([])).toBeNull();
    expect(latestTutorLine([msg("child", "hi")])).toBeNull();
  });
});

describe("where the chat scrolls (R-27, teen test 2026-10-26)", () => {
  const log = { clientHeight: 300, scrollHeight: 1000 };

  it("goes to the bottom when the newest bubble fits", () => {
    expect(chatScrollTop(log, { offsetTop: 900, offsetHeight: 80 })).toBe(700);
  });

  it("puts a bubble taller than the log at the top, so it reads from its first line", () => {
    expect(chatScrollTop(log, { offsetTop: 600, offsetHeight: 400 })).toBe(588);
  });

  it("never scrolls above the top", () => {
    expect(chatScrollTop({ clientHeight: 300, scrollHeight: 200 }, null)).toBe(0);
    expect(chatScrollTop(log, { offsetTop: 4, offsetHeight: 500 })).toBe(0);
  });
});
