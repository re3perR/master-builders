import "server-only";
import { toAppError } from "@/lib/errors";
import { callRpc, type ActionResult } from "@/lib/rpc";
import { createClient } from "@/lib/supabase/server";
import { dayRange } from "@/lib/time";
import type { ScheduleData } from "./types";

export async function loadSchedule(date: string): Promise<ActionResult<ScheduleData>> {
  const { start, end } = dayRange(date);
  try {
    const supabase = await createClient();
    const [tasks, crews] = await Promise.all([
      callRpc("schedule_tasks", { p_from: start.toISOString(), p_to: end.toISOString() }),
      supabase.from("crews").select("id, name, archived_at"),
    ]);
    if (!tasks.ok) return tasks;
    if (crews.error) return { ok: false, error: toAppError(crews.error) };

    const busy = new Set(tasks.data.map((task) => task.crew_id));
    const list = crews.data
      .filter((crew) => !crew.archived_at || busy.has(crew.id))
      .map((crew) => ({ id: crew.id, name: crew.name, archived: crew.archived_at !== null }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru", { numeric: true }));

    return { ok: true, data: { date, crews: list, tasks: tasks.data } };
  } catch {
    return { ok: false, error: toAppError(null) };
  }
}
