"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { getLeadWhatsapp, renderTemplate, startLeadWhatsapp, type LeadWhatsapp, type WhatsAppTemplate } from "@/lib/conversations-api";

const REASONS: Record<NonNullable<LeadWhatsapp["reason"]>, string> = {
  NO_PHONE: "El cliente no tiene un teléfono válido para WhatsApp. Cargalo en su ficha.",
  NO_CHANNEL: "No hay un número de WhatsApp Business conectado.",
  NO_TEMPLATES: "No hay plantillas aprobadas para iniciar el chat. Se crean en WhatsApp Manager y Meta las revisa.",
  CONVERSATION_OF_ANOTHER_ADVISOR: "Este cliente ya tiene una conversación que atiende otro asesor.",
};

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/**
 * EVP-91: «Mensajes» from a lead. Opens its WhatsApp thread when the server finds exactly that number, or offers
 * to start one with an approved template. Nothing is sent until the advisor confirms the rendered message.
 */
export function LeadWhatsappStart({ leadId, readOnly, onOpen }: { leadId: string; readOnly: boolean; onOpen: (conversationId: string) => void }) {
  const [info, setInfo] = useState<LeadWhatsapp | null>(null);
  const [error, setError] = useState("");
  const [template, setTemplate] = useState<WhatsAppTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  // The key belongs to the exact message: retrying the same one cannot send it twice.
  const key = useRef({ key: newKey(), text: "" });
  const opened = useRef(onOpen);
  useEffect(() => { opened.current = onOpen; });

  useEffect(() => {
    let active = true;
    getLeadWhatsapp(leadId).then((response) => {
      if (!active) return;
      if (response.data.conversation_id) opened.current(response.data.conversation_id);
      else setInfo(response.data);
    }).catch(() => { if (active) setError("No pudimos consultar el WhatsApp del cliente. Buscalo en la lista."); });
    return () => { active = false; };
  }, [leadId]);

  if (!info) return error ? <p role="alert" className="rounded-lg border border-border px-3 py-2 text-sm">{error}</p> : null;
  if (info.reason) return <p role="status" className="rounded-lg border border-border px-3 py-2 text-sm">{REASONS[info.reason]}</p>;
  if (readOnly) return <p role="status" className="rounded-lg border border-border px-3 py-2 text-sm">Este cliente todavía no tiene conversación de WhatsApp.</p>;

  const text = template ? renderTemplate(template.body, params) : "";

  async function send() {
    if (!template) return;
    if (key.current.text !== text) key.current = { key: newKey(), text };
    setSending(true);
    setError("");
    try {
      const response = await startLeadWhatsapp(leadId, template, params.map((p) => p.trim()), key.current.key);
      opened.current(response.data.conversation_id);
    } catch (e) {
      setSending(false);
      setConfirming(false);
      setError(e instanceof Error && e.message ? e.message : "No pudimos iniciar el chat. Probá de nuevo.");
    }
  }

  return (
    <section aria-label="Iniciar chat por WhatsApp" className="space-y-2 rounded-lg border border-border p-3">
      <h2 className="flex items-center gap-2 text-base font-semibold"><MessageSquareText className="h-5 w-5" aria-hidden /> Sin conversación de WhatsApp</h2>
      <p className="text-sm text-muted-foreground">Para escribirle a {info.phone} desde el número de la empresa, WhatsApp exige empezar con una plantilla aprobada.</p>
      {error && <p role="alert" className="text-sm font-semibold">{error}</p>}
      {!template ? (
        <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label="Plantillas aprobadas">
          {info.templates.map((t) => (
            <li key={`${t.name}-${t.language}`}>
              <button type="button" onClick={() => { setTemplate(t); setParams(Array.from({ length: t.params }, () => "")); }}
                className="min-h-11 w-full rounded-lg bg-muted px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-blue-600">
                <span className="block font-semibold">{t.name.replaceAll("_", " ")}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{t.body}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); if (confirming) void send(); else setConfirming(true); }} className="space-y-2">
          <p className="whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm" aria-live="polite">{text}</p>
          {params.map((value, index) => (
            <label key={index} className="flex flex-col gap-1 text-xs font-semibold">Dato {`{{${index + 1}}}`}
              <input value={value} maxLength={200} required disabled={confirming}
                onChange={(event) => setParams((all) => all.map((v, i) => (i === index ? event.target.value : v)))}
                className="min-h-11 rounded-lg border border-border px-3 text-base font-normal sm:text-sm" />
            </label>
          ))}
          {confirming && <p role="status" className="text-sm font-semibold">Se enviará este mensaje a {info.phone}. ¿Confirmás?</p>}
          <div className="flex gap-2">
            <button type="button" disabled={sending} onClick={() => (confirming ? setConfirming(false) : setTemplate(null))}
              className="min-h-11 flex-1 rounded-full border border-border px-4 text-sm font-semibold">{confirming ? "Volver" : "Otra plantilla"}</button>
            <button type="submit" disabled={sending || params.some((p) => p.trim() === "")}
              className="wa-accent min-h-11 flex-1 rounded-full px-4 text-sm font-semibold disabled:opacity-50">
              {sending ? "Enviando…" : confirming ? "Confirmar y enviar" : "Revisar mensaje"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
