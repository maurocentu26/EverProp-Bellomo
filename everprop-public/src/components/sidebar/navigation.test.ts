import { describe, expect, it } from "vitest";

import { getAvailableNavigationGroups } from "./navigation";

function labels(groups: ReturnType<typeof getAvailableNavigationGroups>) {
  return groups.flatMap((group) => group.items.map((item) => item.title));
}

function children(groups: ReturnType<typeof getAvailableNavigationGroups>) {
  return groups.flatMap((group) => group.items.flatMap((item) => item.children?.map((child) => child.title) ?? []));
}

describe("capability-aware admin navigation", () => {
  it("removes create shortcuts for an API read-only advisor", () => {
    const groups = getAvailableNavigationGroups({
      isAdvisor: true,
      isEngineer: false,
      isMockMode: false,
      canCreate: false,
      canManageUsers: false,
    });

    expect(children(groups)).not.toContain("Nuevo Lead");
    expect(labels(groups)).not.toContain("Mi Agenda");
  });

  it("does not expose settings to a sales manager without manageUsers", () => {
    const groups = getAvailableNavigationGroups({
      isAdvisor: false,
      isEngineer: false,
      isMockMode: false,
      canCreate: true,
      canManageUsers: false,
    });

    expect(children(groups)).toEqual(expect.arrayContaining(["Nueva Unidad", "Nuevo Lead"]));
    expect(labels(groups)).not.toContain("Configuración");
  });

  it("keeps settings for an API tenant administrator", () => {
    const groups = getAvailableNavigationGroups({
      isAdvisor: false,
      isEngineer: false,
      isMockMode: false,
      canCreate: true,
      canManageUsers: true,
    });

    expect(labels(groups)).toContain("Configuración");
  });
});
