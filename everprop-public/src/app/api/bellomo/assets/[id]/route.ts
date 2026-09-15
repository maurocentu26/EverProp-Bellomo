import { readFile } from "node:fs/promises";
import path from "node:path";
import { materialSession, materialFailure, materialCatalog, MaterialError } from "@/lib/server/bellomo-materials";
import { canReadMaterial } from "@/lib/bellomo-policy";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const asset = materialCatalog.assets.find(a => a.id === id);
    if (!asset) throw new MaterialError(404, "Archivo no encontrado.");
    const session = await materialSession(request);
    if (!canReadMaterial(asset, materialCatalog.projects.find(p => p.id === asset.project), session)) throw new MaterialError(403, "No tenés acceso a este archivo.");
    const bytes = await readFile(path.join(process.cwd(), "content/bellomo", asset.file));
    const ext = path.extname(asset.file);
    const type = ({ ".webp":"image/webp", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png", ".pdf":"application/pdf" } as Record<string,string>)[ext];
    if (!type) throw new MaterialError(404, "Formato no disponible.");
    return new Response(bytes, { headers: {
      "Content-Type": type, "Content-Length": String(bytes.length),
      "Content-Disposition": (new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline") + '; filename="' + asset.file + '"',
      "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff",
      "Cross-Origin-Resource-Policy":"same-origin",
    } });
  } catch (error) { return materialFailure(error); }
}
