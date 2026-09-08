"use client";

import { useEffect, useState } from "react";
import { requestDesktopNotificationPermission } from "@/lib/notifications";

export function NotificationPermissionPrompt() {
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "default") return;
    try { if (sessionStorage.getItem("everprop:notification-prompt")) return; } catch { /* Storage may be unavailable. */ }
    const timer = window.setTimeout(() => setVisible(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function dismiss() {
    try { sessionStorage.setItem("everprop:notification-prompt", "seen"); } catch { /* Optional preference. */ }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <section role="region" aria-label="Permiso de notificaciones" className="fixed bottom-4 left-4 right-4 z-50 rounded-2xl border border-border bg-background p-4 shadow-xl sm:left-auto sm:w-96">
      <h2 className="font-semibold">¿Activar notificaciones?</h2>
      <p className="mt-1 text-sm text-muted-foreground">Recibí avisos de nuevos leads y seguimientos mientras usás el sistema.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={pending} onClick={dismiss} className="min-h-11 rounded-xl border px-3 text-sm">Ahora no</button>
        <button type="button" disabled={pending} onClick={async () => {
          setPending(true);
          try { await requestDesktopNotificationPermission(); } catch { /* Browser may block its permission prompt. */ } finally { setPending(false); dismiss(); }
        }} className="min-h-11 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white disabled:opacity-50">Activar</button>
      </div>
    </section>
  );
}
