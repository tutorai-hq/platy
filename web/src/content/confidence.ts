import table from "./confidence.json";

// The words of the confidence check (R-30). The server sends codes; this table is the only place
// their text comes from, so an unknown code shows nothing rather than whatever was sent.

export type Level = 1 | 2 | 3;
export const LEVELS: readonly Level[] = [1, 2, 3];

/** The reason codes a how_sure check offers, and the step codes a key_step check offers. */
export const REASON_CODES: readonly string[] = Object.keys(table.reasons);
export const STEP_CODES: readonly string[] = Object.keys(table.steps);

export const WORDS = {
  how_sure: table.how_sure,
  key_step: table.key_step,
};

export function levelText(level: Level): string {
  return table.levels[String(level) as "1" | "2" | "3"];
}

/** The text for a choice code of a check of `kind`, or null for a code that isn't in the table. */
export function choiceText(kind: "how_sure" | "key_step", code: string): string | null {
  const t: Readonly<Record<string, string>> = kind === "how_sure" ? table.reasons : table.steps;
  return Object.hasOwn(t, code) ? t[code]! : null;
}

/** The one line on Your map about the beat: how sure they said, against the verdict that followed. */
export function calibrationLine(level: Level, right: boolean): string {
  return table.calibration[right ? "right" : "wrong"][String(level) as "1" | "2" | "3"];
}
