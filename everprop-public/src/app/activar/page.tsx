"use client";
import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/everprop-api";

export default function ActivatePage() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (saving) return;
    const form = new FormData(e.currentTarget);
    setSaving(true); setError("");
    try {
      await apiFetch("/sanctum/csrf-cookie");
      await apiFetch("/api/v1/auth/activate", {method: "POST", body: JSON.stringify({...Object.fromEntries(form), token: window.location.hash.slice(1)})});
      window.history.replaceState(null, "", "/activar"); setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo activar la cuenta."); }
    finally { setSaving(false); }
  }
  return <main className="mx-auto max-w-md space-y-5 p-6 pt-16"><h1 className="text-2xl font-bold">Activar tu cuenta</h1>{done ? <p>Tu cuenta está lista. <Link className="text-blue-600 underline" href="/login">Ingresar</Link></p> : <form onSubmit={submit} className="space-y-4"><p className="text-sm">Elegí una contraseña de al menos 12 caracteres con letras y números.</p><label className="block">Contraseña<input className="mt-1 w-full rounded-xl border p-3" name="password" type="password" minLength={12} autoComplete="new-password" required/></label><label className="block">Repetir contraseña<input className="mt-1 w-full rounded-xl border p-3" name="password_confirmation" type="password" minLength={12} autoComplete="new-password" required/></label><button disabled={saving} className="rounded-xl bg-blue-600 px-5 py-3 text-white disabled:opacity-50">{saving ? "Activando…" : "Activar cuenta"}</button></form>}{error && <p role="alert" className="text-red-600">{error}</p>}</main>;
}
