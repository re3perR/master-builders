import { dayKey, dayRange, formatShortDate, formatTime, shiftDay } from "@/lib/time";

export type IntervalPoint = { day: string | null; time: string };

function dayName(value: string, today: string | null) {
  const key = dayKey(value);
  if (today === key) return "сегодня";
  if (today && key === shiftDay(today, -1)) return "вчера";
  if (today && key === shiftDay(today, 1)) return "завтра";
  return formatShortDate(value);
}

export function dayInterval(start: string, end: string, date: string, today: string | null) {
  const startDay = dayKey(start);
  const endsAtMidnight = formatTime(end) === "00:00" && dayKey(new Date(Date.parse(end) - 1)) === startDay;
  return {
    start: { day: startDay === date ? null : dayName(start, today), time: formatTime(start) },
    end: endsAtMidnight
      ? { day: null, time: "24:00" }
      : { day: dayKey(end) === startDay ? null : dayName(end, today), time: formatTime(end) },
  };
}

export function intervalText(start: string, end: string, date: string, today: string | null) {
  const interval = dayInterval(start, end, date, today);
  const show = ({ day, time }: IntervalPoint) => (day ? `${day} ${time}` : time);
  return `${show(interval.start)} – ${show(interval.end)}`;
}

export function overlapsDay(task: { planned_start: string; planned_end: string }, date: string) {
  const range = dayRange(date);
  return Date.parse(task.planned_start) < range.end.getTime() && Date.parse(task.planned_end) > range.start.getTime();
}
