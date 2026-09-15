import "server-only";
import data from "../../../content/bellomo/catalog.json";
import {
  canReadMaterial, isMaterialAdministrator, matchesMaterialProject,
  type MaterialAsset, type MaterialProject, type MaterialResponse,
} from "@/lib/bellomo-policy";

export const materialCatalog = data as { projects: MaterialProject[]; assets: MaterialAsset[]; pending: MaterialResponse["pending"] };
export class MaterialError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function materialSession(request: Request) {
  if (!request.headers.get("cookie")) throw new MaterialError(401, "Iniciá sesión para consultar el material.");
  const api = (process.env.NEXT_PUBLIC_EVERPROP_API_URL || process.env.NEXT_PUBLIC_API_URL || "https://everprop-bellomo-production.up.railway.app").replace(/\/+$/, "");
  const origin = new URL(request.url).origin;
  const headers = new Headers({ Accept: "application/json", Cookie: request.headers.get("cookie")!, Origin: origin, Referer: origin + "/admin" });
  if (process.env.NODE_ENV === "development") headers.set("X-Everprop-Tenant", process.env.NEXT_PUBLIC_EVERPROP_TENANT || "bellomo");
  async function read(path: string) {
    const response = await fetch(api + "/api/v1/" + path, { headers, cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new MaterialError([401,403,419].includes(response.status) ? response.status : 503, "No se pudo verificar el acceso al material.");
    return response.json();
  }
  const me = await read("auth/me");
  const user = me.data;
  if (user?.status !== "ACTIVE" || user?.tenant?.slug !== "bellomo") throw new MaterialError(403, "Material no disponible para esta cuenta.");
  if (!["SUPER_ADMIN","TENANT_ADMIN","SALES_MANAGER","SALES_ADVISOR","INVENTORY_MANAGER","READ_ONLY"].includes(user.role)) throw new MaterialError(403, "Tu perfil no tiene acceso a esta biblioteca.");
  const projects: Array<{ public_id: string; name: string }> = [];
  for (let page = 1; page <= 100; page++) {
    const result = await read("admin/projects?per_page=100&page=" + page);
    projects.push(...result.data);
    if (!result.meta?.last_page || page >= result.meta.last_page) break;
    if (page === 100) throw new MaterialError(503, "No se pudo completar la verificación del catálogo.");
  }
  return { role: user.role as string, tenant: user.tenant.slug as string, projectNames: projects.map(p => p.name), projects };
}
export function visibleMaterials(session: Awaited<ReturnType<typeof materialSession>>): MaterialResponse {
  const serialize = (asset: MaterialAsset) => {
    const { file, sourceUrl, sourcePath, ...visible } = asset;
    void file; void sourceUrl; void sourcePath;
    return { ...visible, url: "/api/bellomo/assets/" + asset.id };
  };
  const assets = materialCatalog.assets.filter(asset => canReadMaterial(asset, materialCatalog.projects.find(p => p.id === asset.project), session));
  return {
    role: session.role,
    projects: materialCatalog.projects.map(project => ({
      ...project,
      operationalIds: session.projects.filter(p => matchesMaterialProject(project,p.name)).map(p => p.public_id),
      assets: assets.filter(a => a.project === project.id).map(serialize),
    })).filter(p => p.assets.length > 0),
    institutional: assets.filter(a => a.project === null).map(serialize),
    pending: isMaterialAdministrator(session.role) ? materialCatalog.pending : [],
  };
}
export function materialFailure(error: unknown) {
  return Response.json({ message: error instanceof MaterialError ? error.message : "El material no está disponible en este momento." }, {
    status: error instanceof MaterialError ? error.status : 503, headers: { "Cache-Control": "private, no-store" },
  });
}
