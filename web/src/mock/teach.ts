import { CATALOG, type ItemDescriptor } from "../content/catalog";
import type { PuzzleTemplate } from "../content/types";

// R-05: when an explanation doesn't land, the next one takes a different angle rather than
// repeating the first. This is the mock's stand-in for the server's item selector (handshake
// plan C.11), which needs the angles tried this session as an input.

/** A teach item the mock can run: one with a player. */
export type TeachItem = ItemDescriptor & { template: PuzzleTemplate };

const teachItems = (node: string): TeachItem[] =>
  CATALOG.filter((d): d is TeachItem => d.role === "teach" && d.skills.primary === node && d.template !== null);

/**
 * The first teach item on `node`, in catalog order, whose angle isn't in `anglesTried`; null once
 * every angle has been used. Catalog order puts the worked example first, so the first time a
 * gap is taught looks the same as before.
 */
export function pickTeachItem(node: string, anglesTried: readonly string[]): TeachItem | null {
  return teachItems(node).find((d) => !anglesTried.includes(d.angle)) ?? null;
}

/** The distinct angles the catalog teaches `node` from, in catalog order. */
export function teachAngles(node: string): string[] {
  return [...new Set(teachItems(node).map((d) => d.angle))];
}
