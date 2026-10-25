import type { CommercialMetrics, CommercialStatistics } from "@/lib/commercial-statistics-api";

const advisorOptions = [
  { id: "stats-sofia", name: "Sofía Ríos" },
  { id: "stats-marcos", name: "Marcos Villalba" },
  { id: "stats-lucia", name: "Lucía Fernández" },
];

// A fixed 90-day window relative to today keeps previews useful as the calendar changes.
export function loadSampleCommercialStatistics(filters: { from: string; to: string; advisor: string }): { data: CommercialStatistics } {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const days = Array.from({ length: 90 }, (_, index) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 89 + index);
    return { date: date.toISOString().slice(0, 10), index };
  }).filter(day => day.date >= filters.from && day.date <= filters.to);
  const selected = advisorOptions.filter(advisor => !filters.advisor || advisor.id === filters.advisor);
  function metrics(indexes: number[], dayIndexes: number[]): CommercialMetrics {
    let leads = 0, won = 0, lost = 0, attended = 0, conversations = 0, answered = 0, resolved = 0;
    let responseTotal = 0, resolutionTotal = 0;
    for (const index of indexes) for (const day of dayIndexes) {
      const dailyLeads = 2 + (day + index) % 4;
      const dailyWon = (day + index) % 5 === 0 ? 1 : 0;
      const dailyLost = (day + index) % 3 === 0 ? 1 : 0;
      const dailyAnswered = index === 2 ? 0 : dailyLeads - 1;
      const dailyResolved = index === 2 ? 0 : 1;
      leads += dailyLeads; won += dailyWon; lost += dailyLost;
      attended += dailyLeads - 1; conversations += dailyLeads;
      answered += dailyAnswered; resolved += dailyResolved;
      responseTotal += dailyAnswered * (35 + index * 80 + day % 20);
      resolutionTotal += dailyResolved * (240 + index * 120 + day % 60);
    }
    return {
      simulated_leads: leads, leads, active: leads - won - lost, won, lost, attended,
      period_won: won, undated_won: 0, conversations, answered, resolved,
      conversion: leads ? 100 * won / leads : null,
      close_rate: won + lost ? 100 * won / (won + lost) : null,
      response_minutes: answered ? responseTotal / answered : null,
      resolution_minutes: resolved ? resolutionTotal / resolved : null,
    };
  }
  const indexes = selected.map(advisor => advisorOptions.indexOf(advisor));
  return { data: {
    total: metrics(indexes, days.map(day => day.index)),
    has_simulated_data: true,
    series: days.map(day => {
      const row = metrics(indexes, [day.index]);
      return { date: day.date, leads: row.leads, period_won: row.period_won };
    }),
    advisors: selected.map(advisor => ({ ...advisor, ...metrics([advisorOptions.indexOf(advisor)], days.map(day => day.index)) })),
    advisor_options: advisorOptions,
    from: filters.from, to: filters.to, timezone: "America/Argentina/Buenos_Aires",
  } };
}
