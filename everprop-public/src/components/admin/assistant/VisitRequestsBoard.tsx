"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useCurrentSession } from "@/hooks/use-current-session";
import {
  confirmVisitRequest,
  declineVisitRequest,
  formatSlot,
  listVisitRequests,
  slotToLocalInput,
  type VisitRequest,
} from "@/lib/assistant-api";

export function VisitRequestsBoard() {
  const { user } = useCurrentSession();
  const readOnly = user?.apiRole === "READ_ONLY";
  const [items, setItems] = useState<VisitRequest[]>([]);
  const [error, setError] = useState("");
  const [when, setWhen] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      setItems((await listVisitRequests("REQUESTED")).data);
      setError("");
    } catch {
      setError("No se pudieron cargar las solicitudes.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function confirm(item: VisitRequest) {
    const value = when[item.id] ?? (item.slots[0] ? slotToLocalInput(item.slots[0].start_utc) : "");
    if (!value) return toast.error("Elegí fecha y hora.");
    try {
      await confirmVisitRequest(item.id, new Date(value).toISOString());
      toast.success("Visita agendada. Avisale al cliente desde la conversación.");
      await refresh();
    } catch {
      toast.error("No se pudo confirmar (¿ya la resolvió otra persona o la fecha es pasada?).");
    }
  }

  async function decline(item: VisitRequest) {
    if (!window.confirm("¿Rechazar esta solicitud? Avisale al cliente desde la conversación.")) return;
    try {
      await declineVisitRequest(item.id);
      await refresh();
    } catch {
      toast.error("No se pudo rechazar.");
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-4 pb-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Solicitudes de visita</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pedidas por clientes al asistente. No están agendadas hasta que las confirmes acá.</p>
        </div>
        <button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold">
          <RefreshCw className="h-4 w-4" aria-hidden /> Actualizar
        </button>
      </header>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200">{error}</p>}
      <ul role="list" className="grid gap-3">
        {items.length === 0 && !error && <li className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No hay solicitudes pendientes.</li>}
        {items.map((item) => (
          <li key={item.id} className="grid gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold"><CalendarCheck className="h-4 w-4" aria-hidden /> {item.property.code ?? ""} {item.property.title}</p>
                <p className="text-sm text-muted-foreground">
                  {item.contact.name || "Visitante"} · {item.contact.phone ?? "sin teléfono"} {item.contact.email ? `· ${item.contact.email}` : ""}
                  {item.contact.unverified.length > 0 && " · datos declarados en el chat, sin verificar"}
                </p>
              </div>
              <Link href={`/admin/conversaciones?c=${item.conversation_id}`} className="text-sm font-semibold text-blue-700 underline dark:text-blue-300">Ver conversación</Link>
            </div>
            <ul className="text-sm">
              {item.slots.map((slot) => <li key={slot.start_utc}>• {formatSlot(slot)}</li>)}
            </ul>
            {item.note && <p className="rounded-lg bg-muted p-2 text-sm">“{item.note}”</p>}
            {!readOnly && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-sm font-medium">
                  Fecha y hora acordada
                  <input type="datetime-local" value={when[item.id] ?? (item.slots[0] ? slotToLocalInput(item.slots[0].start_utc) : "")}
                    onChange={(e) => setWhen({ ...when, [item.id]: e.target.value })} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" />
                </label>
                <button type="button" onClick={() => void confirm(item)} className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white">Confirmar y agendar</button>
                <button type="button" onClick={() => void decline(item)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Rechazar</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
