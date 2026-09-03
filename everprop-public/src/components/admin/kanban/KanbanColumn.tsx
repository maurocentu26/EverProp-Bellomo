import { type ReactNode } from "react";
import Link from "next/link";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { STAGE_LABELS, type Stage } from "./types";

export function KanbanColumn({ 
  stage, 
  items, 
  children, 
  isHighlighted 
}: { 
  stage: Stage; 
  items: string[]; 
  children: ReactNode;
  isHighlighted: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-xl border-2 p-4 transition-all duration-200 min-h-[200px]",
        isHighlighted
          ? "border-blue-500 bg-blue-50/50 ring-4 ring-blue-500/10 shadow-lg scale-[1.01]"
          : "border-slate-200 bg-white shadow-sm"
      )}
    >
      <h3 className="mb-4 flex items-center justify-between text-sm font-bold uppercase tracking-wider text-slate-600">
        <span className="flex items-center gap-2">
          <span className={cn(
            "h-2 w-2 rounded-full",
            stage === 'new' ? "bg-slate-400" : 
            stage === 'contacted' ? "bg-blue-500" : 
            stage === 'visiting' ? "bg-amber-500" : "bg-emerald-500"
          )} />
          {STAGE_LABELS[stage]}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
          {items.length}
        </span>
      </h3>
      
      <SortableContext items={items.slice(0, 5)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-3 min-h-37.5">
          {children}
        </div>
      </SortableContext>
      
      {items.length > 5 && (
        <div className="pt-3 mt-auto border-t border-slate-100">
          <Link href={`/admin/leads?stage=${stage}`}>
            <button className="w-full py-2 text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition-colors border border-dashed border-slate-200 flex justify-center items-center gap-1">
              Hay {items.length - 5} leads más en esta etapa
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}
