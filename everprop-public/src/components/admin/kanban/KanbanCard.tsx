import { useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type Lead, type LeadFollowUp, properties as sampleProperties } from "@/data/admin-sample";
import CardLead from "@/components/admin/CardLead";
import { cn } from "@/lib/utils";

export function KanbanCard({ lead, followUps, isActive }: { lead: Lead; followUps: LeadFollowUp[]; isActive: boolean }) {
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
          properties={leadProperties.map(p => ({
            title: p.title,
            bedrooms: p.bedrooms,
            price: p.price,
            currency: p.currency,
            operation: p.operation
          }))}
          agentId={lead.agentId}
          followUpUpdatedAt={lead.followUpUpdatedAt}
          followUps={followUps}
          companyId={lead.companyId}
        />
      </div>
    </div>
  );
}
