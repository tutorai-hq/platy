import type { Puzzle } from "../content/types";
import { STEP_LESSON } from "../mock/script";
import type { ClientEvent, PrimerState, Problem, ServerEvent } from "../protocol";
import { type MockTiming, MockTransport } from "../transport/mock";
import { type Fixture, SimStudent } from "./student";

// Runs one simulated student through the mock transport (R-01): the two step-by-step lesson
// problems, with whatever probes, explanations, repairs and fresh problems the mock primer
// adds. Nothing is written anywhere; the result is numbers, ids and codes (P-13).

const FAST: MockTiming = { thinkMs: 0, wordMs: 0, resetMs: 0 };

/** How a node went for one student: its first lesson problem solved with no miss, and its fresh problem likewise. */
export interface NodeOutcome {
  first_try: boolean | null;
  fresh: boolean | null;
}

export interface StudentResult {
  id: string;
  planted: string[];
  slips: string[];
  expected: Fixture["expected"];
  /** The skill the primer's `gap_found` hypothesis named, or null. */
  found: string | null;
  /** Quick checks the primer ran. */
  probes: number;
  /** Items shown, in order, each once. */
  items: string[];
  repairs: number;
  teaches: number;
  /** `code:reason:skill` for every primer move. */
  moves: string[];
  nodes: Record<string, NodeOutcome>;
  learned: { taught: string[]; repaired: string[] };
  solved: number;
  /** The session ended on its own; false means the turn cap stopped it. */
  finished: boolean;
  turns: number;
}

/** What's on the student's screen, kept from the events. */
interface Screen {
  problem: Problem | null;
  accepted: string[];
  /** The line just sent, until its verdict. */
  sent: string | null;
  solved: boolean;
  puzzle: Puzzle | null;
  nextUp: string | null;
  beat: { problem_id: string; kind: "how_sure" | "key_step"; choices: string[] } | null;
  paused: boolean;
  ended: boolean;
}

const isProbe = (m: PrimerState["move"]) => m.code === "probe" && m.reason.startsWith("probe_") && m.reason !== "probe_passed";

/** A whole run of the lesson with its detours takes under 20 turns; the cap stops a student the mock can't help. */
export const TURN_CAP = 80;

export async function runStudent(fixture: Fixture, seed = 20261018, maxTurns = TURN_CAP): Promise<StudentResult> {
  const student = new SimStudent(fixture);
  const screen: Screen = { problem: null, accepted: [], sent: null, solved: false, puzzle: null, nextUp: null, beat: null, paused: false, ended: false };
  const result: StudentResult = {
    id: fixture.id, planted: [...fixture.gaps], slips: [...fixture.slips], expected: fixture.expected, found: null, probes: 0, items: [], repairs: 0,
    teaches: 0, moves: [], nodes: {}, learned: { taught: [], repaired: [] }, solved: 0, finished: false, turns: 0,
  };
  // The explanation or repair on screen, so the student learns from it when it finishes.
  let teaching: string | null = null;
  let repairing: string | null = null;
  let lastSlip: string | null = null;
  // Problems already judged: right means solved with no wrong line or answer on the way.
  const judged = new Set<string>();

  const judge = (p: Problem, verdict: "wrong" | "done") => {
    if (judged.has(p.problem_id) || p.kind !== "practice" || p.position === 0) return;
    judged.add(p.problem_id);
    const right = verdict === "done";
    const node = (result.nodes[p.skill_id] ??= { first_try: null, fresh: null });
    if (p.problem_id.startsWith("g")) node.fresh ??= right;
    else node.first_try ??= right;
  };

  const onEvent = (e: ServerEvent) => {
    switch (e.type) {
      case "problem": {
        const { type: _type, ...problem } = e;
        screen.problem = problem;
        screen.accepted = [];
        screen.sent = null;
        screen.solved = false;
        if (problem.kind === "practice" && problem.position > 0) result.nodes[problem.skill_id] ??= { first_try: null, fresh: null };
        return;
      }
      case "reset":
        screen.problem = null;
        screen.accepted = [];
        screen.solved = false;
        return;
      case "step_result": {
        const p = screen.problem;
        if (!p || p.problem_id !== e.problem_id) return;
        const right = e.result === "valid" || e.result === "solved";
        if (!right) judge(p, "wrong");
        if (right && screen.sent !== null) screen.accepted.push(screen.sent);
        if (e.result === "solved") {
          screen.solved = true;
          judge(p, "done");
        }
        if (e.slip) lastSlip = e.slip;
        screen.sent = null;
        return;
      }
      case "answer_result": {
        const p = screen.problem;
        if (!p || p.problem_id !== e.problem_id) return;
        if (e.result === "correct") {
          screen.solved = true;
          judge(p, "done");
        } else if (e.result !== "unreadable") {
          judge(p, "wrong");
        }
        return;
      }
      case "puzzle":
        screen.puzzle = e.puzzle;
        if (!result.items.includes(e.puzzle.item_id)) result.items.push(e.puzzle.item_id);
        return;
      case "puzzle_done":
        screen.puzzle = null;
        // The planted learning: the gap taught, the slip repaired.
        if (teaching !== null) student.taught(teaching);
        if (repairing !== null && lastSlip !== null) student.repaired(lastSlip);
        teaching = null;
        repairing = null;
        return;
      case "next_up":
        screen.nextUp = e.label;
        return;
      case "confidence_check":
        screen.beat = { problem_id: e.problem_id, kind: e.kind, choices: e.choices };
        return;
      case "pause_suggested":
        screen.paused = true;
        return;
      case "primer_state": {
        const m = e.move;
        result.moves.push(`${m.code}:${m.reason}:${m.skill_id}`);
        if (isProbe(m)) result.probes++;
        if (m.code === "teach") {
          result.teaches++;
          teaching = m.skill_id;
        }
        if (m.code === "repair") {
          result.repairs++;
          repairing = m.skill_id;
        }
        if (e.hypothesis?.code === "gap_found") result.found = e.hypothesis.skill_id;
        return;
      }
      case "session_end":
        screen.ended = true;
        result.solved = e.solved;
        return;
      default:
        return;
    }
  };

  const t = new MockTransport(FAST, seed, [...STEP_LESSON]);
  void t.start("tutoring", onEvent);
  const send = (e: ClientEvent) => t.send(e);

  for (; result.turns < maxTurns; result.turns++) {
    await t.whenIdle();
    if (screen.ended) break;
    if (screen.beat) {
      // Certain, because they checked: the beat is about the student, not the bench.
      const { problem_id, kind, choices } = screen.beat;
      screen.beat = null;
      send({ type: "confidence", problem_id, level: kind === "how_sure" ? 3 : null, reason: choices[0] ?? null });
    } else if (screen.paused) {
      screen.paused = false;
      send({ type: "resume" });
    } else if (screen.nextUp !== null) {
      screen.nextUp = null;
      send({ type: "continue" });
    } else if (screen.puzzle) {
      // The student goes through the item; the bench doesn't play puzzles, it counts them.
      t.demo("skip");
    } else if (screen.problem && !screen.solved) {
      const p = screen.problem;
      if (p.format === "steps") {
        const line = student.line(p, screen.accepted);
        screen.sent = line;
        send({ type: "step", problem_id: p.problem_id, line: screen.accepted.length + 1, text: line });
      } else {
        send({ type: "answer", problem_id: p.problem_id, text: student.answer(p) });
      }
    } else {
      // Nothing to answer and nothing coming: the mock is waiting for something the bench doesn't send.
      break;
    }
  }
  t.close();
  result.finished = screen.ended;
  result.learned = student.learned();
  return result;
}
