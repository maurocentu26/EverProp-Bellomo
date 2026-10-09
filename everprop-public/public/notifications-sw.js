self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Installed app without network: a plain notice instead of the browser's error page. Nothing is
// cached on purpose, so no tenant data stays on the device after logout.
const OFFLINE_PAGE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sin conexión</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#0c1520;color:#f4f6f8;padding:16px;box-sizing:border-box}main{max-width:22rem;text-align:center}button{margin-top:1rem;min-height:44px;padding:0 1.25rem;border:0;border-radius:12px;background:#2563eb;color:#fff;font:inherit;font-weight:600}</style></head>
<body><main><h1>Sin conexión</h1><p>No pudimos abrir el panel. Los mensajes de los clientes siguen llegando y te vamos a avisar cuando vuelva la señal.</p><button onclick="location.reload()">Reintentar</button></main></body></html>`;
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })));
});
function adminTarget(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "/admin", self.location.origin);
    if (url.origin === self.location.origin && (url.pathname === "/admin" || url.pathname.startsWith("/admin/"))) return url.href;
  } catch {}
  return new URL("/admin", self.location.origin).href;
}
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = adminTarget(event.notification.data?.url);
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const client = clients.find((item) => {
      try {
        const url = new URL(item.url);
        return url.origin === self.location.origin && (url.pathname === "/admin" || url.pathname.startsWith("/admin/"));
      } catch { return false; }
    });
    if (client) { await client.navigate(target); return client.focus(); }
    return self.clients.openWindow(target);
  }));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification(payload.title || "Bellomo", {
    body: payload.body || "Tenés una nueva notificación.",
    icon: "/icon/192", tag: payload.tag, renotify: Boolean(payload.tag),
    data: { url: payload.url || "/admin/notifications" },
    requireInteraction: true, silent: false,
  }));
});
