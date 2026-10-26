import skillMap from "../../../src/platy/skills/data/skill_map.json";
import type { SkillReport } from "../protocol";
import words from "./map.json";

// "Your map" (R-13): the skill map drawn from skill_map.json itself, never a hand-made copy
// (A-6), with each skill's state worked out only from the session's mastery report.

export interface MapNode {
  id: string;
  name: string;
  prerequisites: string[];
  /** The longest chain of prerequisites under it: 0 for a skill with none. */
  layer: number;
  /** Its place within the layer, from 0. */
  row: number;
}

export const NODES: readonly MapNode[] = (() => {
  const byId = new Map(skillMap.nodes.map((n) => [n.id, n]));
  const layers = new Map<string, number>();
  const layerOf = (id: string): number => {
    const known = layers.get(id);
    if (known !== undefined) return known;
    const pre = byId.get(id)?.prerequisites ?? [];
    const layer = pre.length === 0 ? 0 : Math.max(...pre.map(layerOf)) + 1;
    layers.set(id, layer);
    return layer;
  };
  const rows = new Map<number, number>();
  return skillMap.nodes.map((n) => {
    const layer = layerOf(n.id);
    const row = rows.get(layer) ?? 0;
    rows.set(layer, row + 1);
    return { id: n.id, name: n.name, prerequisites: [...n.prerequisites], layer, row };
  });
})();

/** Every prerequisite edge, from the prerequisite to the skill that needs it. */
export const EDGES: readonly { from: string; to: string }[] = NODES.flatMap((n) => n.prerequisites.map((from) => ({ from, to: n.id })));

/** A skill's box, and the grid it sits on: one column per layer, rows with a gap between them. */
export const W = 164;
export const H = 60;
const GAP_X = 36;
const GAP_Y = 18;
const COL = W + GAP_X;
const ROW = H + GAP_Y;

/**
 * Where each box goes. Each layer is centered by whole rows, so the gaps between rows line up
 * across every column and a long edge can run along one without crossing a box.
 */
export const LAYOUT = (() => {
  const layers = Math.max(...NODES.map((n) => n.layer)) + 1;
  const perLayer = (l: number) => NODES.filter((n) => n.layer === l).length;
  const tallest = Math.max(...Array.from({ length: layers }, (_, l) => perLayer(l)));
  const pos = new Map(
    NODES.map((n) => [n.id, { x: n.layer * COL, y: (n.row + Math.floor((tallest - perLayer(n.layer)) / 2)) * ROW }]),
  );
  return { pos, tallest, width: (layers - 1) * COL + W, height: (tallest - 1) * ROW + H };
})();

type Point = [number, number];

/**
 * An edge as cubic segments [start, control, control, end]. Between neighboring layers it's one
 * curve across the gap; a longer edge curves into the nearest gap between rows, runs along it
 * past the columns in between, and curves out to its skill.
 */
export function edgeRoute(from: string, to: string): Point[][] {
  const a = LAYOUT.pos.get(from)!;
  const b = LAYOUT.pos.get(to)!;
  const x1 = a.x + W;
  const y1 = a.y + H / 2;
  const x2 = b.x;
  const y2 = b.y + H / 2;
  const curve = (sx: number, sy: number, ex: number, ey: number): Point[] => {
    const mid = (sx + ex) / 2;
    return [[sx, sy], [mid, sy], [mid, ey], [ex, ey]];
  };
  if (x2 - x1 <= GAP_X) return [curve(x1, y1, x2, y2)];
  const gaps = Array.from({ length: Math.max(1, LAYOUT.tallest - 1) }, (_, k) => (k + 1) * ROW - GAP_Y / 2);
  const g = gaps.reduce((best, y) => (Math.abs(y - (y1 + y2) / 2) < Math.abs(best - (y1 + y2) / 2) ? y : best));
  return [
    curve(x1, y1, x1 + GAP_X, g),
    [[x1 + GAP_X, g], [x1 + GAP_X, g], [x2 - GAP_X, g], [x2 - GAP_X, g]],
    curve(x2 - GAP_X, g, x2, y2),
  ];
}

/** An edge's SVG path. */
export function edgePath(from: string, to: string): string {
  const segs = edgeRoute(from, to);
  const p = (pt: Point) => `${pt[0]} ${pt[1]}`;
  return `M ${p(segs[0]![0]!)} ` + segs.map((s) => `C ${p(s[1]!)}, ${p(s[2]!)}, ${p(s[3]!)}`).join(" ");
}

/** The mastery a skill counts as mastered at. The primer's own threshold would replace it. */
export const MASTERED = 0.8;

export type NodeState =
  | "mastered"
  /** Its prerequisites were mastered during this session. */
  | "unlocked_today"
  /** One step away: a prerequisite went up today and the rest are mastered or went up too. */
  | "next"
  | "due"
  /** Practiced today, not yet mastered. */
  | "learning"
  /** Open to start, not started. */
  | "open"
  | "locked";

export interface NodeView {
  state: NodeState;
  before: number;
  after: number;
  /** Mastery moved this session. */
  moved: boolean;
}

/** Each skill's state, from the session's mastery report alone. A skill it doesn't list is unstarted. */
export function mapStates(report: readonly SkillReport[]): Map<string, NodeView> {
  const r = new Map(report.map((s) => [s.skill_id, s]));
  const clamp = (p: number) => (Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0);
  const before = (id: string) => clamp(r.get(id)?.before ?? 0);
  const after = (id: string) => clamp(r.get(id)?.after ?? 0);
  // A point of mastery counts, with room for floating point (0.41 - 0.40 is under 0.01).
  const POINT = 0.01 - 1e-9;
  const moved = (id: string) => Math.abs(after(id) - before(id)) >= POINT;
  const gained = (id: string) => after(id) - before(id) >= POINT;
  const views = new Map<string, NodeView>();
  for (const n of NODES) {
    const opensAfter = n.prerequisites.every((p) => after(p) >= MASTERED);
    const opensBefore = n.prerequisites.every((p) => before(p) >= MASTERED);
    // One step away only if a prerequisite went up today, never because one went down.
    const close = n.prerequisites.every((p) => after(p) >= MASTERED || gained(p)) && n.prerequisites.some(gained);
    // The primer's review flag comes first: a mastered skill that's fading still needs review.
    const state: NodeState =
      r.get(n.id)?.due ? "due"
      : after(n.id) >= MASTERED ? "mastered"
      : opensAfter && !opensBefore ? "unlocked_today"
      : !opensAfter && close && !moved(n.id) ? "next"
      : moved(n.id) ? "learning"
      : opensAfter ? "open"
      : "locked";
    views.set(n.id, { state, before: before(n.id), after: after(n.id), moved: moved(n.id) });
  }
  return views;
}

/** The one line of encouragement, about effort (skills practiced), from the fixed table. */
export function encouragement(views: Map<string, NodeView>): string {
  const n = [...views.values()].filter((v) => v.moved).length;
  if (n === 0) return words.encouragement.none;
  if (n === 1) return words.encouragement.moved_one;
  return words.encouragement.moved.replace("{n}", String(n));
}
