import { apiFetch } from "@/lib/everprop-api";

export type LandingImage = { url: string; alt: string; kind: "PHOTO" | "RENDER" };
export type LandingAsset = { url: string; title: string; mime_type: string };
export type ProjectOption = {
  public_id: string;
  name: string;
  can_edit: boolean;
  can_publish: boolean;
  slug?: string;
  is_visible?: boolean;
  sort_order?: number;
  summary?: string;
  description?: string;
  category?: "HUASI" | "LAND_DEVELOPMENT" | "COMMERCIAL";
  status_label?: string | null;
  is_featured?: boolean;
  featured_order?: number;
  location?: { city: string; province: string; address: string | null };
  cover?: LandingImage | null;
  logo?: { url: string; alt: string } | null;
  gallery?: LandingImage[];
  features?: string[];
};

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

export async function uploadLandingAsset(projectId: string, file: File) {
  if (!["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"].includes(file.type) || file.size < 1 || file.size > 15 * 1024 * 1024) {
    throw new Error("Elegí una imagen JPEG, PNG, WebP, AVIF o un PDF de hasta 15 MB.");
  }
  const { data: ticket } = await apiFetch<{ data: { upload_url: string; public_url: string; upload_token: string; headers: Record<string, string | string[]> } }>(`/api/v1/admin/projects/${projectId}/landing/media/upload-url`, { method: "POST", body: JSON.stringify({ filename: file.name, mime_type: file.type, file_size: file.size }) });
  const headers = new Headers();
  Object.entries(ticket.headers).forEach(([key, value]) => { if (!["host", "content-length"].includes(key.toLowerCase())) headers.set(key, Array.isArray(value) ? value.join(", ") : value); });
  let response: Response;
  try {
    response = await fetch(ticket.upload_url, { method: "PUT", headers, body: file, credentials: "omit", signal: AbortSignal.timeout(120_000) });
  } catch {
    throw new Error("No se pudo enviar el archivo a R2. Revisá tu conexión y la configuración CORS del almacenamiento.");
  }
  if (!response.ok) throw new Error("R2 rechazó la carga. Reintentá o revisá la configuración de almacenamiento.");
  return { projectId, url: ticket.public_url, mime_type: file.type, title: file.name.replace(/<[^>]*>/g, "").slice(0, 160) || "Archivo", upload_token: ticket.upload_token };
}
