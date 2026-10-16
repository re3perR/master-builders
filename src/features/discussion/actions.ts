"use server";

import { z } from "zod";
import { callRpc, type ActionResult } from "@/lib/rpc";
import { snapshot, type Snapshot } from "@/lib/snapshot";
import { getDiscussion } from "./queries";
import type { Discussion } from "./types";

const messageInput = z.object({
  taskId: z.guid(),
  body: z.string(),
  clientKey: z.guid(),
});

export async function postMessage(
  input: z.infer<typeof messageInput>,
): Promise<ActionResult<{ id: string; createdAt: string }>> {
  const parsed = messageInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { kind: "validation", field: "body", message: "Проверьте текст сообщения." } };
  }
  const result = await callRpc("post_message", {
    p_task_id: parsed.data.taskId,
    p_body: parsed.data.body.trim(),
    p_client_key: parsed.data.clientKey,
  });
  return result.ok ? { ok: true, data: { id: result.data.message_id, createdAt: result.data.created_at } } : result;
}

export async function loadDiscussion(taskId: string): Promise<ActionResult<Snapshot<Discussion>>> {
  const result = await getDiscussion(taskId);
  return result.ok ? { ok: true, data: snapshot(result.data) } : result;
}
