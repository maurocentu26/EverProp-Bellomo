import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  loadEverpropNotifications: vi.fn(),
  markAllEverpropNotificationsRead: vi.fn(),
  markEverpropNotificationRead: vi.fn(),
  clearAllEverpropNotifications: vi.fn(),
}));

vi.mock("./data-mode", () => ({ isMockDataMode: false }));
vi.mock("./everprop-api", () => api);

import {
  fetchNotifications,
  isNotificationForUser,
  markNotificationAsRead,
  safeAdminActionUrl,
} from "./notifications";

describe("production notification boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats an empty authenticated API response as authoritative", async () => {
    api.loadEverpropNotifications.mockResolvedValue({ data: [] });

    await expect(fetchNotifications("user-1")).resolves.toEqual([]);
    expect(api.loadEverpropNotifications).toHaveBeenCalledOnce();
  });

  it("surfaces API failures instead of falling back to browser storage", async () => {
    api.loadEverpropNotifications.mockRejectedValue(new Error("API unavailable"));
    api.markEverpropNotificationRead.mockRejectedValue(new Error("write rejected"));

    await expect(fetchNotifications("user-1")).rejects.toThrow("API unavailable");
    await expect(markNotificationAsRead("notification-1")).rejects.toThrow("write rejected");
  });

  it("allows only same-origin admin destinations", () => {
    expect(safeAdminActionUrl("/admin/leads/abc?tab=history#latest")).toBe("/admin/leads/abc?tab=history#latest");
    expect(safeAdminActionUrl("/admin")).toBe("/admin");
    expect(safeAdminActionUrl("javascript:alert(1)")).toBeNull();
    expect(safeAdminActionUrl("https://evil.example/admin")).toBeNull();
    expect(safeAdminActionUrl("//evil.example/admin")).toBeNull();
    expect(safeAdminActionUrl("/login")).toBeNull();
  });

  it("matches only the explicit recipient without admin or alias overrides", () => {
    const admin = { id: "usr-admin", email: "admin@bellomo.com" };

    expect(isNotificationForUser("usr-admin", admin)).toBe(true);
    expect(isNotificationForUser("ADMIN@BELLOMO.COM", admin)).toBe(true);
    expect(isNotificationForUser("usr-sales", admin)).toBe(false);
    expect(isNotificationForUser("b1100000-0000-4000-8000-000000000100", admin)).toBe(false);
    expect(isNotificationForUser("broadcast", admin)).toBe(false);
    expect(isNotificationForUser(null, admin)).toBe(false);
  });
});
