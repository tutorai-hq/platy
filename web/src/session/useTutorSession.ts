import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { choiceText, type Level, levelText } from "../content/confidence";
import type { PaletteId, PuzzleMove } from "../content/types";
import type { ClientEvent } from "../protocol";
import { createTransport } from "../transport";
import type { DemoTrigger, TutorTransport } from "../transport/types";
import { initialState, reducer } from "./state";

export function useTutorSession(makeTransport: () => TutorTransport = createTransport) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const transport = useRef<TutorTransport | null>(null);
  const childMessages = useRef(0);
  const [isMock, setIsMock] = useState(false);

  const stop = useCallback(() => {
    transport.current?.close();
    transport.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  // The session is over once it ends or errors; drop the channel (fail closed, P-3).
  useEffect(() => {
    if (state.phase === "ended" || state.phase === "error") stop();
  }, [state.phase, stop]);

  useEffect(() => {
    if (!state.resetNote) return;
    const t = setTimeout(() => dispatch({ type: "reset_note_done" }), 2200);
    return () => clearTimeout(t);
  }, [state.resetNote]);

  const start = useCallback(() => {
    stop();
    const t = makeTransport();
    transport.current = t;
    setIsMock(t.kind === "mock");
    dispatch({ type: "started" });
    t.start("tutoring", (event) => dispatch({ type: "server", event })).catch(() =>
      dispatch({ type: "server", event: { type: "error", code: "start_failed" } }),
    );
  }, [makeTransport, stop]);

  const send = useCallback((event: ClientEvent) => transport.current?.send(event), []);

  const say = useCallback(
    (text: string) => {
      dispatch({ type: "child_said", id: `k${++childMessages.current}`, text });
      send({ type: "child_message", text });
    },
    [send],
  );

  const answer = useCallback(
    (problem_id: string, text: string) => {
      dispatch({ type: "child_said", id: `k${++childMessages.current}`, text });
      dispatch({ type: "answer_sent" });
      send({ type: "answer", problem_id, text });
    },
    [send],
  );

  const steps = state.steps;
  const step = useCallback(
    (problem_id: string, line: number, text: string) => {
      // One line at a time, and only one the solution will show (the reducer's step_sent rule),
      // so the server's lines and the screen's never drift apart.
      if (!steps || steps.problem_id !== problem_id || steps.pending !== null || steps.solved) return;
      // The line shows in the solution itself, not the chat (R-48). React state only (P-1).
      dispatch({ type: "step_sent", text });
      send({ type: "step", problem_id, line, text });
    },
    [send, steps],
  );

  const puzzleMove = useCallback(
    (instance_id: string, move: PuzzleMove, echo?: string) => {
      // What the child typed or tapped shows in the chat, like an answer does, so the tutor's
      // question about it reads in context. It lives in React state only (P-1).
      if (echo) dispatch({ type: "child_said", id: `k${++childMessages.current}`, text: echo });
      dispatch({ type: "puzzle_move_sent", move });
      send({ type: "puzzle_move", instance_id, move });
    },
    [send],
  );

  const confidence = state.confidence;
  const confide = useCallback(
    (problem_id: string, level: Level | null, reason: string | null) => {
      if (!confidence || confidence.problem_id !== problem_id) return;
      // What they tapped shows in the chat in the table's words, so the tutor's reply reads in
      // context. The event itself carries the codes (R-30); their words stay in React state (P-1).
      const words = [level === null ? null : levelText(level), reason === null ? null : choiceText(confidence.kind, reason)].filter((w) => w !== null);
      if (words.length > 0) dispatch({ type: "child_said", id: `k${++childMessages.current}`, text: words.join(". ") });
      dispatch({ type: "confidence_sent", level });
      send({ type: "confidence", problem_id, level, reason });
    },
    [confidence, send],
  );

  return {
    state,
    isMock,
    start,
    say,
    answer,
    step,
    confidence: confide,
    hint: (problem_id: string) => {
      dispatch({ type: "child_said", id: `k${++childMessages.current}`, text: "Can I get a hint?" });
      send({ type: "hint_requested", problem_id });
    },
    resume: () => {
      dispatch({ type: "close_overlay" });
      send({ type: "resume" });
    },
    takeBreak: (seconds: number) => dispatch({ type: "take_break", until: Date.now() + seconds * 1000 }),
    closeOverlay: () => dispatch({ type: "close_overlay" }),
    end: () => send({ type: "end_session" }),
    restart: () => {
      stop();
      dispatch({ type: "restart" });
    },
    demo: (trigger: DemoTrigger) => transport.current?.demo?.(trigger),
    puzzleMove,
    puzzleHint: (instance_id: string) => {
      dispatch({ type: "child_said", id: `k${++childMessages.current}`, text: "Can I get a hint?" });
      send({ type: "puzzle_hint", instance_id });
    },
    next: () => {
      dispatch({ type: "continue_sent" });
      send({ type: "continue" });
    },
    puzzleNext: (instance_id: string) => {
      dispatch({ type: "puzzle_next_sent" });
      send({ type: "puzzle_next", instance_id });
    },
    pickColors: (colors: PaletteId) => send({ type: "slot_pick", colors }),
  };
}
