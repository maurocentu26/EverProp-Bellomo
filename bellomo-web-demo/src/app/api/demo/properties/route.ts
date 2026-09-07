import { readDemoCatalog } from "@/lib/demo-catalog";
export async function GET() {
  if (process.env.LOCAL_DEMO !== "1" || process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  try {
    return Response.json(await readDemoCatalog(), { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "No pudimos actualizar el catálogo. Revisá que el panel demo esté encendido." }, { status: 503 }); }
}
