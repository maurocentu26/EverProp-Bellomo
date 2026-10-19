// Local HTTP regression with real sessions (Redis) and the existing MySQL test user.
// E2E_EMAIL=... E2E_PASSWORD=... node tests/e2e/logout-concurrency.mjs
import assert from "node:assert/strict";

const base = process.env.E2E_BASE_URL || "http://127.0.0.1:5173";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Local stack only");
assert(process.env.E2E_EMAIL && process.env.E2E_PASSWORD, "Set E2E_EMAIL and E2E_PASSWORD for a local test user");
const jar = new Map();
const received = [];
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function request(path, method = "GET", body, cookies = cookieHeader()) {
  const headers = {
    Accept: "application/json", Origin: base, Referer: `${base}/admin`,
    "X-Everprop-Tenant": process.env.E2E_TENANT || "bellomo", Cookie: cookies,
  };
  if (method !== "GET") headers["X-XSRF-TOKEN"] = decodeURIComponent(jar.get("XSRF-TOKEN") || "");
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(base + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
    redirect: "manual", signal: AbortSignal.timeout(30_000),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0], i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  received.push(cookieHeader());
  await response.text();
  return response.status;
}

await request("/sanctum/csrf-cookie");
assert.equal(await request("/api/v1/auth/login", "POST", {
  email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD,
}), 200, "Test user must log in");

try {
  assert.equal(await request("/api/v1/auth/me"), 200);
  const oldCookies = cookieHeader();
  received.length = 0;
  // A second tab has the same cookie. Exercise both orders around logout.
  const before = Array.from({ length: 8 }, () => request("/api/v1/admin/notifications/count", "GET", undefined, oldCookies));
  const logout = request("/api/v1/auth/logout", "POST", undefined, oldCookies);
  const after = Array.from({ length: 8 }, () => request("/api/v1/admin/notifications/count", "GET", undefined, oldCookies));
  const statuses = await Promise.all([...before, logout, ...after]);
  assert.equal(statuses[8], 204, "Logout must complete");
  assert(statuses.every((s, i) => i === 8 || s === 200 || s === 401), "Concurrent reads must not fail");
  // Replay every response's cookies, including old-tab and late-response cookies.
  const snapshots = [...new Set([oldCookies, ...received])];
  for (const cookies of snapshots) {
    assert.equal(await request("/api/v1/auth/me", "GET", undefined, cookies), 401,
      "Logout must remain effective with old or late-response cookies");
  }
  console.log(`PASS: logout with 16 concurrent reads; ${snapshots.length} cookie snapshots rejected`);
} finally {
  await request("/api/v1/auth/logout", "POST");
}
