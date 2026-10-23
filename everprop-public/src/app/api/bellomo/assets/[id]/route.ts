import { readFile } from "node:fs/promises";
import path from "node:path";
import { materialSession, materialFailure, materialCatalog, MaterialError } from "@/lib/server/bellomo-materials";
import { canReadMaterial } from "@/lib/bellomo-policy";

const CLOUDFLARE_R2_BASE = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_URL || "https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/content/bellomo";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const asset = materialCatalog.assets.find(a => a.id === id);
    if (!asset) throw new MaterialError(404, "Archivo no encontrado.");
    const session = await materialSession(request);
    if (!canReadMaterial(asset, materialCatalog.projects.find(p => p.id === asset.project), session)) throw new MaterialError(403, "No tenés acceso a este archivo.");

    // Serve directly from Cloudflare R2 Edge CDN
    try {
      const r2Res = await fetch(`${CLOUDFLARE_R2_BASE}/${encodeURIComponent(asset.file)}`, {
        cache: "force-cache",
        signal: AbortSignal.timeout(10000),
      });
      if (r2Res.ok) {
        const bytes = await r2Res.arrayBuffer();
        const ext = path.extname(asset.file);
        const type = ({ ".webp":"image/webp", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png", ".pdf":"application/pdf" } as Record<string,string>)[ext] || r2Res.headers.get("content-type") || "application/octet-stream";
        return new Response(bytes, { headers: {
          "Content-Type": type, "Content-Length": String(bytes.byteLength),
          "Content-Disposition": (new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline") + '; filename="' + asset.file + '"',
          "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff",
          "Cross-Origin-Resource-Policy":"same-origin",
        } });
      }
    } catch {
      // Fallback to local file if available in development environment
    }

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
