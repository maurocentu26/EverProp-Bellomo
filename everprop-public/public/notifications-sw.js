self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const candidate = new URL(event.notification.data?.url || "/admin", self.location.origin);
  const target = candidate.origin === self.location.origin && candidate.pathname.startsWith("/admin") ? candidate.href : new URL("/admin", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const client = clients.find((item) => item.url.startsWith(self.location.origin + "/admin"));
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
