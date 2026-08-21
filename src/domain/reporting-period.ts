export type ReportingPeriod = { startDate: string; endDate: string };

export function dhakaBusinessDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(now);
}

export function resolveReportingPeriod(referenceDate: string, range = "14d"): ReportingPeriod {
  if (range === "month") return { startDate: `${referenceDate.slice(0, 7)}-01`, endDate: referenceDate };
  const end = new Date(`${referenceDate}T00:00:00Z`);
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 14;
  end.setUTCDate(end.getUTCDate() - days + 1);
  return { startDate: end.toISOString().slice(0, 10), endDate: referenceDate };
}

export function lifetimeReportingPeriod(referenceDate: string, dates: readonly string[]): ReportingPeriod {
  const startDate = dates
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= referenceDate)
    .reduce((earliest, date) => date < earliest ? date : earliest, referenceDate);
  return { startDate, endDate: referenceDate };
}

export function previousReportingPeriod(period: ReportingPeriod): ReportingPeriod {
  const currentStart = new Date(`${period.startDate}T00:00:00Z`);
  const currentEnd = new Date(`${period.endDate}T00:00:00Z`);
  const durationDays = Math.round((currentEnd.getTime() - currentStart.getTime()) / 86_400_000) + 1;
  const previousEnd = new Date(currentStart);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - durationDays + 1);
  return {
    startDate: previousStart.toISOString().slice(0, 10),
    endDate: previousEnd.toISOString().slice(0, 10),
  };
}

export function reportingDates(period: ReportingPeriod): Array<{ iso: string; label: string }> {
  const start = new Date(`${period.startDate}T00:00:00Z`);
  const end = new Date(`${period.endDate}T00:00:00Z`);
  const dates: Array<{ iso: string; label: string }> = [];
  for (const date = start; date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    dates.push({
      iso: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" }),
    });
  }
  return dates;
}
