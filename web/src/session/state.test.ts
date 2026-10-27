import { describe, expect, it } from "vitest";
import type { BalancePuzzle, Puzzle } from "../content/types";
import { SKINS } from "../mock/puzzles";
import type { PrimerState, ServerEvent, StepResult } from "../protocol";
import { initialState, platyIsTyping, reducer, type SessionState } from "./state";

const live = (): SessionState => reducer(initialState, { type: "started" });

describe("session reducer", () => {
  it("appends streamed deltas to one tutor bubble", () => {
    let s = live();
    s = reducer(s, { type: "server", event: { type: "tutor_message", message_id: "t1", delta: "Hi ", done: false } });
    s = reducer(s, { type: "server", event: { type: "tutor_message", message_id: "t1", delta: "there", done: true } });
    expect(s.messages).toEqual([{ id: "t1", from: "tutor", text: "Hi there", streaming: false }]);
  });

  it("keeps a streamed reply in one bubble when the child speaks mid-stream", () => {
    let s = live();
    s = reducer(s, { type: "server", event: { type: "tutor_message", message_id: "t1", delta: "What does ", done: false } });
    s = reducer(s, { type: "child_said", id: "k1", text: "I think line 1 is wrong." });
    s = reducer(s, { type: "server", event: { type: "tutor_message", message_id: "t1", delta: "that do?", done: true } });
    expect(s.messages.map((m) => [m.id, m.text])).toEqual([["t1", "What does that do?"], ["k1", "I think line 1 is wrong."]]);
  });

  it("clears the conversation on a hard reset (R-17)", () => {
    let s = live();
    s = reducer(s, { type: "child_said", id: "k1", text: "x = 5" });
    s = reducer(s, { type: "server", event: { type: "reset", reason: "problem_end" } });
    expect(s.messages).toEqual([]);
    expect(s.problem).toBeNull();
    expect(s.resetNote).not.toBeNull();
  });

  it("drops everything the child said when the session errors (P-3)", () => {
    let s = live();
    s = reducer(s, { type: "child_said", id: "k1", text: "secret canary" });
    s = reducer(s, { type: "server", event: { type: "error", code: "socket_closed" } });
    expect(JSON.stringify(s)).not.toContain("secret canary");
    expect(s.phase).toBe("error");
  });

  describe("puzzles", () => {
    const scale: BalancePuzzle = {
      template: "balance", item_id: "lin2-balance", instance_id: "balance-1", skill_id: "two_step_equations",
      instructions: "Get one kit bag alone without tipping the scale.", equation: "3x + 5 = 20", skin: SKINS.soccer,
      start: { left: { x: 3, units: 5 }, right: { x: 0, units: 20 } },
    };
    const show = (s: SessionState, puzzle: Puzzle) => reducer(s, { type: "server", event: { type: "puzzle", puzzle } });
    const verdict = (s: SessionState, check: "move" | "solved", outcome: "correct" | "incorrect") =>
      reducer(s, { type: "server", event: { type: "puzzle_result", instance_id: "balance-1", check, outcome } });
    const take = (n: number) => ({ type: "puzzle_move_sent" as const, move: { check: "move" as const, move: { op: "remove_units" as const, n } } });

    it("draws a scale move only once the server accepts it", () => {
      let s = show(live(), scale);
      s = reducer(s, take(5));
      expect(s.puzzle?.pans).toEqual(scale.start);
      s = verdict(s, "move", "correct");
      expect(s.puzzle?.pans).toEqual({ left: { x: 3, units: 0 }, right: { x: 0, units: 15 } });
      s = reducer(s, { type: "puzzle_move_sent", move: { check: "move", move: { op: "split", groups: 2 } } });
      s = verdict(s, "move", "incorrect");
      expect(s.puzzle).toMatchObject({ pans: { left: { x: 3, units: 0 } }, pending: null, last: { check: "move", outcome: "incorrect" } });
    });

    it("holds every kind of move until its verdict, so a second tap can't overtake it", () => {
      const spot: Puzzle = {
        template: "spot_the_error", item_id: "lin2-undo-sign-spot-error", instance_id: "spot-1",
        skill_id: "two_step_equations", instructions: "One line is wrong.", equation: "2x - 7 = 9",
        skin: SKINS.soccer, lines: ["2x = 2", "x = 1"],
      };
      let s = show(live(), spot);
      s = reducer(s, { type: "puzzle_move_sent", move: { check: "found_error", line: 1 } });
      expect(s.puzzle?.pending).toEqual({ check: "found_error", line: 1 });
      s = reducer(s, { type: "server", event: { type: "puzzle_result", instance_id: "spot-1", check: "found_error", outcome: "incorrect" } });
      expect(s.puzzle?.pending).toBeNull();
    });

    it("keeps progress when the same puzzle comes back in a new skin (R-38)", () => {
      let s = show(live(), scale);
      s = reducer(s, take(5));
      s = verdict(s, "move", "correct");
      s = show(s, { ...scale, skin: { ...SKINS.gaming, colors: "green_gold" } });
      expect(s.puzzle?.pans?.right.units).toBe(15);
      expect(s.puzzle?.puzzle.skin.team_name).toBe(SKINS.gaming.team_name);
      // A new instance starts fresh.
      s = show(s, { ...scale, instance_id: "balance-2" });
      expect(s.puzzle?.pans).toEqual(scale.start);
    });

    it("finishes a worked example on its last faded step", () => {
      const solo: Puzzle = {
        template: "worked_example", item_id: "lin2-worked-example", instance_id: "worked-1", skill_id: "two_step_equations",
        instructions: "Solve it one step at a time.", equation: "3x + 5 = 20", skin: SKINS.soccer, steps: [null, null], why: null,
      };
      const step = (check: "first_step" | "final_answer") => ({
        type: "server" as const, event: { type: "puzzle_result" as const, instance_id: "worked-1", check, outcome: "correct" as const },
      });
      let s = reducer(show(live(), solo), step("first_step"));
      expect(s.puzzle?.done).toBe(false);
      s = reducer(s, step("final_answer"));
      expect(s.puzzle?.done).toBe(true);
    });

    it("is done once solved, and gone after puzzle_done or a reset", () => {
      let s = verdict(show(live(), scale), "solved", "correct");
      expect(s.puzzle?.done).toBe(true);
      expect(reducer(s, { type: "server", event: { type: "puzzle_done", instance_id: "balance-1" } }).puzzle).toBeNull();
      expect(reducer(s, { type: "server", event: { type: "reset", reason: "problem_end" } }).puzzle).toBeNull();
    });

    it("holds the chat from keep going until the next problem, so nothing lands on the wrong one", () => {
      const problem = {
        type: "problem" as const, problem_id: "p1", skill_id: "s", prompt: "3x + 5 = 20", instruction: "Solve", format: "answer" as const, kind: "practice" as const,
        position: 1, total: 3,
      };
      let s = verdict(show(live(), scale), "solved", "correct");
      expect(s.moving).toBe(false);
      s = reducer(s, { type: "puzzle_next_sent" });
      expect(s.moving).toBe(true);
      // A new look for the same puzzle doesn't count as arriving somewhere new.
      s = show(s, { ...scale, skin: SKINS.gaming });
      s = reducer(s, { type: "server", event: { type: "puzzle_done", instance_id: "balance-1" } });
      s = reducer(s, { type: "server", event: { type: "reset", reason: "problem_end" } });
      expect(s.moving).toBe(true);
      s = reducer(s, { type: "server", event: problem });
      expect(s.moving).toBe(false);
      // The same holds after a solved problem, and a new puzzle ends it too.
      s = reducer(s, { type: "server", event: { type: "answer_result", problem_id: "p1", result: "correct" } });
      expect(s.moving).toBe(true);
      expect(show(s, { ...scale, instance_id: "balance-2" }).moving).toBe(false);
    });

    it("shows the student's answer to the reflection question, and notes it was answered (R-03)", () => {
      // Teen test 2026-10-26: "I wrote my answer and it just disappeared."
      let s = verdict(show(live(), scale), "solved", "correct");
      expect(s.puzzle?.explained).toBe(false);
      s = reducer(s, { type: "child_said", id: "k1", text: "you take the 5 off first" });
      expect(s.messages.at(-1)).toEqual({ id: "k1", from: "child", text: "you take the 5 off first", streaming: false });
      expect(s.puzzle?.explained).toBe(true);
      s = reducer(s, { type: "server", event: { type: "tutor_message", message_id: "t1", delta: "Thanks.", done: true } });
      expect(s.messages.map((m) => m.from)).toEqual(["child", "tutor"]);
      // It goes with the page at the next reset (A-4), not before.
      expect(reducer(s, { type: "server", event: { type: "reset", reason: "problem_end" } }).messages).toEqual([]);
    });

    it("doesn't count a message mid-puzzle as the reflection answer", () => {
      const s = reducer(show(live(), scale), { type: "child_said", id: "k1", text: "help" });
      expect(s.puzzle?.explained).toBe(false);
    });

    it("ignores verdicts for another puzzle", () => {
      const s = show(live(), scale);
      const other = reducer(s, { type: "server", event: { type: "puzzle_result", instance_id: "x", check: "solved", outcome: "correct" } });
      expect(other).toBe(s);
    });
  });

  describe("step-by-step problems (R-48)", () => {
    const stepProblem = {
      type: "problem" as const, problem_id: "s1", skill_id: "two_step_equations", prompt: "2x + 5 = 17",
      instruction: "Solve it one line at a time", format: "steps" as const, kind: "practice" as const, position: 1, total: 2,
    };
    const at = () => reducer(reducer(initialState, { type: "started" }), { type: "server", event: stepProblem });
    const result = (s: SessionState, line: number, r: StepResult, slip?: string) =>
      reducer(s, { type: "server", event: { type: "step_result", problem_id: "s1", line, result: r, ...(slip ? { slip } : {}) } });

    it("opens with no lines, and none for an answer-box problem", () => {
      expect(at().steps).toEqual({ problem_id: "s1", lines: [], pending: null, marked: null, solved: false });
      expect(reducer(at(), { type: "server", event: { ...stepProblem, format: "answer" } }).steps).toBeNull();
    });

    it("adds a line only once the server accepts it", () => {
      let s = reducer(at(), { type: "step_sent", text: "2x = 12" });
      expect(s.steps?.pending).toBe("2x = 12");
      expect(s.steps?.lines).toEqual([]);
      s = result(s, 1, "valid");
      expect(s.steps).toMatchObject({ lines: ["2x = 12"], pending: null, marked: null, solved: false });
    });

    it("marks a wrong line and keeps it until the next try, without adding it", () => {
      let s = result(reducer(at(), { type: "step_sent", text: "2x = 22" }), 1, "invalid");
      expect(s.steps).toMatchObject({ lines: [], pending: null });
      expect(s.steps?.marked).toEqual({ text: "2x = 22", result: "invalid" });
      s = reducer(s, { type: "step_sent", text: "2x = 12" });
      expect(s.steps?.marked).toBeNull();
    });

    it("keeps the slip a wrong line matched, for its hint (R-40)", () => {
      const s = result(reducer(at(), { type: "step_sent", text: "2x = 22" }), 1, "invalid", "constant_moved_without_undoing");
      expect(s.steps?.marked).toEqual({ text: "2x = 22", result: "invalid", slip: "constant_moved_without_undoing" });
    });

    it("counts a solved line, and holds the chat for the next problem", () => {
      const s = result(reducer(at(), { type: "step_sent", text: "x = 6" }), 1, "solved");
      expect(s.steps).toMatchObject({ lines: ["x = 6"], solved: true });
      expect(s.solved).toBe(1);
      expect(s.moving).toBe(true);
      expect(reducer(s, { type: "step_sent", text: "x = 7" })).toBe(s);
    });

    it("sends one line at a time and ignores a verdict for any other line", () => {
      const s = reducer(at(), { type: "step_sent", text: "2x = 12" });
      expect(reducer(s, { type: "step_sent", text: "x = 6" })).toBe(s);
      expect(result(s, 2, "valid")).toBe(s);
      const fresh = at();
      expect(result(fresh, 1, "valid")).toBe(fresh);
    });

    it("drops the lines on a reset", () => {
      const s = result(reducer(at(), { type: "step_sent", text: "2x = 12" }), 1, "valid");
      expect(reducer(s, { type: "server", event: { type: "reset", reason: "problem_end" } }).steps).toBeNull();
    });
  });

  // R-42: the demo primer view. Codes and numbers only, kept across resets, gone with the session.
  describe("primer view (R-42)", () => {
    const primer = (code: string, reason: string, p = 0.4): ServerEvent => ({
      type: "primer_state",
      mastery: [{ skill_id: "two_step_equations", p }],
      hypothesis: { code: "suspects_gap", skill_id: "one_step_equations" },
      move: { code, reason, skill_id: "one_step_equations" },
    });

    it("holds the latest primer state, counts each one, and logs the latest moves newest first", () => {
      let s = live();
      expect(s.primer).toBeNull();
      s = reducer(s, { type: "server", event: primer("probe", "probe_prerequisite") });
      s = reducer(s, { type: "server", event: primer("teach", "gap_found", 0.3) });
      const { type: _type, ...latest } = primer("teach", "gap_found", 0.3) as { type: "primer_state" } & PrimerState;
      expect(s.primer?.state).toEqual(latest);
      expect(s.primer?.seq).toBe(2);
      expect(s.primer?.log.map((l) => [l.seq, l.move.code])).toEqual([[2, "teach"], [1, "probe"]]);
      for (let i = 0; i < 6; i++) s = reducer(s, { type: "server", event: primer("probe", "probe_deeper") });
      expect(s.primer?.log).toHaveLength(3);
    });

    it("keeps the primer view through a hard reset, and drops it when the session ends or errors", () => {
      let s = reducer(live(), { type: "server", event: primer("probe", "probe_prerequisite") });
      s = reducer(s, { type: "server", event: { type: "reset", reason: "problem_end" } });
      expect(s.primer?.seq).toBe(1);
      expect(reducer(s, { type: "server", event: { type: "session_end", solved: 1 } }).primer).toBeNull();
      expect(reducer(s, { type: "server", event: { type: "error", code: "socket_closed" } }).primer).toBeNull();
      expect(reducer(s, { type: "started" }).primer).toBeNull();
    });
  });

  describe("detours that wait for a tap (R-01)", () => {
    it("holds the label of the way on until the student taps, then waits for what's next", () => {
      let s = live();
      s = reducer(s, { type: "server", event: { type: "next_up", label: "Quick check" } });
      expect(s.nextUp).toBe("Quick check");
      s = reducer(s, { type: "continue_sent" });
      expect(s.nextUp).toBeNull();
      expect(s.moving).toBe(true);
    });

    it("drops the button at a reset, a new problem or the session's end", () => {
      const up = reducer(live(), { type: "server", event: { type: "next_up", label: "Quick check" } });
      expect(reducer(up, { type: "server", event: { type: "reset", reason: "topic_switch" } }).nextUp).toBeNull();
      const problem = {
        type: "problem" as const, problem_id: "q", skill_id: "s", prompt: "x - 8 = -3", instruction: "Solve for x",
        format: "answer" as const, kind: "probe" as const, position: 0, total: 5,
      };
      expect(reducer(up, { type: "server", event: problem }).nextUp).toBeNull();
      expect(reducer(up, { type: "server", event: { type: "session_end", solved: 0 } }).nextUp).toBeNull();
    });

    it("ignores a tap when nothing waits", () => {
      const s = live();
      expect(reducer(s, { type: "continue_sent" })).toBe(s);
    });
  });

  // R-30: the one metacognition beat. The server's check carries codes; the reducer keeps the
  // beat's level and the verdict that follows, as numbers, for the one line on Your map.
  describe("confidence check (R-30)", () => {
    const problem = (problem_id: string, format: "answer" | "steps" = "answer") => ({
      type: "server" as const,
      event: {
        type: "problem" as const, problem_id, skill_id: "two_step_equations", prompt: "2x + 5 = 17", instruction: "Solve",
        format, kind: "practice" as const, position: 1, total: 2,
      },
    });
    const check = (problem_id: string, kind: "how_sure" | "key_step" = "how_sure"): ServerEvent => ({
      type: "confidence_check", problem_id, kind, choices: kind === "how_sure" ? ["checked_back", "felt_right"] : ["undo_first"],
    });
    const verdict = (problem_id: string, result: "correct" | "incorrect"): ServerEvent => ({ type: "answer_result", problem_id, result });
    const line = (result: StepResult): ServerEvent => ({ type: "step_result", problem_id: "s1", line: 1, result });
    /** A problem on screen with a how_sure check waiting on its card. */
    const waiting = (problem_id = "g1", format: "answer" | "steps" = "answer") =>
      reducer(reducer(live(), problem(problem_id, format)), { type: "server", event: check(problem_id) });

    it("puts the check on the card of the problem on screen, and ignores one about any other", () => {
      expect(waiting().confidence).toEqual({ problem_id: "g1", kind: "how_sure", choices: ["checked_back", "felt_right"] });
      const other = reducer(live(), problem("g1"));
      expect(reducer(other, { type: "server", event: check("g2") })).toBe(other);
      const none = live();
      expect(reducer(none, { type: "server", event: check("g1") })).toBe(none);
    });

    it("records how sure they said, then the verdict that follows", () => {
      const s = reducer(waiting(), { type: "confidence_sent", level: 2 });
      expect(s.confidence).toBeNull();
      expect(s.calibration).toEqual({ level: 2, right: null });
      expect(reducer(s, { type: "server", event: verdict("g1", "correct") }).calibration).toEqual({ level: 2, right: true });
      expect(reducer(s, { type: "server", event: verdict("g1", "incorrect") }).calibration).toEqual({ level: 2, right: false });
      // On a step-by-step card the verdict is the line's: solved or marked. A valid line isn't it yet.
      const t = reducer(reducer(waiting("s1", "steps"), { type: "confidence_sent", level: 3 }), { type: "step_sent", text: "x = 6" });
      expect(reducer(t, { type: "server", event: line("solved") }).calibration).toEqual({ level: 3, right: true });
      expect(reducer(t, { type: "server", event: line("invalid") }).calibration).toEqual({ level: 3, right: false });
      expect(reducer(t, { type: "server", event: line("valid") }).calibration).toEqual({ level: 3, right: null });
    });

    it("knows the verdict already when the beat comes after it, before the session closes", () => {
      let s = reducer(reducer(live(), problem("p3")), { type: "server", event: verdict("p3", "correct") });
      s = reducer(reducer(s, { type: "server", event: check("p3") }), { type: "confidence_sent", level: 1 });
      expect(s.calibration).toEqual({ level: 1, right: true });
    });

    it("keeps the one beat's verdict, and takes no level from a key-step pick", () => {
      let s = reducer(reducer(waiting(), { type: "confidence_sent", level: 3 }), { type: "server", event: verdict("g1", "correct") });
      // A wrong answer on a later problem doesn't rewrite it.
      s = reducer(reducer(s, problem("g2")), { type: "server", event: verdict("g2", "incorrect") });
      expect(s.calibration).toEqual({ level: 3, right: true });
      s = reducer(s, { type: "server", event: check("g2", "key_step") });
      expect(s.confidence).toMatchObject({ kind: "key_step", choices: ["undo_first"] });
      s = reducer(s, { type: "confidence_sent", level: null });
      expect(s.confidence).toBeNull();
      expect(s.calibration).toEqual({ level: 3, right: true });
    });

    it("ignores an answer when no check is waiting", () => {
      const s = reducer(live(), problem("g1"));
      expect(reducer(s, { type: "confidence_sent", level: 3 })).toBe(s);
    });

    it("goes with its problem: a new problem, a reset or the session's end drops it", () => {
      expect(reducer(waiting(), problem("g2")).confidence).toBeNull();
      expect(reducer(waiting(), { type: "server", event: { type: "reset", reason: "problem_end" } }).confidence).toBeNull();
      expect(reducer(waiting(), { type: "server", event: { type: "session_end", solved: 1 } }).confidence).toBeNull();
    });

    it("carries the beat's numbers to the end screen, and no further", () => {
      let s = reducer(reducer(waiting(), { type: "confidence_sent", level: 2 }), { type: "server", event: verdict("g1", "correct") });
      s = reducer(s, { type: "server", event: { type: "reset", reason: "problem_end" } });
      expect(s.calibration).toEqual({ level: 2, right: true });
      const end = reducer(s, { type: "server", event: { type: "session_end", solved: 1 } });
      expect(end.calibration).toEqual({ level: 2, right: true });
      expect(reducer(end, { type: "started" }).calibration).toBeNull();
      expect(reducer(s, { type: "server", event: { type: "error", code: "socket_closed" } }).calibration).toBeNull();
    });

    it("holds codes and numbers only, never what the student typed", () => {
      let s = reducer(waiting(), { type: "child_said", id: "k1", text: "canary-5150 i checked it" });
      expect(JSON.stringify(s.confidence)).not.toContain("canary");
      s = reducer(s, { type: "confidence_sent", level: 3 });
      expect(JSON.stringify(s.calibration)).toBe('{"level":3,"right":null}');
    });
  });

  describe("Platy's typing dots", () => {
    const msg = (from: "tutor" | "child") => ({ id: from, from, text: "hi", streaming: false });
    it("show only while a reply to the student is due", () => {
      expect(platyIsTyping([msg("tutor"), msg("child")], null)).toBe(true);
      expect(platyIsTyping([msg("child"), msg("tutor")], null)).toBe(false);
      // An empty chat after a new page has nothing more coming: no dots running on.
      expect(platyIsTyping([], null)).toBe(false);
      expect(platyIsTyping([msg("child")], "Quick check")).toBe(false);
    });
  });
});
