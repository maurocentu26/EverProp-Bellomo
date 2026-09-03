export type DataMode = "api" | "mock";

export const DATA_MODE: DataMode =
  process.env.NEXT_PUBLIC_DATA_MODE === "mock" ? "mock" : "api";

export const isMockDataMode = DATA_MODE === "mock";
