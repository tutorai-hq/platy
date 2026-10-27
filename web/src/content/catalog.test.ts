import { describe, expect, it } from "vitest";
import skillMap from "../../../src/platy/skills/data/skill_map.json";
import { isOneOf, type Level, LEVELS, seeded } from "../mock/generate";
import { INTERESTS, ITEMS, newItemPuzzle, newPuzzle, problemOf, REPAIRS, SKINS, toWire, WORKED_FADES } from "../mock/puzzles";
import { sameExpression } from "../mock/working";
import raw from "./catalog.json";
import {
  ANGLES, CATALOG, CATALOG_DEPS, descriptorFor, FORMATS, INTEREST_TAGS, type ItemDescriptor, prerequisiteChains, PROBE_EQUATIONS, ROLES, skillOf,
  STATUSES, TEMPLATES, templateOf, validateCatalog,
} from "./catalog";
import { SLIPS } from "./slips";
import type { PuzzleTemplate } from "./types";

// R-37: every item has a validated descriptor keyed to skill-map node ids. A descriptor naming a
// missing node, or an item reusing a probe's equation, fails.

const NODE_IDS = new Set(skillMap.nodes.map((n) => n.id));
const PUZZLE_TEMPLATES: PuzzleTemplate[] = ["spot_the_error", "missing_step", "balance", "worked_example"];

/** The catalog with one descriptor changed, for the validator to catch. */
const tampered = (id: string, change: (d: ItemDescriptor) => unknown): string[] => {
  const items = raw.items.map((d) => (d.id === id ? change(structuredClone(d) as ItemDescriptor) : d));
  return validateCatalog({ ...raw, items }, CATALOG_DEPS);
};
const problemsOf = (change: (d: ItemDescriptor) => unknown) => tampered("repair-order-brackets", change);

describe("item catalog (R-37)", () => {
  it("parses, and every descriptor passes the validator", () => {
    expect(validateCatalog(raw, CATALOG_DEPS)).toEqual([]);
    expect(CATALOG.length).toBeGreaterThanOrEqual(15);
    expect(new Set(CATALOG.map((d) => d.id)).size).toBe(CATALOG.length);
  });

  it("keys every skill to a node in skill_map.json, and every touch to a prerequisite of the primary", () => {
    const chains = prerequisiteChains(skillMap.nodes);
    for (const d of CATALOG) {
      expect(NODE_IDS.has(d.skills.primary), d.id).toBe(true);
      for (const t of d.skills.touches) expect(chains.get(d.skills.primary)?.has(t), `${d.id} touches ${t}`).toBe(true);
    }
    expect(problemsOf((d) => ({ ...d, skills: { primary: "not_a_skill", touches: [] } }))).toEqual(["repair-order-brackets: skills.primary not_a_skill is not a skill-map node"]);
    expect(problemsOf((d) => ({ ...d, skills: { ...d.skills, touches: ["not_a_skill"] } }))).toContain("repair-order-brackets: skills.touches not_a_skill is not a skill-map node");
    // Two-step equations aren't under order of operations; the map says the other way.
    expect(problemsOf((d) => ({ ...d, skills: { ...d.skills, touches: ["two_step_equations"] } }))).toEqual([
      "repair-order-brackets: skills.touches two_step_equations is not a prerequisite of order_of_operations",
    ]);
  });

  it("names only slips in slips.json, and agrees with the slip map on which item repairs which slip", () => {
    const slipIds = new Set(SLIPS.map((s) => s.id));
    for (const d of CATALOG) for (const s of d.slips) expect(slipIds.has(s), `${d.id} slip ${s}`).toBe(true);
    for (const s of SLIPS) {
      const d = descriptorFor(s.repair);
      expect(d, `${s.id} -> ${s.repair}`).not.toBeNull();
      expect(d?.slips, `${s.repair} lists ${s.id}`).toContain(s.id);
      expect(d?.role).toBe("repair");
    }
    expect(problemsOf((d) => ({ ...d, slips: ["not_a_slip"] }))).toEqual([
      "repair-order-brackets: slip not_a_slip is not in slips.json",
      "repair-order-brackets: doesn't list slip brackets_ignored, which points at it",
    ]);
    expect(problemsOf((d) => ({ ...d, slips: [] }))).toContain("repair-order-brackets: a repair names at least one slip");
    expect(problemsOf((d) => ({ ...d, slips: ["brackets_ignored", "order_sign_dropped"] }))).toEqual([
      "repair-order-brackets: lists slip order_sign_dropped, whose repair is repair-integer-signs",
    ]);
  });

  it("takes every role, format, template, angle, status and interest tag from a fixed vocabulary", () => {
    for (const d of CATALOG) {
      expect(ROLES).toContain(d.role);
      expect(FORMATS).toContain(d.format);
      expect(ANGLES).toContain(d.angle);
      expect(STATUSES).toContain(d.status);
      if (d.template !== null) expect(TEMPLATES).toContain(d.template);
      for (const t of d.interest_tags) expect(INTEREST_TAGS).toContain(t);
      expect(d.difficulty.min).toBeGreaterThanOrEqual(LEVELS[0]!);
      expect(d.difficulty.max).toBeLessThanOrEqual(LEVELS[LEVELS.length - 1]!);
    }
    // The mock's skins are the tags; "neutral" is no tag at all.
    for (const i of INTERESTS) if (i !== "neutral") expect(INTEREST_TAGS).toContain(i);
    expect(problemsOf((d) => ({ ...d, role: "quiz" }))).toEqual(["repair-order-brackets: role must be one of teach, practice, repair, review, apply, hook"]);
    expect(problemsOf((d) => ({ ...d, format: "video" }))).toContain("repair-order-brackets: format must be one of puzzle, worked_example, story, reel");
    expect(problemsOf((d) => ({ ...d, angle: "fun" }))).toEqual(["repair-order-brackets: angle must be one of balance, undo, worked, story, visual"]);
    expect(problemsOf((d) => ({ ...d, status: "ready" }))).toEqual(["repair-order-brackets: status must be one of draft, live"]);
    expect(problemsOf((d) => ({ ...d, template: "worked_example" }))).toEqual(["repair-order-brackets: a puzzle's template must be a puzzle player"]);
    expect(problemsOf((d) => ({ ...d, format: "reel", template: "balance" }))).toEqual(["repair-order-brackets: a reel has no template"]);
    expect(problemsOf((d) => ({ ...d, interest_tags: ["soccer", "cooking"] }))).toEqual(["repair-order-brackets: interest_tags must be from soccer, football, gaming"]);
    expect(problemsOf((d) => ({ ...d, difficulty: { min: 2, max: 1 } }))).toHaveLength(1);
    expect(problemsOf((d) => ({ ...d, difficulty: { min: 0, max: 4 } }))).toHaveLength(1);
    expect(problemsOf((d) => ({ ...d, reading_level: 6.5 }))).toHaveLength(1);
  });

  it("refuses a field it doesn't know, a missing field, a bad id or a repeated id, like a frozen model with extra=forbid", () => {
    expect(problemsOf((d) => ({ ...d, media: { src: "x.mp4" } }))).toEqual(["repair-order-brackets: unknown field media"]);
    const { reading_level: _r, ...without } = CATALOG.find((d) => d.id === "repair-order-brackets")!;
    expect(problemsOf(() => without)).toEqual(["repair-order-brackets: missing reading_level", "repair-order-brackets: reading_level must be a whole number from 1 to 12"]);
    expect(problemsOf((d) => ({ ...d, id: "Repair Order" }))).toContain("Repair Order: id must be kebab-case");
    expect(problemsOf((d) => ({ ...d, schema_version: 2 }))).toEqual(["repair-order-brackets: schema_version must be 1"]);
    expect(validateCatalog({ ...raw, items: [...raw.items, raw.items[0]] }, CATALOG_DEPS)).toEqual([`${raw.items[0]!.id}: duplicate id`]);
    expect(validateCatalog({ ...raw, schema_version: 2, extra: 1 }, CATALOG_DEPS)).toEqual(["catalog: schema_version must be 1", "catalog: unknown field extra"]);
    expect(validateCatalog("no", CATALOG_DEPS)).toEqual(["catalog: not an object"]);
  });

  it("has exactly one descriptor for every item the mock runs, and no descriptor without an item", () => {
    const mockIds = new Set([...Object.values(ITEMS), ...Object.values(REPAIRS), ...WORKED_FADES].map((i) => i.item_id));
    expect([...mockIds].sort()).toEqual(CATALOG.map((d) => d.id).sort());
    // The three fades of the worked example are one item.
    expect(WORKED_FADES.map((i) => i.item_id)).toEqual(["lin2-worked-example", "lin2-worked-example", "lin2-worked-example"]);
  });

  it("is where the mock gets an item's skill and player from", () => {
    for (const [template, item] of Object.entries(ITEMS) as [PuzzleTemplate, { item_id: string }][]) {
      expect(templateOf(item.item_id)).toBe(template);
      const p = newPuzzle(template, seeded(3), "i-1");
      expect(toWire(p, SKINS.neutral).skill_id).toBe(descriptorFor(item.item_id)!.skills.primary);
    }
    for (const id of Object.keys(REPAIRS)) {
      const d = descriptorFor(id)!;
      expect(templateOf(id)).toBe(d.template);
      const p = newItemPuzzle(id, seeded(3), "r-1", d.difficulty.min as Level);
      expect(p.template).toBe(d.template);
      expect(toWire(p, SKINS.neutral).skill_id).toBe(d.skills.primary);
      expect(skillOf(id)).toBe(d.skills.primary);
    }
    expect(() => skillOf("not-an-item")).toThrow();
    expect(templateOf("not-an-item")).toBeNull();
  });

  it("never builds an item on a probe's equation (R-01), at any level or seed", () => {
    expect(PROBE_EQUATIONS.length).toBe(skillMap.nodes.length * 3);
    const usesProbe = (problem: string) => isOneOf(problem, PROBE_EQUATIONS) || PROBE_EQUATIONS.some((p) => sameExpression(problem, p));
    for (const template of PUZZLE_TEMPLATES) {
      for (let seed = 1; seed <= 300; seed++) {
        const p = newPuzzle(template, seeded(seed), `${template}-${seed}`);
        expect(usesProbe(problemOf(p)), `${template} seed ${seed}: ${problemOf(p)}`).toBe(false);
      }
    }
    for (const id of Object.keys(REPAIRS)) {
      for (const level of LEVELS) {
        for (let seed = 1; seed <= 50; seed++) {
          const p = newItemPuzzle(id, seeded(seed), `${id}-${seed}`, level);
          expect(usesProbe(problemOf(p)), `${id} L${level} seed ${seed}: ${problemOf(p)}`).toBe(false);
        }
      }
    }
    // The check itself knows a probe when it sees one, written either way.
    expect(usesProbe("3x + 4 = 19")).toBe(true);
    expect(usesProbe("20 - 3*(4 + 2)")).toBe(true);
    expect(usesProbe("3x + 5 = 20")).toBe(false);
  });
});
