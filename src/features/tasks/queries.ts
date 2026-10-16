import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { TaskCard } from "./types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getTaskCard(id: string): Promise<TaskCard | null> {
  if (!uuidPattern.test(id)) return null;
  const supabase = await createClient();

  const { data: task } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  if (!task) return null;

  const [site, crew, obstacle, reports, source, followUps] = await Promise.all([
    supabase.from("sites").select("id, name, archived_at").eq("id", task.site_id).maybeSingle(),
    supabase.from("crews").select("id, name, foreman_id").eq("id", task.crew_id).maybeSingle(),
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
    task.source_task_id
      ? supabase.from("tasks").select("id, number, title").eq("id", task.source_task_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("tasks").select("id, number, title").eq("source_task_id", id).order("number"),
  ]);

  const profileIds = [task.created_by, crew.data?.foreman_id, obstacle.data?.opened_by].filter(Boolean) as string[];
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
    },
    creator_name: nameOf(task.created_by),
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
    source_task: source.data ?? null,
    follow_ups: followUps.data ?? [],
  };
}
