/**
 * Signed channel panel → API (S02, ADR 0005). The panel asserts the host the user typed so one API serves
 * many tenant domains; the API verifies HMAC-SHA256("eversys-panel-host-v1\nhost\ntimestamp") with the shared
 * key. Server-only: the key never reaches the browser, and headers with these names from the browser are dropped.
 */
export const PANEL_HEADERS = ["x-eversys-panel-host", "x-eversys-panel-timestamp", "x-eversys-panel-signature"] as const;

const PURPOSE = "eversys-panel-host-v1";

/**
 * The domain the user is on, from the Host header (platforms route by it). Not `request.nextUrl.hostname`:
 * under `next start` that is the server's own hostname (localhost), the same for every tenant.
 * Null for anything that is not a plain DNS name (ports are stripped; IPv6 and odd characters rejected).
 */
export function hostFromHeader(hostHeader: string | null): string | null {
  const host = (hostHeader ?? "").trim().toLowerCase().replace(/:\d+$/, "");
  return /^[a-z0-9.-]{1,253}$/.test(host) ? host : null;
}

export async function signPanelHost(host: string, timestamp: number, key: string): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const cryptoKey = await subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(`${PURPOSE}\n${host}\n${timestamp}`));
  return Array.from(new Uint8Array(mac), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Headers to forward to the API for an already validated host. */
export async function panelHostHeaders(host: string, key: string, now = Date.now()): Promise<Record<string, string>> {
  const timestamp = Math.floor(now / 1000);
  return {
    "x-eversys-panel-host": host,
    "x-eversys-panel-timestamp": String(timestamp),
    "x-eversys-panel-signature": await signPanelHost(host, timestamp, key),
  };
}
