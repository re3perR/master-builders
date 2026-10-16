import { dayKey, formatDateTime, formatDuration, formatShortDate, formatTime } from "@/lib/time";

export function formatSeconds(seconds: number) {
  if (seconds < 60) return "меньше минуты";
  return formatDuration(new Date(0), new Date(seconds * 1000));
}

export function formatShare(part: number, total: number) {
  return `${Math.round((part / total) * 100)} %`;
}

export function plural(count: number, one: string, few: string, many: string) {
  const tens = count % 100;
  const units = count % 10;
  if (units === 1 && tens !== 11) return one;
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return few;
  return many;
}

export function formatMoment(value: string, now: number) {
  const sameYear = dayKey(value).slice(0, 4) === dayKey(new Date(now)).slice(0, 4);
  return sameYear ? `${formatShortDate(value)}, ${formatTime(value)}` : formatDateTime(value);
}
