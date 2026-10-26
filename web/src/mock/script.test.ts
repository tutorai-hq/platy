import { describe, expect, it } from "vitest";
import words from "../content/map.json";
import * as puzzles from "./puzzles";
import * as script from "./script";

// Teen test 2026-10-26 (R-06): the fixed lines are what the demo shows, and testers stumbled on
// long ones and on idioms ("Fresh page", "You've got this"). Every tutor line is at most two
// sentences and 25 words, in plain words, and a nudge never praises what Platy couldn't read.

const BANNED = [
  "fresh page", "all yours", "you've got this", "stuck with", "fills in", "groove", "hunch", "stubborn",
  "hand it over", "give it a go", "right here", "makes it stick", "fix sticks", "so close", "nail it",
  "piece of cake", "hang in", "way to go", "walking me through", "get the hang",
];
const PRAISE = ["good thinking", "i like", "great", "nice", "smart", "clever", "love"];

// Not tutor lines: ids, the math itself, the card's headings, the test screens and the safety panel.
const SKIP_KEYS = new Set(["problem_id", "skill_id", "prompt", "instruction", "item_id", "template", "format", "variable", "schema_version", "about"]);
const SKIP_EXPORTS = new Set(["TEST_TITLE", "TEST_INTRO", "TEST_DONE", "TEST_NOTE", "TEST_INSTRUCTIONS", "SAFETY_RESOURCES"]);

function collect(value: unknown, path: string, out: [string, string][]): void {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => collect(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) if (!SKIP_KEYS.has(k)) collect(v, `${path}.${k}`, out);
  }
}

const LINES: [string, string][] = [];
for (const [name, value] of Object.entries(script)) {
  if (typeof value !== "function" && !SKIP_EXPORTS.has(name)) collect(value, name, LINES);
}
collect(script.confirmProblem("g1", "two_step_equations", "4x + 3 = 19", 4, "4"), "confirmProblem", LINES);
collect(script.probeProblem("one_step_equations"), "probeProblem", LINES);
for (const name of ["ITEMS", "WORKED_FADES", "WALKTHROUGH"] as const) collect(puzzles[name], name, LINES);
collect(words.encouragement, "map.encouragement", LINES);

// A $math$ span or a {slot} counts as one word.
const plain = (line: string) => line.replace(/\$[^$]*\$/g, " M ").replace(/\{\w+\}/g, " S ");
const wordsIn = (line: string) => (plain(line).match(/\S+/g) ?? []).length;
const sentencesIn = (line: string) => Math.max(1, (plain(line).match(/[.!?]+(\s|$)/g) ?? []).length);

describe("the tutor's fixed lines (R-06)", () => {
  it("covers the script, the puzzles and the map", () => {
    expect(LINES.length).toBeGreaterThan(100);
  });

  it("are at most two sentences and 25 words each", () => {
    const long = LINES.filter(([, line]) => sentencesIn(line) > 2 || wordsIn(line) > 25).map(([path, line]) => `${path}: ${line}`);
    expect(long).toEqual([]);
  });

  it("use plain words a second-language reader can follow", () => {
    const idioms = LINES.flatMap(([path, line]) => BANNED.filter((b) => line.toLowerCase().includes(b)).map((b) => `${path} has "${b}": ${line}`));
    expect(idioms).toEqual([]);
  });

  it("never praise a message Platy couldn't read", () => {
    for (const line of [...script.NUDGES, script.PUZZLE_NUDGE, script.OFF_TOPIC]) {
      for (const p of PRAISE) expect(line.toLowerCase(), line).not.toContain(p);
    }
  });
});
