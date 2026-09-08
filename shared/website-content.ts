import defaults from "./website-defaults.json";
export { default as brandLibrary } from "./brand-library.json";
export type CustomSection = { id: string; title: string; body: string; image: string; buttonLabel: string; href: string; enabled: boolean };
export type Promotion = { id: string; title: string; eyebrow: string; description: string; image: string; conditions: string; buttonLabel: string; href: string; enabled: boolean };
export type WebsiteContent = Omit<typeof defaults, "customSections"> & { customSections: CustomSection[]; promotions: Promotion[] };
export const defaultWebsite: WebsiteContent = { ...defaults, promotions: [] };
export type WebsiteState = { revision: number; publishedAt: string | null; draft: WebsiteContent; published: WebsiteContent };
