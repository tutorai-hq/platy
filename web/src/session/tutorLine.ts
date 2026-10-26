import { createContext } from "react";
import type { ChatMessage } from "./state";

/**
 * Platy's newest line, for the strip above a phone's docked keypad (R-27): the keypad covers the
 * chat, and teen testers missed replies behind it. React state only, like the chat itself (P-1).
 */
export const TutorLine = createContext<string | null>(null);

export function latestTutorLine(messages: readonly ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.from === "tutor" && m.text.trim()) return m.text;
  }
  return null;
}

/**
 * Where the chat log scrolls to for its newest bubble: the bottom, unless the bubble is taller than
 * the log, when its first line goes at the top so it reads from the start (R-27).
 */
export function chatScrollTop(log: { clientHeight: number; scrollHeight: number }, last: { offsetTop: number; offsetHeight: number } | null, gap = 12): number {
  if (last && last.offsetHeight + 2 * gap > log.clientHeight) return Math.max(0, last.offsetTop - gap);
  return Math.max(0, log.scrollHeight - log.clientHeight);
}
