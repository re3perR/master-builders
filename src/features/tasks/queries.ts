import "server-only";
import { cache } from "react";
import { toAppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/rpc";
import { createClient } from "@/lib/supabase/server";
import { dayRange } from "@/lib/time";
import { isGuid, normalizeSearchText, PAGE_SIZE, parseSearch, type TaskFilters } from "./filters";
import type { CrewChoice, SiteChoice, TaskCard, TaskFilterOptions, TaskListPage } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const listColumns =
  "id, number, title, site_id, site_name, crew_id, crew_name, priority, status, address_snapshot, planned_start, planned_end, planned_end_original, is_overdue, has_open_obstacle, obstacle_category, obstacle_reason, obstacle_opened_at, pending_submitted_at";

function likePattern(value: string) {
  return `%${normalizeSearchText(value).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function quoted(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function filteredTasks(supabase: Supabase, filters: TaskFilters, head = false) {
  let query = supabase.from("task_list").select(listColumns, { count: "exact", head });

  if (filters.statuses.length) query = query.in("status", filters.statuses);
  if (filters.review) query = query.eq("status", "InReview");
  if (filters.site) query = query.eq("site_id", filters.site);
  if (filters.crew) query = query.eq("crew_id", filters.crew);
  if (filters.overdue) query = query.eq("is_overdue", true);
  if (filters.obstacle) query = query.eq("has_open_obstacle", true);

  if (filters.date) {
    const { start, end } = dayRange(filters.date);
    query = query.lt("planned_start", end.toISOString()).gt("planned_end", start.toISOString());
  }
  if (filters.from) query = query.gt("planned_end", dayRange(filters.from).start.toISOString());
  if (filters.to) query = query.lt("planned_start", dayRange(filters.to).end.toISOString());

  const search = parseSearch(filters.q);
  if (search.numberOnly && search.number !== null) {
    query = query.eq("number", search.number);
  } else if (search.number !== null) {
    query = query.or(`number.eq.${search.number},search_text.ilike.${quoted(likePattern(search.text))}`);
  } else if (search.text) {
    query = query.ilike("search_text", likePattern(search.text));
  }

  return query;
}

export async function getTaskList(filters: TaskFilters): Promise<ActionResult<TaskListPage>> {
  try {
    const supabase = await createClient();
    const offset = (filters.page - 1) * PAGE_SIZE;
    const { data, count, error } = await filteredTasks(supabase, filters)
      .order("planned_end", { ascending: true })
      .order("number", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error?.code === "PGRST103") {
      const total = await filteredTasks(supabase, filters, true);
      if (total.error) return { ok: false, error: toAppError(total.error) };
      return { ok: true, data: { rows: [], total: total.count ?? 0, page: filters.page, pageSize: PAGE_SIZE } };
    }
    if (error) return { ok: false, error: toAppError(error) };
    return { ok: true, data: { rows: data ?? [], total: count ?? 0, page: filters.page, pageSize: PAGE_SIZE } };
  } catch {
    return { ok: false, error: toAppError(null) };
  }
}

export async function getFilterOptions(): Promise<TaskFilterOptions> {
  const supabase = await createClient();
  const [sites, crews] = await Promise.all([
    supabase.from("sites").select("id, name, archived_at").order("name"),
    supabase.from("crews").select("id, name, archived_at").order("name"),
  ]);
  const toOption = (row: { id: string; name: string; archived_at: string | null }) => ({
    id: row.id,
    name: row.name,
    archived: row.archived_at !== null,
  });
  const byArchive = (a: { archived: boolean }, b: { archived: boolean }) => Number(a.archived) - Number(b.archived);
  return {
    sites: (sites.data ?? []).map(toOption).sort(byArchive),
    crews: (crews.data ?? []).map(toOption).sort(byArchive),
  };
}

async function crewChoices(supabase: Supabase): Promise<CrewChoice[]> {
  const { data: crews } = await supabase
    .from("crews")
    .select("id, name, foreman_id")
    .is("archived_at", null)
    .order("name");
  const foremanIds = (crews ?? []).map((crew) => crew.foreman_id);
  const { data: people } = foremanIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", foremanIds)
    : { data: [] };
  return (crews ?? []).map((crew) => ({
    id: crew.id,
    name: crew.name,
    foreman_name: people?.find((person) => person.id === crew.foreman_id)?.full_name ?? null,
  }));
}

export async function getCrewChoices() {
  return crewChoices(await createClient());
}

export async function getTaskChoices(): Promise<{ sites: SiteChoice[]; crews: CrewChoice[] }> {
  const supabase = await createClient();
  const [sites, crews] = await Promise.all([
    supabase.from("sites").select("id, name, address, access_note").is("archived_at", null).order("name"),
    crewChoices(supabase),
  ]);
  return { sites: sites.data ?? [], crews };
}

export async function getSourceTask(id: string | null) {
  if (!isGuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("id, number, title, description, site_id, crew_id, priority, status")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export const getTaskCard = cache(async (id: string): Promise<TaskCard | null> => {
  if (!isGuid(id)) return null;
  const supabase = await createClient();

  const { data: task } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  if (!task) return null;

  const [site, crew, obstacle, reports, messages, source, followUps] = await Promise.all([
    supabase.from("sites").select("id, name, archived_at").eq("id", task.site_id).maybeSingle(),
    supabase.from("crews").select("id, name, foreman_id, archived_at").eq("id", task.crew_id).maybeSingle(),
    supabase
      .from("task_obstacles")
      .select("id, category, reason, opened_at, opened_by")
      .eq("task_id", id)
      .is("closed_at", null)
      .maybeSingle(),
    supabase
      .from("task_reports")
      .select("id, version, submitted_at, decision, decision_note, decided_at")
      .eq("task_id", id)
      .order("version", { ascending: false }),
    supabase.from("task_messages").select("id", { count: "exact", head: true }).eq("task_id", id),
    task.source_task_id
      ? supabase.from("tasks").select("id, number, title").eq("id", task.source_task_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("tasks").select("id, number, title").eq("source_task_id", id).order("number"),
  ]);

  const profileIds = [task.created_by, task.cancelled_by, crew.data?.foreman_id, obstacle.data?.opened_by].filter(
    Boolean,
  ) as string[];
  const { data: people } = profileIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", profileIds)
    : { data: [] };
  const nameOf = (profileId?: string | null) => people?.find((person) => person.id === profileId)?.full_name ?? null;

  const reportRows = reports.data ?? [];
  const pending = reportRows.find((report) => report.decision === "pending");
  const lastReturned = reportRows.find((report) => report.decision === "returned");

  return {
    ...task,
    site: site.data ?? { id: task.site_id, name: "Объект недоступен", archived_at: null },
    crew: {
      id: task.crew_id,
      name: crew.data?.name ?? "Бригада недоступна",
      foreman_id: crew.data?.foreman_id ?? "",
      foreman_name: nameOf(crew.data?.foreman_id),
      archived_at: crew.data?.archived_at ?? null,
    },
    creator_name: nameOf(task.created_by),
    canceller_name: nameOf(task.cancelled_by),
    open_obstacle: obstacle.data
      ? {
          id: obstacle.data.id,
          category: obstacle.data.category,
          reason: obstacle.data.reason,
          opened_at: obstacle.data.opened_at,
          opened_by_name: nameOf(obstacle.data.opened_by),
        }
      : null,
    pending_report: pending ? { id: pending.id, version: pending.version, submitted_at: pending.submitted_at } : null,
    last_return:
      lastReturned && lastReturned.decision_note && lastReturned.decided_at
        ? { version: lastReturned.version, note: lastReturned.decision_note, decided_at: lastReturned.decided_at }
        : null,
    report_count: reportRows.length,
    message_count: messages.count ?? 0,
    source_task: source.data ?? null,
    follow_ups: followUps.data ?? [],
  };
});
