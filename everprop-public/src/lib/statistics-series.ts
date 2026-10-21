export type StatisticsDay = { date: string; leads: number; period_won: number };

export function groupStatisticsSeries(series: StatisticsDay[], metric: "leads" | "period_won") {
  const step = series.length > 31 ? 7 : 1;
  const bins = [];
  for (let i = 0; i < series.length; i += step) {
    const group = series.slice(i, i + step);
    bins.push({ from: group[0].date, to: group[group.length - 1].date, value: group.reduce((sum, row) => sum + row[metric], 0) });
  }
  return { step, bins };
}
