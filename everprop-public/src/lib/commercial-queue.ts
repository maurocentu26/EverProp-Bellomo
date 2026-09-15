import type { Lead, LeadFollowUp } from "@/data/admin-sample";
import { getLeadFollowUpState, getLeadFollowUps, isCommercialContact, parseArgentinaDate, toArgentinaDateTimeInputValue } from "./lead-follow-up";

export function commercialDay(value: string | Date) {
  const date = parseArgentinaDate(value);
  return Number.isNaN(date.getTime()) ? "" : toArgentinaDateTimeInputValue(date).slice(0, 10);
}

export function hasRecordedContact(followUps: LeadFollowUp[], lead: Lead) {
  return getLeadFollowUps(followUps, lead.id, lead.companyId).some(isCommercialContact);
}

export function commercialQueueItem(lead: Lead, followUps: LeadFollowUp[], now: Date) {
  const state = getLeadFollowUpState(followUps, lead.id, lead.followUpUpdatedAt, now, lead.companyId);
  const contacts = getLeadFollowUps(followUps, lead.id, lead.companyId).filter(isCommercialContact);
  // A newer interaction replaces the previous commitment, even if it has no next date.
  const nextContactAt = contacts[0]?.nextContactAt;
  const today = commercialDay(now);
  const nextDay = nextContactAt ? commercialDay(nextContactAt) : "";
  const isOverdue = state.kind === "overdue" || Boolean(nextDay && nextDay < today);
  const isDueToday = !isOverdue && nextDay === today;
  // The API initializes last_touch_at when a lead is created; that is not a contact.
  const isNew = lead.stage === "new" && !contacts.length;
  // Disjoint tiers ensure a new lead due today never overtakes an overdue lead.
  const priorityWeight = isOverdue ? 3 : isDueToday ? 2 : isNew ? 1 : 0;
  const isCurrent = contacts.length > 0 && state.kind === "current" && !isOverdue && !isDueToday;
  return { lead, state, isOverdue, isDueToday, isNew, isCurrent, priorityWeight };
}

export function commercialQueueGroups(leads: Lead[], followUps: LeadFollowUp[], now: Date) {
  const all = leads.filter(lead => lead.stage !== "closing" && lead.stage !== "discarded")
    .map(lead => commercialQueueItem(lead, followUps, now))
    .sort((a, b) => b.priorityWeight - a.priorityWeight || a.lead.id.localeCompare(b.lead.id));
  return {
    all,
    overdue: all.filter(item => item.isOverdue),
    today: all.filter(item => item.isDueToday),
    new: all.filter(item => item.isNew),
  };
}
