import "server-only";
import { toAppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/rpc";
import { createClient } from "@/lib/supabase/server";
import { isGuid } from "@/lib/validation";
import type { HistoryEvent } from "./types";

export async function getHistory(taskId: string): Promise<ActionResult<HistoryEvent[]>> {
  if (!isGuid(taskId)) return { ok: false, error: toAppError({ code: "MB404" }) };
  const supabase = await createClient();

  const [task, events] = await Promise.all([
    supabase.from("tasks").select("id").eq("id", taskId).maybeSingle(),
    supabase
      .from("task_events")
      .select("id, actor_id, actor_role, kind, data, created_at")
      .eq("task_id", taskId)
      .order("created_at")
      .order("id"),
  ]);
  if (task.error) return { ok: false, error: toAppError(task.error) };
  if (!task.data) return { ok: false, error: toAppError({ code: "MB404" }) };
  if (events.error) return { ok: false, error: toAppError(events.error) };

  const actorIds = [...new Set(events.data.map((event) => event.actor_id).filter((id): id is string => Boolean(id)))];
  const people = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, role").in("id", actorIds)
    : { data: [], error: null };
  if (people.error) return { ok: false, error: toAppError(people.error) };
  const byId = new Map(people.data.map((person) => [person.id, person]));

  return {
    ok: true,
    data: events.data.map((event) => {
      const person = event.actor_id ? byId.get(event.actor_id) : undefined;
      return {
        id: event.id,
        kind: event.kind,
        data: event.data,
        createdAt: event.created_at,
        actorId: event.actor_id,
        actorName: person?.full_name ?? null,
        actorRole: event.actor_role ?? person?.role ?? null,
      };
    }),
  };
}
