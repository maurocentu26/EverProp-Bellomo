"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/everprop-api";

function subscribeToHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export default function PasswordRecoveryPage() {
  const hash = useSyncExternalStore<string | null>(subscribeToHash, () => window.location.hash, () => null);
  const params = new URLSearchParams(hash?.slice(1));
  const token = params.get("token");
  const email = params.get("email");
  const link = token && email ? { token, email } : null;
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(form);
    if (link && data.password !== data.password_confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch("/sanctum/csrf-cookie");
      const result = await apiFetch<{ message: string }>(`/api/v1/auth/${link ? "reset-password" : "forgot-password"}`, {
        method: "POST",
        body: JSON.stringify(link ? { ...data, ...link } : { email: String(data.email).trim() }),
      });
      setMessage(result.message);
      if (link) window.history.replaceState(null, "", "/recuperar");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo completar la solicitud. Intentá nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-white/20 bg-slate-950 px-4 py-3 text-base text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/40";
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <section aria-labelledby="recovery-title" className="w-full max-w-md space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
        <h1 id="recovery-title" className="text-2xl font-semibold">{link ? "Elegí una nueva contraseña" : "Recuperar tu acceso"}</h1>
        {hash === null ? <p role="status">Cargando…</p> : message ? <p role="status" className="text-sm leading-6 text-slate-200">{message}</p> : (
          <form onSubmit={submit} className="space-y-4" aria-busy={saving}>
            {link ? (
              <>
                <p className="break-words text-sm text-slate-300">Cuenta: {link.email}</p>
                <p id="password-help" className="text-sm text-slate-300">Usá al menos 12 caracteres, con letras y números.</p>
                <label className="block text-sm font-medium">
                  Nueva contraseña
                  <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={4096} required aria-describedby="password-help" className={inputClass} />
                </label>
                <label className="block text-sm font-medium">
                  Repetir contraseña
                  <input name="password_confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={4096} required className={inputClass} />
                </label>
              </>
            ) : (
              <>
                <p className="text-sm leading-6 text-slate-300">Ingresá el correo de tu cuenta. Si corresponde a una cuenta activa, recibirás un enlace que vence en 60 minutos.</p>
                <label className="block text-sm font-medium">
                  Correo electrónico
                  <input name="email" type="email" autoComplete="username" maxLength={320} required className={inputClass} />
                </label>
              </>
            )}
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            <button type="submit" disabled={saving} className="min-h-11 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:opacity-60">
              {saving ? "Procesando…" : link ? "Guardar contraseña" : "Enviar enlace"}
            </button>
          </form>
        )}
        <Link href="/login" className="inline-flex min-h-11 items-center text-sm text-blue-300 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">Volver a ingresar</Link>
      </section>
    </main>
  );
}
