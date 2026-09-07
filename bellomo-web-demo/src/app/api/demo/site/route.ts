export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (process.env.LOCAL_DEMO !== "1" || process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const view = new URL(request.url).searchParams.get("preview") === "1" ? "preview" : "published";
  try {
    const response = await fetch(`${process.env.DEMO_PANEL_URL || "http://127.0.0.1:3001"}/api/demo/site?view=${view}`, { cache: "no-store", headers: view === "preview" ? { cookie: request.headers.get("cookie") || "" } : {}, signal: AbortSignal.timeout(5000) });
    return Response.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "No se pudo conectar con el panel." }, { status: 503 }); }
}
