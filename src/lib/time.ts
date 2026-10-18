import { TZDate } from "@date-fns/tz";
import { addDays, differenceInMinutes, format, isValid, parse } from "date-fns";
import { ru } from "date-fns/locale";
import { companyTimeZone } from "@/lib/env";

export const timeZone = companyTimeZone;

export function inZone(value: string | number | Date) {
  return new TZDate(new Date(value).getTime(), timeZone);
}

function nowInZone() {
  return TZDate.tz(timeZone);
}

export function formatDate(value: string | Date) {
  return format(inZone(value), "d MMMM yyyy", { locale: ru });
}

export function formatShortDate(value: string | Date) {
  const date = inZone(value);
  const thisYear = date.getFullYear() === nowInZone().getFullYear();
  return format(date, thisYear ? "d MMM" : "d MMM yyyy", { locale: ru });
}

export function formatTime(value: string | Date) {
  return format(inZone(value), "HH:mm");
}

export function formatDateTime(value: string | Date) {
  return format(inZone(value), "d MMM yyyy, HH:mm", { locale: ru });
}

export function formatWeekday(value: string | Date) {
  return format(inZone(value), "EEEE, d MMMM", { locale: ru });
}

export function dayKey(value: string | Date = new Date()) {
  return format(inZone(value), "yyyy-MM-dd");
}

export function isDayKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return isValid(parse(value, "yyyy-MM-dd", new Date()));
}

export function dayRange(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const start = new TZDate(year, month - 1, day, 0, 0, 0, timeZone);
  const end = addDays(start, 1);
  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

export function shiftDay(key: string, days: number) {
  const { start } = dayRange(key);
  return dayKey(addDays(inZone(start), days));
}

export function toLocalInput(value: string | Date) {
  return format(inZone(value), "yyyy-MM-dd'T'HH:mm");
}

export function fromLocalInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new TZDate(year, month - 1, day, hour, minute, 0, timeZone);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return new Date(date.getTime());
}

export function formatInterval(start: string, end: string) {
  const sameDay = dayKey(start) === dayKey(end);
  if (sameDay) return `${formatShortDate(start)}, ${formatTime(start)}–${formatTime(end)}`;
  return `${formatShortDate(start)} ${formatTime(start)} – ${formatShortDate(end)} ${formatTime(end)}`;
}

export function formatDuration(from: string | Date, to: string | Date = new Date()) {
  const minutes = Math.max(0, differenceInMinutes(new Date(to), new Date(from)));
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} д ${restHours} ч` : `${days} д`;
}

export function timeZoneLabel() {
  const offset = format(nowInZone(), "xxx");
  return timeZone === "Europe/Moscow" ? `Москва, UTC${offset}` : `${timeZone}, UTC${offset}`;
}
