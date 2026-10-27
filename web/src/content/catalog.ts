import skillMap from "../../../src/platy/skills/data/skill_map.json";
import data from "./catalog.json";
import { SLIPS } from "./slips";
import type { PuzzleTemplate } from "./types";

// The item catalog (R-37): one descriptor per content item, keyed to skill-map node ids (A-6),
// in plain JSON so the server's pydantic model (extra="forbid", frozen) can load the same file
// later. The validator is written by hand and runs when this module loads, so a bad descriptor
// fails the build and the tests instead of reaching a session. The primer reads descriptors
// only, never an item's text or media. docs/proposals/item-descriptor.md says what each field
// means and where the file could live on the server.

export const STATUSES = ["draft", "live"] as const;
export const FORMATS = ["puzzle", "worked_example", "story", "reel"] as const;
export const TEMPLATES = ["spot_the_error", "missing_step", "balance", "worked_example"] as const;
export const ROLES = ["teach", "practice", "repair", "review", "apply", "hook"] as const;
/** How an item explains: a balance scale, undoing, a worked solution, a story, a picture, or a wrong solution to find the slip in. */
export const ANGLES = ["balance", "undo", "worked", "story", "visual", "contrast"] as const;
/** The interest skins the mock has (R-38). "neutral" is the absence of a tag, not a tag. */
export const INTEREST_TAGS = ["soccer", "football", "gaming"] as const;
/** The generators' levels (R-41). */
export const DIFFICULTY = { min: 1, max: 3 } as const;
/** A school grade. */
export const READING_LEVEL = { min: 1, max: 12 } as const;

export type Status = (typeof STATUSES)[number];
export type Format = (typeof FORMATS)[number];
export type Role = (typeof ROLES)[number];
export type Angle = (typeof ANGLES)[number];

export interface ItemDescriptor {
  schema_version: 1;
  /** kebab-case, unique in the catalog. */
  id: string;
  version: number;
  /** Live means the math check passed and a human reviewed it; the mock doesn't gate on it. */
  status: Status;
  format: Format;
  /** The player a puzzle or worked example runs on; null for a format without one. */
  template: PuzzleTemplate | null;
  role: Role;
  /** Skill-map node ids: the skill the item is about, and others in its prerequisite chain it exercises. */
  skills: { primary: string; touches: string[] };
  /** Slip ids (R-40) the item repairs. A repair names at least one. */
  slips: string[];
  angle: Angle;
  /** The generator levels the item runs at, 1 to 3. */
  difficulty: { min: number; max: number };
  /** Empty means any interest, through the item's skins (R-38). */
  interest_tags: string[];
  /** A school grade, whole. An estimate until it's measured. */
  reading_level: number;
}

const FIELDS = [
  "schema_version", "id", "version", "status", "format", "template", "role", "skills", "slips", "angle", "difficulty", "interest_tags", "reading_level",
] as const;
const CATALOG_FIELDS = ["schema_version", "about", "items"] as const;
const PUZZLE_TEMPLATES: readonly string[] = ["spot_the_error", "missing_step", "balance"];

/** What the validator checks against: the skill map's nodes and the slip map. */
export interface CatalogDeps {
  nodes: readonly { id: string; prerequisites: readonly string[] }[];
  slips: readonly { id: string; repair: string }[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isWhole = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");
const oneOf = (v: unknown, list: readonly string[]) => typeof v === "string" && list.includes(v);
const dupes = (list: readonly string[]) => list.filter((s, i) => list.indexOf(s) !== i);

/** Every node's prerequisites, all the way down. */
export function prerequisiteChains(nodes: CatalogDeps["nodes"]): Map<string, Set<string>> {
  const pre = new Map(nodes.map((n) => [n.id, n.prerequisites]));
  const chains = new Map<string, Set<string>>();
  const chainOf = (id: string, seen: string[] = []): Set<string> => {
    const known = chains.get(id);
    if (known) return known;
    const out = new Set<string>();
    for (const p of pre.get(id) ?? []) {
      if (seen.includes(p)) continue; // a cycle in the map is the map's problem, not this item's
      out.add(p);
      for (const q of chainOf(p, [...seen, id])) out.add(q);
    }
    chains.set(id, out);
    return out;
  };
  for (const n of nodes) chainOf(n.id);
  return chains;
}

function validateItem(item: unknown, at: string, chains: Map<string, Set<string>>, slipIds: Set<string>): string[] {
  if (!isRecord(item)) return [`${at}: not an object`];
  const out: string[] = [];
  const say = (what: string) => out.push(`${at}: ${what}`);
  for (const k of Object.keys(item)) if (!(FIELDS as readonly string[]).includes(k)) say(`unknown field ${k}`);
  for (const k of FIELDS) if (!(k in item)) say(`missing ${k}`);
  if (item.schema_version !== 1) say("schema_version must be 1");
  if (typeof item.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.id)) say("id must be kebab-case");
  if (!isWhole(item.version, 1, Number.MAX_SAFE_INTEGER)) say("version must be a whole number from 1");
  if (!oneOf(item.status, STATUSES)) say(`status must be one of ${STATUSES.join(", ")}`);
  if (!oneOf(item.format, FORMATS)) say(`format must be one of ${FORMATS.join(", ")}`);
  if (!oneOf(item.role, ROLES)) say(`role must be one of ${ROLES.join(", ")}`);
  if (!oneOf(item.angle, ANGLES)) say(`angle must be one of ${ANGLES.join(", ")}`);
  if (item.template !== null && !oneOf(item.template, TEMPLATES)) say(`template must be null or one of ${TEMPLATES.join(", ")}`);
  else if (item.format === "puzzle" && !PUZZLE_TEMPLATES.includes(item.template as string)) say("a puzzle's template must be a puzzle player");
  else if (item.format === "worked_example" && item.template !== "worked_example") say("a worked example's template is worked_example");
  else if ((item.format === "story" || item.format === "reel") && item.template !== null) say(`a ${item.format} has no template`);

  const skills = item.skills;
  if (!isRecord(skills) || typeof skills.primary !== "string" || !isStrings(skills.touches) || Object.keys(skills).length !== 2) {
    say("skills must be {primary, touches[]}");
  } else {
    const chain = chains.get(skills.primary);
    if (!chain) say(`skills.primary ${skills.primary} is not a skill-map node`);
    for (const t of skills.touches) {
      if (!chains.has(t)) say(`skills.touches ${t} is not a skill-map node`);
      else if (t === skills.primary) say("skills.touches repeats the primary skill");
      else if (chain && !chain.has(t)) say(`skills.touches ${t} is not a prerequisite of ${skills.primary}`);
    }
    for (const d of dupes(skills.touches)) say(`skills.touches lists ${d} twice`);
  }

  if (!isStrings(item.slips)) say("slips must be a list of slip ids");
  else {
    for (const s of item.slips) if (!slipIds.has(s)) say(`slip ${s} is not in slips.json`);
    for (const d of dupes(item.slips)) say(`slips lists ${d} twice`);
    if (item.role === "repair" && item.slips.length === 0) say("a repair names at least one slip");
  }

  const d = item.difficulty;
  if (!isRecord(d) || Object.keys(d).length !== 2 || !isWhole(d.min, DIFFICULTY.min, DIFFICULTY.max) || !isWhole(d.max, DIFFICULTY.min, DIFFICULTY.max) || d.min > d.max) {
    say(`difficulty must be {min, max} with ${DIFFICULTY.min} <= min <= max <= ${DIFFICULTY.max}`);
  }
  if (!isStrings(item.interest_tags) || item.interest_tags.some((t) => !(INTEREST_TAGS as readonly string[]).includes(t))) {
    say(`interest_tags must be from ${INTEREST_TAGS.join(", ")}`);
  } else for (const t of dupes(item.interest_tags)) say(`interest_tags lists ${t} twice`);
  if (!isWhole(item.reading_level, READING_LEVEL.min, READING_LEVEL.max)) say(`reading_level must be a whole number from ${READING_LEVEL.min} to ${READING_LEVEL.max}`);
  return out;
}

/** Every problem with a catalog, as "item: what". Empty means it's valid. */
export function validateCatalog(raw: unknown, deps: CatalogDeps): string[] {
  if (!isRecord(raw)) return ["catalog: not an object"];
  const out: string[] = [];
  if (raw.schema_version !== 1) out.push("catalog: schema_version must be 1");
  for (const k of Object.keys(raw)) if (!(CATALOG_FIELDS as readonly string[]).includes(k)) out.push(`catalog: unknown field ${k}`);
  if (typeof raw.about !== "string") out.push("catalog: about must be a string");
  if (!Array.isArray(raw.items)) return [...out, "catalog: items must be a list"];
  const chains = prerequisiteChains(deps.nodes);
  const slipIds = new Set(deps.slips.map((s) => s.id));
  const seen = new Map<string, Record<string, unknown>>();
  raw.items.forEach((item: unknown, i) => {
    const id = isRecord(item) && typeof item.id === "string" ? item.id : null;
    const at = id ?? `items[${i}]`;
    const problems = validateItem(item, at, chains, slipIds);
    out.push(...problems);
    if (id === null || !isRecord(item)) return;
    if (seen.has(id)) out.push(`${at}: duplicate id`);
    else seen.set(id, item);
  });
  // The slip map and the catalog agree on which item repairs which slip, both ways.
  for (const s of deps.slips) {
    const item = seen.get(s.repair);
    if (!item) out.push(`${s.repair}: the repair for slip ${s.id} has no descriptor`);
    else if (isStrings(item.slips) && !item.slips.includes(s.id)) out.push(`${s.repair}: doesn't list slip ${s.id}, which points at it`);
  }
  for (const [id, item] of seen) {
    if (!isStrings(item.slips)) continue;
    for (const slipId of item.slips) {
      const slip = deps.slips.find((s) => s.id === slipId);
      if (slip && slip.repair !== id) out.push(`${id}: lists slip ${slipId}, whose repair is ${slip.repair}`);
    }
  }
  return out;
}

export const CATALOG_DEPS: CatalogDeps = { nodes: skillMap.nodes, slips: SLIPS };

const problems = validateCatalog(data, CATALOG_DEPS);
if (problems.length > 0) throw new Error(`catalog.json: ${problems.join("; ")}`);

export const CATALOG: readonly ItemDescriptor[] = (data as unknown as { items: ItemDescriptor[] }).items;
export const ITEM_IDS: readonly string[] = CATALOG.map((i) => i.id);

const BY_ID = new Map(CATALOG.map((i) => [i.id, i]));

export function descriptorFor(id: string): ItemDescriptor | null {
  return BY_ID.get(id) ?? null;
}

/** The skill an item is about. Every item the mock runs has a descriptor; a missing one is a bug. */
export function skillOf(id: string): string {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`no descriptor for ${id}`);
  return d.skills.primary;
}

/** The player an item runs on, for items that have one. */
export function templateOf(id: string): PuzzleTemplate | null {
  return BY_ID.get(id)?.template ?? null;
}

/**
 * Every probe equation in the skill map. No item may show one (R-01, R-37): a puzzle built on a
 * probe would hand the student that probe's answer and spoil the diagnosis. The generators avoid
 * them, and catalog.test.ts checks.
 */
export const PROBE_EQUATIONS: readonly string[] = skillMap.nodes.flatMap((n) => n.probes.map((p) => p.equation));
