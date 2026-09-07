import defaults from "./website-defaults.json";
export type CustomSection = { id: string; title: string; body: string; image: string; buttonLabel: string; href: string; enabled: boolean };
export type WebsiteContent = Omit<typeof defaults, "customSections"> & { customSections: CustomSection[] };
export const defaultWebsite: WebsiteContent = defaults;
export type WebsiteState = { revision: number; publishedAt: string | null; draft: WebsiteContent; published: WebsiteContent };
