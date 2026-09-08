import { describe, expect, it } from "vitest";

import { userHasCapability, type ApiRoleCode, type UserProfile } from "./auth-sample";

function apiUser(role: ApiRoleCode, permissions: string[]): UserProfile {
  return {
    id: `user-${role}`,
    email: `${role.toLowerCase()}@example.test`,
    role: role === "SUPER_ADMIN" || role === "TENANT_ADMIN" || role === "SALES_MANAGER" ? "ADMIN" : "ADVISOR",
    apiRole: role,
    name: role,
    avatar: "QA",
    title: "QA",
    permissions,
    source: "api",
  };
}

describe("API capability guards", () => {
  it("keeps READ_ONLY accounts unable to mutate even though their coarse UI role is ADVISOR", () => {
    const user = apiUser("READ_ONLY", ["viewAny", "view"]);

    expect(userHasCapability(user, "view")).toBe(true);
    expect(userHasCapability(user, "create")).toBe(false);
    expect(userHasCapability(user, "update")).toBe(false);
    expect(userHasCapability(user, "assign")).toBe(false);
  });

  it("does not grant manager-only capabilities to BOT_OPERATOR", () => {
    const user = apiUser("BOT_OPERATOR", ["viewAny", "view", "create", "update"]);

    expect(userHasCapability(user, "create")).toBe(true);
    expect(userHasCapability(user, "update")).toBe(true);
    expect(userHasCapability(user, "assign")).toBe(false);
    expect(userHasCapability(user, "manageUsers")).toBe(false);
  });

  it("uses the API allowlist instead of inferring access from the coarse role", () => {
    const manager = apiUser("SALES_MANAGER", ["viewAny", "view", "create", "update", "publish", "assign"]);

    expect(manager.role).toBe("ADMIN");
    expect(userHasCapability(manager, "assign")).toBe(true);
    expect(userHasCapability(manager, "manageUsers")).toBe(false);
  });

  it("fails closed for a missing session", () => {
    expect(userHasCapability(null, "view")).toBe(false);
    expect(userHasCapability(undefined, "create")).toBe(false);
  });
});
