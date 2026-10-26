// The session contract between the browser and Platy's server. This is the frontend's
// proposal (see web/README.md) until Connor's backend agrees it. The mock transport and
// the WebSocket transport both speak exactly these events.

import type { CheckId, CheckOutcome, PaletteId, Puzzle, PuzzleMove } from "./content/types";

export type SessionMode = "onboarding" | "tutoring";

/**
 * A step-by-step line's verdict (R-39). "solved" is a valid line with x alone on one side and a
 * finished number on the other.
 */
export type StepResult = "valid" | "solved" | "invalid" | "unreadable";

export interface Problem {
  problem_id: string;
  skill_id: string;
  /** LaTeX, rendered with KaTeX. */
  prompt: string;
  /** Short plain-language instruction, e.g. "Solve for x". */
  instruction: string;
  /**
   * "answer": one answer box. "steps": the student writes one line at a time, and each line
   * is checked before the next opens (R-39). The final answer alone never counts.
   */
  format: "answer" | "steps";
  /**
   * "practice": one of the session's problems. "probe": a quick check one or two levels down the
   * skill map before teaching (R-01). "warmup": the easier problem after a pause (R-21).
   */
  kind: "practice" | "probe" | "warmup";
  /** 1-based position in this session, for "Problem 2 of 3". */
  position: number;
  total: number;
}

/**
 * What the primer believes and why, for the demo-only primer view (R-42). Codes and numbers only:
 * the browser turns each code into words from a fixed table (content/primer.json), so no free
 * text and nothing the student wrote ever reaches it. Proposed; Connor's policy would emit it.
 */
export interface PrimerState {
  /** P(mastered) per skill node on the current path, 0 to 1, in path order. */
  mastery: { skill_id: string; p: number }[];
  /** The primer's working hypothesis, or null while it has none. */
  hypothesis: { code: string; skill_id: string } | null;
  /** The move it just made, the reason for it, and the skill the move is about. */
  move: { code: string; reason: string; skill_id: string };
}

/**
 * One skill's mastery over the session, for "Your map" at the end (R-13). Numbers and a skill id
 * only. `due` is the primer's call that the skill needs review soon. Proposed for Connor.
 */
export interface SkillReport {
  skill_id: string;
  /** P(mastered), 0 to 1, when the session started and when it ended. */
  before: number;
  after: number;
  due: boolean;
}

export interface SafetyResource {
  name: string;
  contact: string;
  description: string;
}

export type ServerEvent =
  /** A streamed tutor reply (R-06). Deltas with the same message_id append; done closes it. */
  | { type: "tutor_message"; message_id: string; delta: string; done: boolean }
  | ({ type: "problem" } & Problem)
  | { type: "answer_result"; problem_id: string; result: "correct" | "partial" | "incorrect" | "unreadable" }
  /**
   * The verdict on step line `line` (1 is the first line under the problem, R-39). `slip` is the
   * slip-map id (R-40, web/src/content/slips.json) a wrong line matches; the browser shows its hint.
   */
  | { type: "step_result"; problem_id: string; line: number; result: StepResult; slip?: string }
  /** Hard reset at a natural breakpoint (R-17, A-4): the UI clears the visible chat. */
  | { type: "reset"; reason: "problem_end" | "topic_switch" }
  /** De-escalation ladder, first rung (R-21). */
  | { type: "pause_suggested" }
  | { type: "topic_switch"; label: string }
  /**
   * The next step is ready, and waits for the student: the browser shows one button with this
   * label and sends `continue` when it's tapped. Used before a detour (a quick check, a puzzle), so
   * the student reads why before the screen changes (R-01).
   */
  | { type: "next_up"; label: string }
  /** R-22. Detection is still an open design question; the UI slot exists. */
  | { type: "safety_escalation"; resources: SafetyResource[] }
  /** Fail closed (P-3): the session is over, show a calm error. */
  | { type: "error"; code: string }
  /** `map` is every skill's mastery over the session, for "Your map" (R-13). */
  | { type: "session_end"; solved: number; map?: SkillReport[] }
  /**
   * Content (R-37). A puzzle replaces the problem card until puzzle_done. A second puzzle
   * event with the same instance_id only changes its look (a new skin), not its progress.
   */
  | { type: "puzzle"; puzzle: Puzzle }
  /** The server's verdict on one move. "solved" arrives when a balance scale is finished. */
  | { type: "puzzle_result"; instance_id: string; check: CheckId; outcome: CheckOutcome }
  | { type: "puzzle_done"; instance_id: string }
  /** The primer's state after each move (R-42). Sent only when the demo flag is on. */
  | ({ type: "primer_state" } & PrimerState);

export type ClientEvent =
  | { type: "child_message"; text: string }
  | { type: "answer"; problem_id: string; text: string }
  /** One line of a step-by-step solution. `line` counts from 1; the server checks it (R-39). */
  | { type: "step"; problem_id: string; line: number; text: string }
  | { type: "hint_requested"; problem_id: string }
  /** The child chose "keep going" on the pause screen. */
  | { type: "resume" }
  /** The student tapped the `next_up` button. */
  | { type: "continue" }
  | { type: "end_session" }
  /** What the student did in a puzzle. The server grades it; the client never sends "correct". */
  | { type: "puzzle_move"; instance_id: string; move: PuzzleMove }
  | { type: "puzzle_hint"; instance_id: string }
  /** The student finished a puzzle and is ready to move on. */
  | { type: "puzzle_next"; instance_id: string }
  /** The student's own pick for a skin slot (R-38), from a fixed palette, never free text. */
  | { type: "slot_pick"; colors: PaletteId };
