import { MessageSquare } from "lucide-react";
import { type Lead } from "@/data/admin-sample";
import { leadConversationHref } from "@/lib/conversation-presentation";
import { cn } from "@/lib/utils";

export function LeadMessagesLink({ lead, className }: { lead: Pick<Lead, "id" | "name" | "phone" | "email">; className?: string }) {
  const href = leadConversationHref(lead);
  if (!href) return <span className="text-sm text-muted-foreground">Sin teléfono ni email para buscar mensajes</span>;

  return <a href={href} target="_blank" rel="noopener noreferrer" className={cn("inline-flex min-h-13 md:min-h-11 min-w-0 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600", className)}>
    <MessageSquare className="h-5 w-5 shrink-0" aria-hidden />
    <span>Mensajes<span className="sr-only"> de {lead.name} (se abre en otra pestaña)</span></span>
  </a>;
}
