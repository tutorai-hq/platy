import data from "./slips.json";

// The slip map (R-40): common wrong steps per skill-map node, each with a short hint and a
// repair item. Plain JSON so the server can load the same file later; this loader only types
// and checks it. The hints are fixed child-facing text, so they live in the data, not in code.

/** A line and what the student wrote after it. `answer` is the right value, where there is one. */
export interface SlipExample {
  prev: string;
  next: string;
  answer?: string;
}

export interface Slip {
  id: string;
  node: string;
  name: string;
  /** What the detector looks for, in words (the real check runs on sympy). */
  rule: string;
  hint: string;
  repair: string;
  examples: SlipExample[];
  correct: SlipExample[];
}

function load(raw: unknown): { slips: Slip[]; toBuild: string[] } {
  const file = raw as { schema_version?: unknown; slips?: unknown; repairs_to_build?: unknown };
  if (file.schema_version !== 1 || !Array.isArray(file.slips) || !Array.isArray(file.repairs_to_build)) {
    throw new Error("slips.json: unexpected shape");
  }
  for (const s of file.slips as Slip[]) {
    const ok = [s.id, s.node, s.name, s.rule, s.hint, s.repair].every((v) => typeof v === "string" && v.length > 0);
    if (!ok || !Array.isArray(s.examples) || !Array.isArray(s.correct)) throw new Error("slips.json: a slip is missing a field");
  }
  return { slips: file.slips as Slip[], toBuild: file.repairs_to_build as string[] };
}

const loaded = load(data);

export const SLIPS: readonly Slip[] = loaded.slips;

/** Repair items slips point at that don't exist yet (prompt 4 builds them). */
export const REPAIRS_TO_BUILD: ReadonlySet<string> = new Set(loaded.toBuild);

const BY_ID = new Map(SLIPS.map((s) => [s.id, s]));

export function slipHint(id: string): string | null {
  return BY_ID.get(id)?.hint ?? null;
}

export function slipRepair(id: string): string | null {
  return BY_ID.get(id)?.repair ?? null;
}
