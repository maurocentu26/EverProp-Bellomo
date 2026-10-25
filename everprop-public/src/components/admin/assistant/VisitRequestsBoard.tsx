"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useCurrentSession } from "@/hooks/use-current-session";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  confirmVisitRequest,
  declineVisitRequest,
  formatSlot,
  listVisitRequests,
  slotToLocalInput,
  type VisitRequest,
} from "@/lib/assistant-api";

export function VisitRequestsBoard({ conversationId, channelLabel }: { conversationId?: string; channelLabel?: string } = {}) {
  const { user } = useCurrentSession();
  const readOnly = user?.apiRole === "READ_ONLY";
  const [items, setItems] = useState<VisitRequest[]>([]);
  const [error, setError] = useState("");
  const [when, setWhen] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<{ item: VisitRequest; date: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");

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

  function confirm(item: VisitRequest) {
    const value = when[item.id] ?? (item.slots[0] ? slotToLocalInput(item.slots[0].start_utc) : "");
    if (!value) return toast.error("Elegí fecha y hora.");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return toast.error("Elegí una fecha y hora válidas.");
    setConfirmError("");
    setConfirmation({ item, date: date.toISOString() });
  }

  async function saveConfirmation() {
    if (!confirmation || confirming) return;
    setConfirming(true);
    try {
      await confirmVisitRequest(confirmation.item.id, confirmation.date);
      setConfirmation(null);
      toast.success("Visita agendada. Avisale al cliente desde la conversación.");
      await refresh();
    } catch {
      setConfirmError("No se pudo confirmar. Revisá si ya se resolvió o si la fecha es pasada.");
    } finally {
      setConfirming(false);
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

  const visibleItems = conversationId ? items.filter(item => item.conversation_id === conversationId) : items;

  return (
    <section className={`${conversationId ? "conversation-visits" : "mi-day mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-4 pb-6"}`}>
      {conversationId && <section className="conversation-about">
        <h2>Sobre este cliente</h2>
        <dl>
          <div><dt>Interés solicitado</dt><dd>{error ? "No se pudo cargar el interés de las solicitudes." : visibleItems.length ? visibleItems.map(item => [item.property.code, item.property.title].filter(Boolean).join(" · ")).join("; ") : "Sin solicitudes de visita pendientes."}</dd></div>
          <div><dt>Etapa comercial</dt><dd>Consultar en la ficha del cliente</dd></div>
          <div><dt>Origen de la conversación</dt><dd>{channelLabel}</dd></div>
        </dl>
      </section>}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {conversationId ? <h2>Visitas solicitadas</h2> : <h1 className="text-2xl font-bold">Solicitudes de visita</h1>}
          <p className="mt-1 text-sm text-muted-foreground">Pedidas por clientes al asistente. No están agendadas hasta que las confirmes acá.</p>
        </div>
        <button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold">
          <RefreshCw className="h-4 w-4" aria-hidden /> Actualizar
        </button>
      </header>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200">{error}</p>}
      <ul role="list" className="grid gap-3">
        {visibleItems.length === 0 && !error && <li className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No hay solicitudes pendientes.</li>}
        {visibleItems.map((item) => (
          <li key={item.id} className={`${conversationId ? "conversation-visit " : ""}grid gap-3 rounded-2xl border border-border bg-card p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold">Solicitada · por confirmar</p>
                <p className="flex items-center gap-2 font-semibold"><CalendarCheck className="h-4 w-4" aria-hidden /> {item.property.code ?? ""} {item.property.title}</p>
                <p className="text-sm text-muted-foreground">
                  {item.contact.name || "Visitante"} · {item.contact.phone ?? "sin teléfono"} {item.contact.email ? `· ${item.contact.email}` : ""}
                  {item.contact.unverified.length > 0 && " · datos declarados en el chat, sin verificar"}
                </p>
              </div>
              {!conversationId && <Link href={`/admin/conversaciones?c=${item.conversation_id}`} className="text-sm font-semibold text-blue-700 underline dark:text-blue-300">Ver conversación</Link>}
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
                <button type="button" onClick={() => void confirm(item)} className="mi-day-primary">Revisar y confirmar visita</button>
                <button type="button" onClick={() => void decline(item)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Rechazar</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !confirming) setConfirmation(null); }}>
        <DialogContent showCloseButton={false} className="admin-workspace mi-day mi-day-guide sm:max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-6">
          <DialogTitle className="text-2xl font-bold">¿Confirmamos la visita?</DialogTitle>
          <DialogDescription>Revisá los datos antes de agendar. Después avisale al cliente desde la conversación.</DialogDescription>
          {confirmation && <dl className="space-y-3 break-words">
            <div><dt className="font-bold">Cliente</dt><dd>{confirmation.item.contact.name || "Visitante (nombre sin informar)"}</dd></div>
            <div><dt className="font-bold">Unidad</dt><dd>{confirmation.item.property.code ?? "Código sin informar"} · {confirmation.item.property.title}</dd></div>
            <div><dt className="font-bold">Fecha y hora</dt><dd>{new Date(confirmation.date).toLocaleString("es-AR", { dateStyle: "full", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" })} (hora argentina)</dd></div>
          </dl>}
          {confirmError && <p role="alert" className="text-rose-700 dark:text-rose-300">{confirmError}</p>}
          <Button className="mi-day-primary" disabled={confirming} onClick={() => void saveConfirmation()}>{confirming ? "Confirmando…" : "Confirmar y agendar"}</Button>
          <Button variant="outline" disabled={confirming} onClick={() => setConfirmation(null)}>Todavía no</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
