import { dayKey, dayRange, formatShortDate, shiftDay } from "@/lib/time";

export const periodOptions = [7, 30, 90] as const;

export type PeriodDays = (typeof periodOptions)[number];

const defaultPeriod: PeriodDays = 30;

export type Period = {
  days: PeriodDays;
  first: string;
  last: string;
  from: string;
  to: string;
};

export function parsePeriod(value: unknown): PeriodDays {
  const days = Number(Array.isArray(value) ? value[0] : value);
  return periodOptions.find((option) => option === days) ?? defaultPeriod;
}

export function periodFor(days: PeriodDays, today = dayKey()): Period {
  const first = shiftDay(today, 1 - days);
  return {
    days,
    first,
    last: today,
    from: dayRange(first).start.toISOString(),
    to: dayRange(today).end.toISOString(),
  };
}

export function periodLabel(period: Pick<Period, "first" | "last">) {
  return `${formatShortDate(dayRange(period.first).start)} – ${formatShortDate(dayRange(period.last).start)}`;
}
