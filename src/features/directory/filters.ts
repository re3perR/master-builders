import type { SiteFilters } from "./types";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseSiteFilters(params: SearchParams): SiteFilters {
  return {
    query: first(params.q).trim().slice(0, 200),
    archived: first(params.archived) === "1",
  };
}

export function sitesHref(filters: SiteFilters) {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.archived) params.set("archived", "1");
  const search = params.toString();
  return search ? `/sites?${search}` : "/sites";
}
