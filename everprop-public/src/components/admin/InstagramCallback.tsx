"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/everprop-api";

export function InstagramCallback() {
  const started = useRef(false);
  const [message, setMessage] = useState("Completando la conexión con Instagram…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    // Remove the one-use code before rendering links; never put it in storage or subsequent navigation.
    window.history.replaceState(null, "", window.location.pathname);
    const state = params.get("state");
    const code = params.get("code");
    const cancelled = params.has("error");
    const operation = !state || (!code && !cancelled) ? Promise.reject(new Error("Incomplete callback")) : apiFetch<{ data: { username: string } }>("/api/v1/admin/integrations/instagram/connect", {
      method: "POST", body: JSON.stringify({ state, ...(cancelled ? { error: "access_denied" } : { code }) }), signal: AbortSignal.timeout(45_000),
    });
    operation.then(({ data }) => setMessage(cancelled ? "No se conectó Instagram. Podés volver a intentarlo desde Ajustes." : `Instagram conectado: @${data.username}. Ya podés recibir y responder sus mensajes desde EverProp.`))
      .catch(() => setMessage(cancelled ? "No se conectó Instagram. Podés volver a intentarlo desde Ajustes." : "No pudimos confirmar la conexión. Revisá la cuenta en Ajustes; si no aparece conectada, iniciá sesión en EverProp y volvé a intentarlo."));
  }, []);

  return <main className="mx-auto max-w-xl space-y-4 p-6">
    <h1 className="text-2xl font-bold">Conectar Instagram</h1>
    <p role="status">{message}</p>
    <Link href="/admin/settings#instagram" className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 font-semibold">Volver a Ajustes</Link>
  </main>;
}
