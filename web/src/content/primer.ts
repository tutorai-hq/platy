import skillMap from "../../../src/platy/skills/data/skill_map.json";
import type { PrimerState } from "../protocol";
import table from "./primer.json";

// The words of the demo primer view (R-42). The server sends codes; this table is the only place
// their text comes from, so an unknown code or skill shows nothing rather than whatever was sent.

const NAMES: ReadonlyMap<string, string> = new Map(skillMap.nodes.map((n) => [n.id, n.name]));

type Kind = "moves" | "reasons" | "hypotheses";
const TABLES: Record<Kind, Readonly<Record<string, string>>> = {
  moves: table.moves,
  reasons: table.reasons,
  hypotheses: table.hypotheses,
};

export function skillName(id: string): string | null {
  return NAMES.get(id) ?? null;
}

/** The text for a code, with {skill} filled in; null for an unknown code or skill. */
export function primerText(kind: Kind, code: string, skill_id: string): string | null {
  const text = Object.hasOwn(TABLES[kind], code) ? TABLES[kind][code] : undefined;
  if (text === undefined) return null;
  if (!text.includes("{skill}")) return text;
  const name = skillName(skill_id);
  if (name === null) return null;
  // The first word of a line is capitalised; a skill name mid-line is lower case.
  return text.replaceAll("{skill}", (_m, at: number) => (at === 0 ? name : name.toLowerCase()));
}

/** The panel's rows: known skills only, p clamped to 0 to 1. */
export function masteryRows(state: PrimerState): { skill_id: string; name: string; p: number }[] {
  return state.mastery.flatMap(({ skill_id, p }) => {
    const name = skillName(skill_id);
    return name === null || !Number.isFinite(p) ? [] : [{ skill_id, name, p: Math.min(1, Math.max(0, p)) }];
  });
}

export const PRIMER_CODES = {
  moves: Object.keys(table.moves),
  reasons: Object.keys(table.reasons),
  hypotheses: Object.keys(table.hypotheses),
};
