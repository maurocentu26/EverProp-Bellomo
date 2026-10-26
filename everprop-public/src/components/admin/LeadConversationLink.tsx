"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type Lead } from "@/data/admin-sample";
import { listConversations, MIN_SEARCH } from "@/lib/conversations-api";
import { deferEffectUpdate } from "@/lib/deferred-effect";

export function LeadConversationLink({ lead }: { lead: Pick<Lead, "phone" | "email"> }) {
  // Keep the loaded contact: editing the ficha must not trigger another search.
  const [term] = useState(() => lead.phone?.replace(/\D/g, "") || lead.email?.trim() || "");
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const cancel = deferEffectUpdate(() => {
      if (term.length < MIN_SEARCH) return;
      void listConversations("all", term).then(({ data }) => {
        if (active) setConversationId(data[0]?.id ?? null);
      }).catch(() => {});
    });
    return () => { active = false; cancel(); };
  }, [term]);

  if (!conversationId) return null;
  return <Link className="mi-day-secondary lead-conversation-link" href={`/admin/conversaciones?c=${encodeURIComponent(conversationId)}`}>Ver conversación</Link>;
}
