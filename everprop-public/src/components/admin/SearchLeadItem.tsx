import { Phone, ArrowRight } from "lucide-react";
import { HighlightedText } from "@/components/ui/highlighted-text";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Lead } from "@/data/admin-sample";

interface Props {
  lead: Lead;
  query: string;
  onSelect: (id: string) => void;
}

export function SearchLeadItem({ lead, query, onSelect }: Props) {
  return (
    <button
      onClick={() => onSelect(lead.id)}
      className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50 group transition-all"
    >
      <Avatar className="h-10 w-10 shrink-0 border border-slate-100 shadow-sm">
        <AvatarFallback className="bg-emerald-50 text-emerald-700 text-xs font-black uppercase">
          {lead.name.substring(0, 2)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">
          <HighlightedText text={lead.name} query={query} />
        </p>
        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
          <span className="font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase tracking-tighter">
            {lead.origin}
          </span>
          {lead.phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" /> 
              <HighlightedText text={lead.phone} query={query} />
            </span>
          )}
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-slate-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
    </button>
  );
}