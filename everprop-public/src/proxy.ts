import { NextResponse, type NextRequest } from "next/server";
import { PANEL_HEADERS, hostFromHeader, panelHostHeaders } from "@/lib/tenant-signature";

/**
 * Runs before the /api/v1 and /sanctum rewrites to the API (S02). Always drops tenant-channel headers sent by
 * the browser. With TENANT_PANEL_SIGNING_KEY set, it signs the domain the user is on so the API picks that
 * tenant; a request whose Host is not a plain domain gets 404 instead of silently falling back to the API's
 * own host. Without the key nothing is added and the API resolves the tenant by its own host, as before.
 */
export async function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  for (const name of PANEL_HEADERS) headers.delete(name);

  const key = process.env.TENANT_PANEL_SIGNING_KEY;
  if (key) {
    const host = hostFromHeader(request.headers.get("host"));
    if (!host) return new NextResponse(null, { status: 404 });
    for (const [name, value] of Object.entries(await panelHostHeaders(host, key))) headers.set(name, value);
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/api/v1/:path*", "/sanctum/:path*"],
};
