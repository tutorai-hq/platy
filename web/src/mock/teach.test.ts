import { describe, expect, it } from "vitest";
import { CATALOG } from "../content/catalog";
import { DEMO_NODES } from "./generate";
import { pickTeachItem, teachAngles } from "./teach";

// R-05: when an explanation doesn't land, the next one takes a different angle. This picker is
// the stand-in for the server's item selector (handshake plan C.11), which needs the angles
// tried this session as an input.
describe("pickTeachItem (R-05)", () => {
  it("picks the first teach item on the skill whose angle hasn't been tried, in catalog order", () => {
    for (const node of DEMO_NODES) {
      const teach = CATALOG.filter((d) => d.role === "teach" && d.skills.primary === node);
      const first = pickTeachItem(node, []);
      expect(first, node).toBe(teach[0]);
      const second = pickTeachItem(node, [first!.angle]);
      expect(second, node).toBe(teach.find((d) => d.angle !== first!.angle));
      expect(second!.angle).not.toBe(first!.angle);
    }
  });

  it("runs out only when every angle on the skill has been tried, and never picks a repair or another skill's item", () => {
    const angles = teachAngles("inverse_operations");
    expect(angles.length).toBeGreaterThanOrEqual(2);
    expect(new Set(angles).size).toBe(angles.length);
    expect(pickTeachItem("inverse_operations", angles)).toBeNull();
    expect(pickTeachItem("inverse_operations", angles.slice(1))?.angle).toBe(angles[0]);
    for (const node of DEMO_NODES) {
      for (const tried of [[], ["balance"], ["worked"], ["worked", "visual"]]) {
        const d = pickTeachItem(node, tried);
        if (!d) continue;
        expect(d.role).toBe("teach");
        expect(d.skills.primary).toBe(node);
        expect(tried).not.toContain(d.angle);
        expect(d.template).not.toBeNull();
      }
    }
    expect(pickTeachItem("reciprocals", [])).toBeNull();
    expect(teachAngles("reciprocals")).toEqual([]);
  });
});
