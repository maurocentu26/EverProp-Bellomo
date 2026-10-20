import { apiFetch } from "@/lib/everprop-api";

export type CommercialMetrics = {
  leads: number; active: number; won: number; lost: number; attended: number;
  period_won: number; undated_won: number; conversations: number; answered: number; resolved: number;
  conversion: number | null; close_rate: number | null;
  response_minutes: number | null; resolution_minutes: number | null;
};
export type CommercialStatistics = {
  total: CommercialMetrics;
  advisors: (CommercialMetrics & { id: string | null; name: string })[];
  advisor_options: { id: string; name: string }[];
  from: string; to: string; timezone: string;
};
export function loadCommercialStatistics(filters: { from: string; to: string; advisor: string }, signal: AbortSignal) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.advisor) params.set("advisor", filters.advisor);
  return apiFetch<{ data: CommercialStatistics }>(`/api/v1/admin/commercial-statistics?${params}`, { signal });
}
