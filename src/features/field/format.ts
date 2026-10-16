import { dayKey, formatShortDate, formatTime, shiftDay } from "@/lib/time";

function dayLabel(value: string, today: string) {
  const day = dayKey(value);
  if (day === today) return "сегодня";
  if (day === shiftDay(today, 1)) return "завтра";
  if (day === shiftDay(today, -1)) return "вчера";
  return formatShortDate(value);
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatPlan(start: string, end: string, today: string) {
  const from = dayLabel(start, today);
  if (dayKey(start) === dayKey(end)) return `${capitalize(from)}, ${formatTime(start)}–${formatTime(end)}`;
  return `${capitalize(from)} ${formatTime(start)} – ${dayLabel(end, today)} ${formatTime(end)}`;
}
