"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { BellomitoAvatar } from "./BellomitoAvatar";
import { useWebsite } from "@/components/WebsiteProvider";

const isLocalDemo = process.env.NEXT_PUBLIC_LOCAL_DEMO === "1";
const INITIAL_GREETING = isLocalDemo ? "Hola, soy Bellomito en modo demo local. Puedo mostrarte las propiedades publicadas desde el panel. ¿Buscás una casa, un departamento o un lote?" :
  "¡Hola! Soy Bellomito ✨, tu asistente en Bellomo Desarrollos. ¿Querés que te cuente sobre los loteos en Barrio San José o preferís ver locales comerciales? 🏔️";

const QUICK_CHIPS = isLocalDemo ? [
  { label: "Propiedades publicadas", text: "¿Qué propiedades hay publicadas?" },
  { label: "Casas", text: "Casa" },
  { label: "Departamentos", text: "Departamento" },
  { label: "Lotes", text: "Lote" },
] : [
  {
    label: "📍 Barrio San José",
    text: "¿Podés darme información sobre los loteos en Barrio San José y la financiación?",
  },
  {
    label: "🏢 Torre Bellomo",
    text: "¿Qué departamentos hay disponibles en Torre Bellomo y sus amenities?",
  },
  {
    label: "🏬 Locales Comerciales",
    text: "¿Qué locales comerciales tienen disponibles y sus características?",
  },
  {
    label: "💰 Planes de Cuotas",
    text: "¿Cómo funcionan los anticipos y las cuotas para comprar un lote o depto?",
  },
];

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type LeadForm = {
  name: string;
  phone: string;
  email: string;
};

const welcomeMessage: ChatMessage = {
  id: "welcome-message",
  role: "assistant",
  text: INITIAL_GREETING,
};

export function AIChatBubble() {
  const { content } = useWebsite();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadForm, setLeadForm] = useState<LeadForm>({ name: "", phone: "", email: "" });
  const [leadStatus, setLeadStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [leadError, setLeadError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLocalDemo) return;
    const timer = window.setTimeout(() => {
      if (!hasUserInteracted) setIsOpen(true);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [hasUserInteracted]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, showLeadForm, error]);

  const sendQuestion = async (question: string) => {
    const text = question.trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    };
    const conversation = [...messages, userMessage].slice(-20);

    setHasUserInteracted(true);
    setShowTooltip(false);
    setError("");
    setMessages(conversation);
    setIsLoading(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversation.map(({ role, text: content }) => ({ role, content })),
        }),
        signal: controller.signal,
      });
      const data = (await response.json()) as { text?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Bellomito no pudo responder.");
      }

      const answer = data.text?.trim();
      if (!answer) throw new Error("Bellomito devolvió una respuesta vacía.");

      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: answer },
      ]);
    } catch (reason) {
      setError(
        reason instanceof DOMException && reason.name === "AbortError"
          ? "La consulta tardó demasiado. Probá nuevamente."
          : reason instanceof Error
            ? reason.message
            : "Bellomito no está disponible en este momento.",
      );
    } finally {
      window.clearTimeout(timeout);
      setIsLoading(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendQuestion(input);
    setInput("");
  };

  const handleToggleOpen = () => {
    setHasUserInteracted(true);
    setShowTooltip(false);
    setIsOpen((current) => !current);
  };

  const handleClearChat = () => {
    setMessages([welcomeMessage]);
    setError("");
    setShowLeadForm(false);
    setLeadStatus("idle");
    setLeadError("");
  };

  const handleLeadSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (leadStatus === "submitting") return;

    setLeadStatus("submitting");
    setLeadError("");

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...leadForm,
          source: "BELLOMITO",
          notes: "Solicitud de contacto enviada desde Bellomito.",
        }),
      });
      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) throw new Error(data.error || "No pudimos registrar tu consulta.");

      setLeadStatus("success");
      setShowLeadForm(false);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.message || "Tu consulta quedó registrada. El equipo de Bellomo va a contactarte.",
        },
      ]);
    } catch (reason) {
      setLeadStatus("error");
      setLeadError(reason instanceof Error ? reason.message : "No pudimos registrar tu consulta.");
    }
  };

  if (isLocalDemo && !content.bot.enabled) return null;
  return (
    <div className="fixed bottom-4 left-4 right-4 z-[80] flex flex-col items-end pointer-events-auto sm:bottom-6 sm:left-auto sm:right-36">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="flex h-[min(400px,65dvh)] sm:h-[min(480px,75dvh)] w-full max-w-[380px] sm:w-[380px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10"
            role="dialog"
            aria-label="Chat con Bellomito"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-3 py-2 text-white">
              <div className="flex min-w-0 items-center gap-2">
                <BellomitoAvatar size="md" showOnlineStatus />
                <div>
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold leading-tight text-white">
                    {isLocalDemo ? content.bot.name : "Bellomito"}
                    <Sparkles size={13} className="fill-amber-400 text-amber-400" aria-hidden="true" />
                  </h2>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-300">

                    {isLocalDemo ? content.bot.subtitle : "Asistente de Bellomo"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleClearChat}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  aria-label="Limpiar conversación"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleToggleOpen}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  aria-label="Cerrar chat"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain bg-slate-50/50 p-3" aria-live="polite">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`min-w-0 max-w-[92%] break-words rounded-xl px-3 py-2 text-[13px] leading-[1.45] [&_p]:text-[13px] [&_p]:leading-[1.45] [&_ul]:my-1 [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:pl-4 [&_a]:break-all ${
                      message.role === "user"
                        ? "rounded-tr-xs bg-blue-600 text-white shadow-sm"
                        : "rounded-tl-xs bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80 [&_p]:m-0 [&_strong]:font-semibold [&_strong]:text-blue-700"
                    }`}
                  >
                    <ReactMarkdown>{isLocalDemo && message.id === "welcome-message" ? content.bot.greeting : message.text}</ReactMarkdown>
                  </div>
                </div>
              ))}

              {messages.length <= 2 && !isLoading && (
                <div className="mt-1 flex flex-wrap gap-1.5 pt-1">
                  {(isLocalDemo ? content.bot.suggestions.map(text => ({ label: text, text })) : QUICK_CHIPS).map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => void sendQuestion(chip.text)}
                      className="rounded-full border border-blue-200 bg-blue-50/80 px-3 py-1.5 text-left text-xs font-medium text-blue-700 transition-all hover:bg-blue-600 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-95"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}

              {(!isLocalDemo || content.bot.showContact) && !showLeadForm && leadStatus !== "success" && (
                <button
                  type="button"
                  onClick={() => {
                    setShowLeadForm(true);
                    setLeadError("");
                  }}
                  className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                >
                  <UserRound size={14} aria-hidden="true" /> Quiero que me contacten
                </button>
              )}

              {showLeadForm && (
                <form onSubmit={handleLeadSubmit} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Contacto comercial</p>
                    <p className="text-xs text-slate-500">Nombre y teléfono o email.</p>
                  </div>
                  <label className="block text-xs font-medium text-slate-700">
                    Nombre
                    <input
                      required
                      value={leadForm.name}
                      onChange={(event) => setLeadForm((current) => ({ ...current, name: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      autoComplete="name"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-700">
                    Teléfono
                    <input
                      value={leadForm.phone}
                      onChange={(event) => setLeadForm((current) => ({ ...current, phone: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="388 555 1234"
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-700">
                    Email
                    <input
                      type="email"
                      value={leadForm.email}
                      onChange={(event) => setLeadForm((current) => ({ ...current, email: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      autoComplete="email"
                    />
                  </label>
                  {leadError && <p className="text-xs text-red-700" role="alert">{leadError}</p>}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={leadStatus === "submitting"}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:bg-slate-300"
                    >
                      {leadStatus === "submitting" ? "Enviando…" : "Enviar consulta"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLeadForm(false)}
                      className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}

              {isLoading && (
                <div className="flex justify-start" aria-label="Bellomito está escribiendo">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-xs bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/80">
                    {[0, 0.2, 0.4].map((delay) => (
                      <motion.span
                        key={delay}
                        className="h-2 w-2 rounded-full bg-blue-600"
                        animate={{ y: [0, -5, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
                  {error}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-slate-100 bg-white p-3">
              <form
                onSubmit={handleSubmit}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 pl-4 pr-1 text-sm shadow-xs focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"
              >
                <label htmlFor="bellomito-message" className="sr-only">Escribí tu mensaje</label>
                <input
                  id="bellomito-message"
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Escribí tu mensaje..."
                  className="min-w-0 flex-1 bg-transparent py-2.5 outline-none placeholder:text-slate-400"
                  disabled={isLoading}
                  maxLength={600}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition-all hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-95 disabled:bg-slate-300 disabled:text-slate-500"
                  aria-label="Enviar mensaje"
                >
                  <Send size={14} aria-hidden="true" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isOpen && (
        <button
          type="button"
          onClick={handleToggleOpen}
          aria-label="Abrir chat con Bellomito"
          aria-expanded={false}
          className="bellomito-launcher relative flex h-14 w-14 shrink-0 items-center justify-center appearance-none border-0 p-0 rounded-lg bg-transparent text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:h-14 sm:w-14"
        >
          <AnimatePresence>
            {showTooltip && <motion.span
              aria-hidden="true"
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              className="bellomito-tooltip pointer-events-none absolute right-14 top-1/2 w-max max-w-[calc(100vw-7rem)] -translate-y-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium leading-snug text-white shadow-md sm:right-16"
            >
              <span className="sm:hidden">¿Te ayudo?</span>
              <span className="hidden sm:inline">Hablá con Bellomito</span>
            </motion.span>}
          </AnimatePresence>
          <BellomitoAvatar size="xl" showOnlineStatus />
        </button>
      )}
    </div>
  );
}
