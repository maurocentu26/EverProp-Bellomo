export type LandingImage = { url: string; alt: string; kind: "PHOTO" | "RENDER" };
export type LandingAsset = { url: string; title: string; mime_type: string };
export type LandingProject = {
  public_id: string; slug: string; name: string; summary: string; description: string;
  category: "HUASI" | "LAND_DEVELOPMENT" | "COMMERCIAL";
  location: { city: string; province: string; address: string | null };
  status_label: string | null; is_visible: boolean; is_featured: boolean;
  sort_order: number; featured_order: number; cover: LandingImage | null;
  logo: { url: string; alt: string } | null; gallery: LandingImage[];
  features: string[]; documents: { title: string; url: string }[]; updated_at: string | null;
};

export function landingPayload(project: LandingProject) {
  const { public_id, updated_at, ...payload } = project;
  void public_id; void updated_at;
  return payload;
}
