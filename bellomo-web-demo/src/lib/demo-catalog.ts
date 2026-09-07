export type DemoProperty = {
  id: string; title: string; operation: string; propertyType: string;
  price: number; currency: string; city: string; neighborhood: string;
  bedrooms: number; bathrooms: number; area_m2?: number; description?: string; status?: string; mainImage?: string;
};
export async function readPublishedWebsite() {
  const response = await fetch(`${process.env.DEMO_PANEL_URL || "http://127.0.0.1:3001"}/api/demo/site?view=published`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("No se pudo leer la configuración de la web.");
  return (await response.json()).content as import("./website-content").WebsiteContent;
}
export async function readDemoCatalog(): Promise<DemoProperty[]> {
  const base = process.env.DEMO_PANEL_URL || "http://127.0.0.1:3001";
  const response = await fetch(`${base}/api/demo/properties?public=1`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("El panel demo no está disponible.");
  return response.json();
}
