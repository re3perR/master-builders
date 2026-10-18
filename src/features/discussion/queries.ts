import "server-only";
import { toAppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/rpc";
import { createClient } from "@/lib/supabase/server";
import { isGuid } from "@/lib/validation";
import type { Discussion } from "./types";

export async function getDiscussion(taskId: string): Promise<ActionResult<Discussion>> {
  if (!isGuid(taskId)) return { ok: false, error: toAppError({ code: "MB404" }) };
  const supabase = await createClient();

  const [task, messages] = await Promise.all([
    supabase.from("tasks").select("status").eq("id", taskId).maybeSingle(),
    supabase
      .from("task_messages")
      .select("id, author_id, author_role, body, created_at")
      .eq("task_id", taskId)
      .order("created_at")
      .order("id"),
  ]);
  if (task.error) return { ok: false, error: toAppError(task.error) };
  if (!task.data) return { ok: false, error: toAppError({ code: "MB404" }) };
  if (messages.error) return { ok: false, error: toAppError(messages.error) };

  const authorIds = [...new Set(messages.data.map((message) => message.author_id))];
  const people = authorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", authorIds)
    : { data: [], error: null };
  if (people.error) return { ok: false, error: toAppError(people.error) };
  const names = new Map(people.data.map((person) => [person.id, person.full_name]));

  return {
    ok: true,
    data: {
      status: task.data.status,
      messages: messages.data.map((message) => ({
        id: message.id,
        authorId: message.author_id,
        authorName: names.get(message.author_id) ?? null,
        authorRole: message.author_role,
        body: message.body,
        createdAt: message.created_at,
      })),
    },
  };
}
