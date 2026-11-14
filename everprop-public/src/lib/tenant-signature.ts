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

async function hmac(message: string, key: string): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const cryptoKey = await subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(mac), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signPanelHost(host: string, timestamp: number, key: string): Promise<string> {
  return hmac(`${PURPOSE}\n${host}\n${timestamp}`, key);
}

/**
 * EVP-132: every panel request reaches the API from the platform's servers, so the API would rate-limit all users
 * as one client. The panel signs the visitor's IP ("eversys-client-ip-v1\nip\ntimestamp") and the API keys its
 * login/form/chat limits by it. Browser-sent copies are dropped like the host headers.
 */
export const CLIENT_HEADERS = ["x-eversys-client-ip", "x-eversys-client-timestamp", "x-eversys-client-signature"] as const;

/** Rightmost X-Forwarded-For entry: the one the nearest proxy appended, so a client cannot choose it. */
export function clientIpFromForwarded(forwarded: string | null): string | null {
  const ip = (forwarded ?? "").split(",").pop()?.trim() ?? "";
  return /^[0-9a-f.:]{2,45}$/i.test(ip) && /[.:]/.test(ip) ? ip : null;
}

export async function clientIpHeaders(ip: string, key: string, now = Date.now()): Promise<Record<string, string>> {
  const timestamp = Math.floor(now / 1000);
  return {
    "x-eversys-client-ip": ip,
    "x-eversys-client-timestamp": String(timestamp),
    "x-eversys-client-signature": await hmac(`eversys-client-ip-v1\n${ip}\n${timestamp}`, key),
  };
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
