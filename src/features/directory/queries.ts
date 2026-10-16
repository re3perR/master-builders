import "server-only";
import { toAppError, type AppError } from "@/lib/errors";
import { activeStatuses, finalStatuses, isOverdue } from "@/lib/labels";
import { callRpc, type ActionResult } from "@/lib/rpc";
import { createClient } from "@/lib/supabase/server";
import type { CrewCard, CrewList, SiteCard, SiteFilters, SiteList, TaskGroups, TaskItem } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Failure = { ok: false; error: AppError };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const taskColumns = "id, number, title, status, priority, planned_start, planned_end, site_id, crew_id";
const activeLimit = 100;
const closedLimit = 10;

function failure(error: Parameters<typeof toAppError>[0]): Failure {
  return { ok: false, error: toAppError(error) };
}

const missing = () => failure({ code: "MB404" });

async function loadTasks(
  supabase: Supabase,
  column: "site_id" | "crew_id",
  id: string,
): Promise<ActionResult<TaskGroups>> {
  const [active, closed] = await Promise.all([
    supabase
      .from("tasks")
      .select(taskColumns, { count: "exact" })
      .eq(column, id)
      .in("status", activeStatuses)
      .order("planned_end")
      .order("number")
      .limit(activeLimit),
    supabase
      .from("tasks")
      .select(taskColumns, { count: "exact" })
      .eq(column, id)
      .in("status", finalStatuses)
      .order("updated_at", { ascending: false })
      .order("number", { ascending: false })
      .limit(closedLimit),
  ]);
  if (active.error) return failure(active.error);
  if (closed.error) return failure(closed.error);

  const rows = [...active.data, ...closed.data];
  const siteIds = column === "crew_id" ? [...new Set(rows.map((row) => row.site_id))] : [];
  const crewIds = column === "site_id" ? [...new Set(rows.map((row) => row.crew_id))] : [];
  const activeIds = active.data.map((row) => row.id);

  const [sites, crews, obstacles] = await Promise.all([
    siteIds.length ? supabase.from("sites").select("id, name").in("id", siteIds) : null,
    crewIds.length ? supabase.from("crews").select("id, name").in("id", crewIds) : null,
    activeIds.length
      ? supabase.from("task_obstacles").select("task_id, category").is("closed_at", null).in("task_id", activeIds)
      : null,
  ]);
  const error = sites?.error ?? crews?.error ?? obstacles?.error;
  if (error) return failure(error);

  const siteNames = new Map((sites?.data ?? []).map((row) => [row.id, row.name]));
  const crewNames = new Map((crews?.data ?? []).map((row) => [row.id, row.name]));
  const openObstacles = new Map((obstacles?.data ?? []).map((row) => [row.task_id, row.category]));
  const now = Date.now();

  const toItem = (row: (typeof rows)[number]): TaskItem => ({
    id: row.id,
    number: row.number,
    title: row.title,
    status: row.status,
    priority: row.priority,
    planned_start: row.planned_start,
    planned_end: row.planned_end,
    overdue: isOverdue(row, now),
    obstacle: openObstacles.get(row.id) ?? null,
    site_name: siteNames.get(row.site_id) ?? null,
    crew_name: crewNames.get(row.crew_id) ?? null,
  });

  return {
    ok: true,
    data: {
      active: active.data.map(toItem),
      activeTotal: active.count ?? active.data.length,
      closed: closed.data.map(toItem),
      closedTotal: closed.count ?? closed.data.length,
    },
  };
}

export async function listSites(filters: SiteFilters): Promise<ActionResult<SiteList>> {
  const supabase = await createClient();
  const [summaries, archived] = await Promise.all([
    callRpc("site_summaries", { p_query: filters.query || null, p_include_archived: filters.archived }),
    supabase.from("sites").select("id", { count: "exact", head: true }).not("archived_at", "is", null),
  ]);
  if (!summaries.ok) return summaries;
  if (archived.error) return failure(archived.error);
  return { ok: true, data: { sites: summaries.data, archivedCount: archived.count ?? 0 } };
}

export async function getSiteCard(id: string): Promise<ActionResult<SiteCard>> {
  if (!uuidPattern.test(id)) return missing();
  const supabase = await createClient();
  const [site, tasks] = await Promise.all([
    supabase.from("sites").select("*").eq("id", id).maybeSingle(),
    loadTasks(supabase, "site_id", id),
  ]);
  if (site.error) return failure(site.error);
  if (!site.data) return missing();
  if (!tasks.ok) return tasks;
  return { ok: true, data: { site: site.data, tasks: tasks.data } };
}

export async function listCrews(): Promise<ActionResult<CrewList>> {
  const result = await callRpc("crew_summaries", {});
  return result.ok ? { ok: true, data: { crews: result.data } } : result;
}

export async function getCrewCard(id: string): Promise<ActionResult<CrewCard>> {
  if (!uuidPattern.test(id)) return missing();
  const supabase = await createClient();
  const [crew, members, tasks] = await Promise.all([
    supabase.from("crews").select("id, name, foreman_id, archived_at, updated_at").eq("id", id).maybeSingle(),
    supabase
      .from("crew_members")
      .select("id, name")
      .eq("crew_id", id)
      .order("position")
      .order("created_at")
      .order("id"),
    loadTasks(supabase, "crew_id", id),
  ]);
  if (crew.error) return failure(crew.error);
  if (!crew.data) return missing();
  if (members.error) return failure(members.error);
  if (!tasks.ok) return tasks;

  const foreman = await supabase.from("profiles").select("full_name").eq("id", crew.data.foreman_id).maybeSingle();
  if (foreman.error) return failure(foreman.error);

  return {
    ok: true,
    data: {
      crew: crew.data,
      foremanName: foreman.data?.full_name ?? null,
      members: members.data,
      tasks: tasks.data,
    },
  };
}
