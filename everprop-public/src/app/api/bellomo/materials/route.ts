import { materialSession, materialFailure, visibleMaterials } from "@/lib/server/bellomo-materials";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(visibleMaterials(await materialSession(request)), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return materialFailure(error); }
}
