import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const apiMode = process.env.PLAYWRIGHT_API_MODE === "true";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 60_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run start -- --hostname 127.0.0.1 --port ${port}`,
        env: {
          ...process.env,
          NEXT_PUBLIC_DATA_MODE: apiMode ? "api" : "mock",
          NEXT_PUBLIC_ENABLE_QA_TOOLS: apiMode ? "false" : "true",
          NEXT_PUBLIC_ENABLE_LOCAL_TENANT_HEADER: "true",
          NEXT_PUBLIC_EVERPROP_TENANT: apiMode
            ? process.env.NEXT_PUBLIC_EVERPROP_TENANT ?? "ci-smoke"
            : "bellomo",
          NEXT_PUBLIC_EVERPROP_API_URL: apiMode
            ? process.env.NEXT_PUBLIC_EVERPROP_API_URL ?? "http://127.0.0.1:18082"
            : process.env.NEXT_PUBLIC_EVERPROP_API_URL ?? "",
        },
        reuseExistingServer: !process.env.CI && !apiMode,
        timeout: 180_000,
        url: baseURL,
      },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"], channel: "chrome" },
    },
  ],
});
