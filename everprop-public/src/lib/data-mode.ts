export type DataMode = "api" | "mock";

export const DATA_MODE: DataMode =
  process.env.NEXT_PUBLIC_DATA_MODE === "mock" ? "mock" : "api";

export const isMockDataMode = DATA_MODE === "mock";

// QA-only controls must require both an explicit opt-in and the development
// runtime. Next.js inlines NEXT_PUBLIC_* values into browser bundles, so this
// must never be used for secrets or as an authorization boundary.
export const isLocalQaToolsEnabled =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_ENABLE_QA_TOOLS === "true" &&
  isMockDataMode;

export const isLocalTenantHeaderEnabled =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_ENABLE_LOCAL_TENANT_HEADER === "true";
