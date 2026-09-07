import { demoEnabled, demoUser, startDemoSession, endDemoSession } from "@/lib/demo-session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  if (!demoEnabled(request)) return new Response(null, { status: 404 });
  return Response.json({ user: demoUser(request) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  if (!demoEnabled(request)) return new Response(null, { status: 404 });
  // Intentional local demo profile picker. Roles always come from server definitions.
  const body = await request.json().catch(() => null);
  return startDemoSession(request, typeof body?.email === "string" ? body.email : "");
}
export function DELETE(request: Request) {
  if (!demoEnabled(request)) return new Response(null, { status: 404 });
  return endDemoSession(request);
}
