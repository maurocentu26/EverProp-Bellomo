"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/everprop-api";

export function PushPreferences() {
  const [config, setConfig] = useState<{ enabled: boolean; publicKey: string; subscriptionHashes: string[] } | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window);
    let mounted = true;
    async function load() {
      try {
        const settings = await apiFetch<{enabled:boolean;publicKey:string;subscriptionHashes:string[]}>("/api/v1/admin/push/config");
        if (!mounted) return;
        setConfig(settings);
        if (!("serviceWorker" in navigator)) return;
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager?.getSubscription();
        if (!subscription) return;
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(subscription.endpoint));
        const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        if (mounted) setActive(settings.subscriptionHashes.includes(hash));
      } catch {
        if (mounted) setMessage("No se pudo comprobar la configuración de avisos. Volvé a cargar la página.");
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);
  async function toggle() {
    if (busy || !config || !supported) return;
    setBusy(true); setMessage("");
    try {
      const registration = await navigator.serviceWorker.register("/notifications-sw.js");
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (active && subscription) {
        await apiFetch("/api/v1/admin/push/subscriptions", {method:"DELETE",body:JSON.stringify({endpoint:subscription.endpoint})});
        await subscription.unsubscribe(); setActive(false); setMessage("Avisos desactivados en este dispositivo."); return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Permití las notificaciones en la configuración del navegador para activarlas.");
      const base64 = config.publicKey.replace(/-/g,"+").replace(/_/g,"/");
      const key = Uint8Array.from(atob(base64 + "=".repeat((4-base64.length%4)%4)), char=>char.charCodeAt(0));
      subscription ??= await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
      await apiFetch("/api/v1/admin/push/subscriptions", {method:"POST",body:JSON.stringify(subscription.toJSON())});
      setActive(true); setMessage("Avisos activados en este dispositivo.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudieron activar los avisos."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
    <h2 className="font-semibold">Avisos en este dispositivo</h2>
    <p className="text-sm text-muted-foreground">Recibí notificaciones aunque cierres el panel. En iPhone, agregá Bellomo a la pantalla de inicio y abrilo desde su ícono. El sonido respeta la configuración del teléfono.</p>
    {!supported ? <p className="text-sm">Este navegador necesita una conexión segura y soporte de notificaciones push.</p> : config && !config.enabled ? <p className="text-sm">Los avisos con el panel cerrado están pendientes de configuración del servidor.</p> : <button type="button" disabled={!config || busy} onClick={() => void toggle()} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Guardando…" : active ? "Desactivar avisos" : "Activar avisos"}</button>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
