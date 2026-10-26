import { applyMove } from "../content/balance";
import { balanceStage, missingStage, type Outcomes, spotStage, workedStage } from "../content/progress";
import type { CheckId, CheckOutcome, Pans, Puzzle, PuzzleMove } from "../content/types";
import type { PrimerState, Problem, SafetyResource, ServerEvent, SkillReport, StepResult } from "../protocol";

// Everything here lives in React state only. Child content is never written to browser
// storage, cookies, the URL or a log (P-1, P-10), and it is dropped on a reset or when
// the session ends. src/privacy.test.ts guards this.

export interface ChatMessage {
  id: string;
  from: "tutor" | "child";
  text: string;
  streaming: boolean;
}

export type AnswerFeedback = "correct" | "partial" | "incorrect" | "unreadable" | null;

export type Overlay =
  | { kind: "pause" }
  | { kind: "break"; until: number }
  | { kind: "safety"; resources: SafetyResource[] }
  | null;

/** A puzzle on screen (R-37). The server's verdicts drive it; the browser never grades. */
export interface PuzzleState {
  puzzle: Puzzle;
  outcomes: Outcomes;
  /** The latest verdict, cleared when the next move is sent. */
  last: { check: CheckId; outcome: CheckOutcome } | null;
  /** Balance: the pans as drawn. */
  pans: Pans | null;
  /** The move waiting for the server's verdict. The player takes no other move meanwhile. */
  pending: PuzzleMove | null;
  done: boolean;
  /** The student has answered the reflection question since the puzzle was done (R-03). */
  explained: boolean;
}

/**
 * A step-by-step problem in progress (R-48). The lines are the child's own, in React state
 * only, and go with the problem.
 */
export interface StepsState {
  problem_id: string;
  /** Lines the server accepted, in order. */
  lines: string[];
  /** The line waiting for its verdict. */
  pending: string | null;
  /** The latest line the server didn't accept, kept on screen with its mark until the next try. */
  marked: { text: string; result: Exclude<StepResult, "valid" | "solved">; slip?: string } | null;
  solved: boolean;
}

export interface SessionState {
  phase: "welcome" | "live" | "ended" | "error";
  messages: ChatMessage[];
  problem: Problem | null;
  /** Shown in place of the problem card until puzzle_done. */
  puzzle: PuzzleState | null;
  feedback: AnswerFeedback;
  /** Set while a step-by-step problem is on screen. */
  steps: StepsState | null;
  /** Shown briefly when a hard reset clears the page. */
  resetNote: string | null;
  overlay: Overlay;
  /**
   * Between one problem or puzzle and the next. The chat waits, because the server would read
   * anything sent now against the next problem.
   */
  moving: boolean;
  errorCode: string | null;
  solved: number;
  /** Problems solved with no miss, from session_end; null when the server didn't say. */
  firstTry: number | null;
  /**
   * The demo primer view (R-42): codes and numbers only, never chat. It outlasts resets, since
   * it's the primer's view of the session, and goes when the session ends.
   */
  primer: PrimerView | null;
  /** The session's mastery report for "Your map" (R-13), once it ends. Dropped at the next start. */
  map: SkillReport[] | null;
  /**
   * The label of the button that moves on to what the server has ready next (`next_up`), such as
   * a quick check before teaching (R-01). Null when nothing waits for the student.
   */
  nextUp: string | null;
}

export interface PrimerView {
  state: PrimerState;
  /** Counts primer_state events, so the panel can mark each new move. */
  seq: number;
  /** The latest moves, newest first, for the reason lines. */
  log: { seq: number; move: PrimerState["move"] }[];
}

const PRIMER_LOG = 3;

export const initialState: SessionState = {
  phase: "welcome",
  messages: [],
  problem: null,
  puzzle: null,
  feedback: null,
  steps: null,
  resetNote: null,
  overlay: null,
  moving: false,
  errorCode: null,
  solved: 0,
  firstTry: null,
  primer: null,
  map: null,
  nextUp: null,
};

export type Action =
  | { type: "started" }
  | { type: "server"; event: ServerEvent }
  | { type: "child_said"; id: string; text: string }
  | { type: "answer_sent" }
  | { type: "step_sent"; text: string }
  | { type: "puzzle_move_sent"; move: PuzzleMove }
  | { type: "puzzle_next_sent" }
  | { type: "continue_sent" }
  | { type: "reset_note_done" }
  | { type: "take_break"; until: number }
  | { type: "close_overlay" }
  | { type: "restart" };

// Plain words: teen testers (2026-10-26) asked what "fresh page" meant.
const RESET_NOTES = {
  problem_end: "Next one coming up.",
  topic_switch: "Something new coming up.",
};

export function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "started":
      return { ...initialState, phase: "live" };
    case "restart":
      return initialState;
    case "child_said":
      return {
        ...state,
        messages: [...state.messages, { id: action.id, from: "child", text: action.text, streaming: false }],
        // Once a puzzle is done, anything they say answers its reflection question.
        puzzle: state.puzzle?.done ? { ...state.puzzle, explained: true } : state.puzzle,
      };
    case "answer_sent":
      // Clear the last verdict so the next one shows even if it's the same.
      return { ...state, feedback: null };
    case "step_sent":
      if (!state.steps || state.steps.pending !== null || state.steps.solved) return state;
      return { ...state, steps: { ...state.steps, pending: action.text, marked: null } };
    case "puzzle_move_sent": {
      const p = state.puzzle;
      if (!p) return state;
      return { ...state, puzzle: { ...p, last: null, pending: action.move } };
    }
    case "puzzle_next_sent":
      return { ...state, moving: true };
    case "continue_sent":
      // What's next is on its way; the chat waits for it, as between problems.
      return state.nextUp === null ? state : { ...state, nextUp: null, moving: true };
    case "reset_note_done":
      return { ...state, resetNote: null };
    case "take_break":
      return { ...state, overlay: { kind: "break", until: action.until } };
    case "close_overlay":
      return { ...state, overlay: null };
    case "server":
      return onServer(state, action.event);
  }
}

function onServer(state: SessionState, event: ServerEvent): SessionState {
  if (state.phase !== "live") return state;
  switch (event.type) {
    case "tutor_message": {
      // Look past the newest bubble: the child may have typed or tapped while this one streamed.
      const i = state.messages.map((m) => m.id).lastIndexOf(event.message_id);
      const open = state.messages[i];
      if (open) {
        const updated = { ...open, text: open.text + event.delta, streaming: !event.done };
        return { ...state, messages: state.messages.map((m, j) => (j === i ? updated : m)) };
      }
      const msg: ChatMessage = { id: event.message_id, from: "tutor", text: event.delta, streaming: !event.done };
      return { ...state, messages: [...state.messages, msg] };
    }
    case "problem": {
      const { type: _type, ...problem } = event;
      const steps = problem.format === "steps"
        ? { problem_id: problem.problem_id, lines: [], pending: null, marked: null, solved: false }
        : null;
      return { ...state, problem, feedback: null, steps, moving: false, nextUp: null };
    }
    case "puzzle": {
      // The same instance again is only a new look; a new one means the move is over.
      const fresh = state.puzzle?.puzzle.instance_id !== event.puzzle.instance_id;
      return { ...state, puzzle: onPuzzle(state.puzzle, event.puzzle), moving: state.moving && !fresh, nextUp: fresh ? null : state.nextUp };
    }
    case "puzzle_result":
      if (state.puzzle?.puzzle.instance_id !== event.instance_id) return state;
      return { ...state, puzzle: onVerdict(state.puzzle, event.check, event.outcome) };
    case "puzzle_done":
      if (state.puzzle?.puzzle.instance_id !== event.instance_id) return state;
      return { ...state, puzzle: null, moving: true };
    case "answer_result":
      if (state.problem?.problem_id !== event.problem_id) return state;
      return {
        ...state,
        feedback: event.result,
        solved: event.result === "correct" ? state.solved + 1 : state.solved,
        moving: state.moving || event.result === "correct",
      };
    case "step_result":
      return onStep(state, event.problem_id, event.line, event.result, event.slip);
    case "reset":
      // A hard reset (R-17): the visible conversation is gone, not hidden.
      return {
        ...state,
        messages: [],
        problem: null,
        steps: null,
        puzzle: null,
        feedback: null,
        moving: true,
        nextUp: null,
        // A topic_switch event just before the reset already named the new topic.
        resetNote: event.reason === "topic_switch" && state.resetNote ? state.resetNote : RESET_NOTES[event.reason],
      };
    case "next_up":
      return { ...state, nextUp: event.label };
    case "topic_switch":
      return { ...state, overlay: null, resetNote: event.label };
    case "pause_suggested":
      return { ...state, overlay: { kind: "pause" } };
    case "safety_escalation":
      return { ...state, overlay: { kind: "safety", resources: event.resources } };
    case "primer_state": {
      const { type: _type, ...primer } = event;
      const seq = (state.primer?.seq ?? 0) + 1;
      const log = [{ seq, move: primer.move }, ...(state.primer?.log ?? [])].slice(0, PRIMER_LOG);
      return { ...state, primer: { state: primer, seq, log } };
    }
    case "error":
      return { ...initialState, phase: "error", errorCode: event.code };
    case "session_end":
      return { ...initialState, phase: "ended", solved: event.solved, firstTry: event.first_try ?? null, map: event.map ?? null };
  }
}

function onStep(state: SessionState, problemId: string, line: number, result: StepResult, slip?: string): SessionState {
  const s = state.steps;
  // Only the verdict on the line that's waiting counts.
  if (!s || s.problem_id !== problemId || s.pending === null || line !== s.lines.length + 1) return state;
  if (result === "valid" || result === "solved") {
    const solved = result === "solved";
    return {
      ...state,
      steps: { ...s, lines: [...s.lines, s.pending], pending: null, marked: null, solved },
      solved: solved ? state.solved + 1 : state.solved,
      moving: state.moving || solved,
    };
  }
  const marked = { text: s.pending, result, ...(slip ? { slip } : {}) };
  return { ...state, steps: { ...s, pending: null, marked } };
}

function onPuzzle(current: PuzzleState | null, puzzle: Puzzle): PuzzleState {
  // The same instance again is only a new look (R-38): keep where the student is.
  if (current?.puzzle.instance_id === puzzle.instance_id) return { ...current, puzzle };
  const pans = puzzle.template === "balance" ? puzzle.start : null;
  return { puzzle, outcomes: {}, last: null, pans, pending: null, done: false, explained: false };
}

function onVerdict(p: PuzzleState, check: CheckId, outcome: CheckOutcome): PuzzleState {
  const outcomes = { ...p.outcomes, [check]: outcome };
  let pans = p.pans;
  const pending = p.pending;
  // Draw a scale move only once the server accepts it.
  if (check === "move" && outcome === "correct" && pending?.check === "move" && pans && p.puzzle.template === "balance") {
    const r = applyMove(pans, p.puzzle.start, pending.move);
    if (r.ok) pans = r.pans;
  }
  const stage =
    p.puzzle.template === "spot_the_error" ? spotStage(outcomes)
    : p.puzzle.template === "missing_step" ? missingStage(outcomes)
    : p.puzzle.template === "worked_example" ? workedStage(p.puzzle, outcomes)
    : balanceStage(outcomes);
  return { ...p, outcomes, pans, pending: null, last: { check, outcome }, done: stage === "done" };
}

/**
 * Platy's typing dots show only while a reply to the student is due: after they said something,
 * and not while a reset note fills the chat. An empty chat waits quietly, so the dots never run on
 * a screen that has nothing more coming.
 */
export function platyIsTyping(messages: readonly ChatMessage[], resetNote: string | null): boolean {
  return resetNote === null && messages.at(-1)?.from === "child";
}
