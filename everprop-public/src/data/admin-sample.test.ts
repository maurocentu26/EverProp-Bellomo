import { describe, expect, it } from "vitest";

import { projects, properties } from "./admin-sample";

describe("Bellomo lot fixture", () => {
  it("contains the complete 73-lot inventory with unique identifiers", () => {
    expect(properties).toHaveLength(73);
    expect(new Set(properties.map((property) => property.id)).size).toBe(73);
    expect(properties.every((property) => property.propertyType === "Lote")).toBe(true);
  });

  it("keeps project totals and property assignments internally consistent", () => {
    const counts = new Map<string, number>();
    for (const property of properties) {
      expect(projects.some((project) => project.id === property.projectId)).toBe(true);
      counts.set(property.projectId!, (counts.get(property.projectId!) ?? 0) + 1);
    }

    for (const project of projects) {
      expect(counts.get(project.id)).toBe(project.totalUnits);
    }
  });

  it("matches the reviewed availability breakdown", () => {
    const byStatus = properties.reduce<Record<string, number>>((totals, property) => {
      const status = property.status ?? "available";
      totals[status] = (totals[status] ?? 0) + 1;
      return totals;
    }, {});

    expect(byStatus).toEqual({ available: 6, sold: 60, reserved: 7 });
  });
});
