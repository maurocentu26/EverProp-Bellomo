self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
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
    icon: "/brand/bellomo/symbol.png", tag: payload.tag,
    data: { url: payload.url || "/admin/notifications" },
    requireInteraction: true, silent: false,
  }));
});
