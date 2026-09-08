import { afterEach, describe, expect, it, vi } from "vitest";

async function loadDataMode() {
  vi.resetModules();
  return import("./data-mode");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("local-only browser controls", () => {
  it("never enables QA tools or the tenant override in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_QA_TOOLS", "true");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_LOCAL_TENANT_HEADER", "true");

    const mode = await loadDataMode();

    expect(mode.isLocalQaToolsEnabled).toBe(false);
    expect(mode.isLocalTenantHeaderEnabled).toBe(false);
  });

  it("requires development, mock mode and explicit opt-in for QA tools", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_QA_TOOLS", "true");

    const mode = await loadDataMode();

    expect(mode.isLocalQaToolsEnabled).toBe(true);
  });

  it("keeps QA tools off in API mode even during development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "api");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_QA_TOOLS", "true");

    const mode = await loadDataMode();

    expect(mode.isLocalQaToolsEnabled).toBe(false);
  });
});
