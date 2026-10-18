import type { TaskStatus } from "@/lib/database.types";
import { statusOrder } from "@/lib/labels";
import { dayRange, inZone, isDayKey, shiftDay } from "@/lib/time";

export const PAGE_SIZE = 25;

export type TaskFilters = {
  q: string;
  statuses: TaskStatus[];
  site: string | null;
  crew: string | null;
  date: string | null;
  from: string | null;
  to: string | null;
  overdue: boolean;
  obstacle: boolean;
  review: boolean;
  page: number;
};

export type SearchParamsInput = URLSearchParams | Record<string, string | string[] | undefined>;

export const emptyFilters: TaskFilters = {
  q: "",
  statuses: [],
  site: null,
  crew: null,
  date: null,
  from: null,
  to: null,
  overdue: false,
  obstacle: false,
  review: false,
  page: 1,
};

const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGuid(value: unknown): value is string {
  return typeof value === "string" && guidPattern.test(value);
}

function read(params: SearchParamsInput, key: string) {
  const value = params instanceof URLSearchParams ? params.get(key) : params[key];
  const single = Array.isArray(value) ? value[0] : value;
  return typeof single === "string" ? single : null;
}

function day(value: string | null) {
  return isDayKey(value) ? value : null;
}

export function parseTaskFilters(params: SearchParamsInput): TaskFilters {
  const requested = (read(params, "status") ?? "").split(",").map((value) => value.trim());
  let from = day(read(params, "from"));
  let to = day(read(params, "to"));
  if (from && to && from > to) [from, to] = [to, from];
  const page = Number.parseInt(read(params, "page") ?? "", 10);

  return {
    q: (read(params, "q") ?? "").trim().slice(0, 100),
    statuses: statusOrder.filter((status) => requested.includes(status)),
    site: isGuid(read(params, "site")) ? read(params, "site") : null,
    crew: isGuid(read(params, "crew")) ? read(params, "crew") : null,
    date: day(read(params, "date")),
    from,
    to,
    overdue: read(params, "overdue") === "1",
    obstacle: read(params, "obstacle") === "1",
    review: read(params, "review") === "1",
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 10_000) : 1,
  };
}

export function buildTaskQuery(filters: TaskFilters) {
  const parts: string[] = [];
  const add = (key: string, value: string) => parts.push(`${key}=${encodeURIComponent(value)}`);
  if (filters.q) add("q", filters.q);
  if (filters.statuses.length) parts.push(`status=${filters.statuses.join(",")}`);
  if (filters.site) add("site", filters.site);
  if (filters.crew) add("crew", filters.crew);
  if (filters.date) add("date", filters.date);
  if (filters.from) add("from", filters.from);
  if (filters.to) add("to", filters.to);
  if (filters.overdue) parts.push("overdue=1");
  if (filters.obstacle) parts.push("obstacle=1");
  if (filters.review) parts.push("review=1");
  if (filters.page > 1) parts.push(`page=${filters.page}`);
  return parts.join("&");
}

export function taskListHref(filters: TaskFilters) {
  const query = buildTaskQuery(filters);
  return query ? `/tasks?${query}` : "/tasks";
}

export function hasActiveFilters(filters: TaskFilters) {
  return Boolean(
    filters.q ||
    filters.statuses.length ||
    filters.site ||
    filters.crew ||
    filters.date ||
    filters.from ||
    filters.to ||
    filters.overdue ||
    filters.obstacle ||
    filters.review,
  );
}

export type ParsedSearch = { number: number | null; numberOnly: boolean; text: string };

export function parseSearch(query: string): ParsedSearch {
  const value = query.trim();
  const code = /^(?:mb|мв)\s*-?\s*(\d{1,9})$/i.exec(value);
  if (code) return { number: Number(code[1]), numberOnly: true, text: "" };
  const digits = /^#?(\d{1,9})$/.exec(value);
  if (digits) return { number: Number(digits[1]), numberOnly: false, text: digits[1] };
  return { number: null, numberOnly: false, text: value };
}

export function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/ё/g, "е");
}

export function searchPattern(value: string) {
  return normalizeSearchText(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

export function weekOf(day: string) {
  const weekday = (inZone(dayRange(day).start).getDay() + 6) % 7;
  const from = shiftDay(day, -weekday);
  return { from, to: shiftDay(from, 6) };
}
