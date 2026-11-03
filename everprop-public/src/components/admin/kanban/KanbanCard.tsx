import { useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type Lead, type LeadFollowUp, properties as sampleProperties } from "@/data/admin-sample";
import CardLead from "@/components/admin/CardLead";
import { STAGE_LABELS, STAGE_ORDER, type Stage } from "./types";
import { cn } from "@/lib/utils";

export function KanbanCard({ lead, followUps, isActive, onStageChange }: { lead: Lead; followUps: LeadFollowUp[]; isActive: boolean; onStageChange?: (stage: Stage) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const leadProperties = useMemo(() => {
    return lead.propertyIds
      .map((pid) => sampleProperties.find((p) => p.id === pid))
      .filter((p): p is typeof sampleProperties[0] => p !== undefined);
  }, [lead.propertyIds]);

  return (
    <div ref={setNodeRef} style={style} className={cn(isActive && "z-10")}>
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <CardLead
          className="hover:border-blue-400 hover:shadow-md transition-shadow"
          id={lead.id}
          name={lead.name}
          phone={lead.phone}
          email={lead.email}
          origin={lead.origin}
          properties={leadProperties.map((p) => ({
            title: p.title,
            bedrooms: p.bedrooms,
            price: p.price,
            currency: p.currency,
            operation: p.operation,
          }))}
          agentId={lead.agentId}
          followUpUpdatedAt={lead.followUpUpdatedAt}
          followUps={followUps}
          companyId={lead.companyId}
        />
      </div>
      {onStageChange && (
        <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
          <label htmlFor={`kanban-stage-${lead.id}`} className="text-xs font-medium text-muted-foreground">Etapa</label>
          <select
            id={`kanban-stage-${lead.id}`}
            aria-label={`Cambiar etapa de ${lead.name}`}
            value={lead.stage}
            onChange={(e) => onStageChange(e.target.value as Stage)}
            className="min-h-11 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground"
          >
            {STAGE_ORDER.map((stage) => (
              <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
