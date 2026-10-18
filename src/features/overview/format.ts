import { dayKey, formatDateTime, formatDuration, formatShortDate, formatTime } from "@/lib/time";

export function formatSeconds(seconds: number) {
  if (seconds < 60) return "меньше минуты";
  return formatDuration(new Date(0), new Date(seconds * 1000));
}

export function formatShare(part: number, total: number) {
  return `${Math.round((part / total) * 100)} %`;
}

export function formatMoment(value: string, now: number) {
  const sameYear = dayKey(value).slice(0, 4) === dayKey(new Date(now)).slice(0, 4);
  return sameYear ? `${formatShortDate(value)}, ${formatTime(value)}` : formatDateTime(value);
}
