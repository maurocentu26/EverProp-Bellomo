import type { Property } from "@/data/admin-sample";
export const isLocalDemo = process.env.NEXT_PUBLIC_LOCAL_DEMO === "1";
export type DemoProperty = Property & { published?: boolean };
export async function demoCatalog(method = "GET", body?: unknown): Promise<DemoProperty[] | DemoProperty> {
  const response = await fetch("/api/demo/properties", {
    method, cache: "no-store", headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo conectar con el catálogo demo.");
  return data;
}
