import { Building2, MapPin, ArrowRight } from "lucide-react";
import { HighlightedText } from "@/components/ui/highlighted-text";
import { Property } from "@/data/admin-sample";

interface Props {
  property: Property;
  query: string;
  onSelect: (id: string) => void;
}

export function SearchPropertyItem({ property, query, onSelect }: Props) {
  return (
    <button
      onClick={() => onSelect(property.id)}
      className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50 group transition-all"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
        <Building2 className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">
          <HighlightedText text={property.title} query={query} />
        </p>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <MapPin className="h-3.5 w-3.5 text-slate-400" /> 
          <HighlightedText text={property.neighborhood} query={query} />
          <span className="text-slate-300">•</span>
          <span className="text-blue-600 font-bold">
            {property.currency} {property.price.toLocaleString('es-AR')}
          </span>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-slate-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
    </button>
  );
}