import "server-only";
import type { TaskReport, TaskStatus } from "@/lib/database.types";
import { activeStatuses, executionStatuses, finalStatuses } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { dayKey, dayRange } from "@/lib/time";
import { donePageSize, type MyTask, type MyTasks, type MyView, type Need } from "./types";

const columns =
  "id, number, title, status, priority, version, site_id, address_snapshot, planned_start, planned_end, completed_at, cancelled_at, cancel_reason";

export async function getMyTasks(crewId: string, doneLimit = donePageSize): Promise<MyTasks> {
  const supabase = await createClient();
  const now = new Date();
  const today = dayKey(now);
  const { start: dayStart, end: dayEnd } = dayRange(today);

  const [active, finished] = await Promise.all([
    supabase
      .from("tasks")
      .select(columns)
      .eq("crew_id", crewId)
      .in("status", activeStatuses)
      .order("planned_start", { ascending: true })
      .order("number", { ascending: true }),
    supabase
      .from("tasks")
      .select(columns, { count: "exact" })
      .eq("crew_id", crewId)
      .in("status", finalStatuses)
      .order("updated_at", { ascending: false })
      .order("number", { ascending: false })
      .limit(doneLimit),
  ]);
  if (active.error) throw active.error;
  if (finished.error) throw finished.error;

  const rows = [...active.data, ...finished.data];
  const activeIds = active.data.map((task) => task.id);
  const siteIds = [...new Set(rows.map((task) => task.site_id))];

  const [obstacles, reports, sites] = await Promise.all([
    activeIds.length
      ? supabase
          .from("task_obstacles")
          .select("task_id, category, reason, opened_at")
          .in("task_id", activeIds)
          .is("closed_at", null)
      : null,
    activeIds.length
      ? supabase
          .from("task_reports")
          .select("task_id, version, decision, decision_note, decided_at, submitted_at")
          .in("task_id", activeIds)
          .order("version", { ascending: false })
      : null,
    siteIds.length ? supabase.from("sites").select("id, name").in("id", siteIds) : null,
  ]);
  if (obstacles?.error) throw obstacles.error;
  if (reports?.error) throw reports.error;
  if (sites?.error) throw sites.error;

  const obstacleOf = new Map((obstacles?.data ?? []).map((obstacle) => [obstacle.task_id, obstacle]));
  const siteName = new Map((sites?.data ?? []).map((site) => [site.id, site.name]));
  const latestReport = new Map<
    string,
    Pick<TaskReport, "task_id" | "version" | "decision" | "decision_note" | "decided_at" | "submitted_at">
  >();
  for (const report of reports?.data ?? []) {
    if (!latestReport.has(report.task_id)) latestReport.set(report.task_id, report);
  }

  const views: Record<MyView, string[]> = { action: [], today: [], upcoming: [], review: [], done: [] };
  const tasks: MyTask[] = rows.map((row) => {
    const status = row.status as TaskStatus;
    const start = new Date(row.planned_start);
    const end = new Date(row.planned_end);
    const executing = executionStatuses.includes(status);
    const overdue = executing && end < now;
    const obstacle = obstacleOf.get(row.id) ?? null;
    const report = latestReport.get(row.id);
    const returned =
      status === "InProgress" && report?.decision === "returned" && report.decision_note && report.decided_at
        ? { version: report.version, note: report.decision_note, decided_at: report.decided_at }
        : null;
    const review =
      status === "InReview" && report?.decision === "pending"
        ? { version: report.version, submitted_at: report.submitted_at }
        : null;

    const needs: Need[] = [];
    if (status === "Assigned") needs.push("accept");
    if (status === "Accepted" && start < dayEnd) needs.push("start");
    if (returned) needs.push("rework");
    if (obstacle) needs.push("obstacle");
    if (overdue) needs.push("overdue");

    if (needs.length) views.action.push(row.id);
    if (executing && start < dayEnd && end > dayStart) views.today.push(row.id);
    if (executing && start >= dayEnd) views.upcoming.push(row.id);
    if (status === "InReview") views.review.push(row.id);
    if (status === "Completed" || status === "Cancelled") views.done.push(row.id);

    return {
      id: row.id,
      number: row.number,
      title: row.title,
      status,
      priority: row.priority,
      version: row.version,
      site_name: siteName.get(row.site_id) ?? "",
      address: row.address_snapshot,
      planned_start: row.planned_start,
      planned_end: row.planned_end,
      overdue,
      needs,
      obstacle: obstacle
        ? { category: obstacle.category, reason: obstacle.reason, opened_at: obstacle.opened_at }
        : null,
      returned,
      review,
      finished_at: row.completed_at ?? row.cancelled_at,
      cancel_reason: row.cancel_reason,
    };
  });

  return { today, tasks, views, done_total: finished.count ?? finished.data.length };
}
