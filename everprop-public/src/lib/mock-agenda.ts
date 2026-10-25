import { leads as sampleLeads, properties as sampleProperties, type Visit } from "@/data/admin-sample";
import { loadLeadList, saveLeadList } from "@/lib/admin-storage";
import { isMockDataMode } from "@/lib/data-mode";
import { toArgentinaDateTimeInputValue } from "@/lib/lead-follow-up";

export function seedMockAgenda(now = new Date()) {
  if (!isMockDataMode || typeof window === "undefined") return;
  const day = toArgentinaDateTimeInputValue(now).slice(0, 10);
  const key = "everprop:agenda-samples:v1";
  if (window.localStorage.getItem(key) === day) return;
  const leads = loadLeadList(sampleLeads, "c1");
  const clients = leads.filter(lead => lead.agentId === "usr-sales");
  if (!clients.length) return;
  const visits: Visit[] = [0, 0, 1, 3, -1, 2].map((offset, index) => {
    const lead = clients[index % clients.length];
    const date = new Date(`${day}T12:00:00-03:00`);
    date.setUTCDate(date.getUTCDate() + offset);
    // Near midnight the next 90 minutes belong to tomorrow; keep today's sample visible.
    const soon = new Date(now.getTime() + 90 * 60000);
    const scheduledAt = index === 0 && toArgentinaDateTimeInputValue(soon).slice(0, 10) === day
      ? soon.toISOString() : date.toISOString();
    return {
      id: `agenda-sample-${day}-${index}`, leadId: lead.id, leadName: lead.name,
      propertyId: lead.propertyIds[0],
      propertyTitle: sampleProperties.find(property => property.id === lead.propertyIds[0])?.title,
      agentId: lead.agentId, phone: lead.phone, email: lead.email, scheduledAt,
      status: index === 4 ? "completed" : index === 5 ? "cancelled" : "scheduled",
    };
  });
  saveLeadList(leads.map(lead => ({ ...lead, visits: [
    ...(lead.visits ?? []).filter(visit => !visit.id.startsWith("agenda-sample-")),
    ...visits.filter(visit => visit.leadId === lead.id),
  ] })), "c1");
  window.localStorage.setItem(key, day);
}
