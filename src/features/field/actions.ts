"use server";

import { z } from "zod";
import { getViewer } from "@/lib/auth";
import type { TaskMutationResult } from "@/lib/database.types";
import { toAppError } from "@/lib/errors";
import { callRpc, type ActionResult } from "@/lib/rpc";
import { snapshot, type Snapshot } from "@/lib/snapshot";
import { getMyTasks } from "./queries";
import type { MyTasks } from "./types";

const transition = z.object({
  taskId: z.guid(),
  version: z.number().int().positive(),
  clientKey: z.guid(),
});

const obstacleInput = transition.extend({
  category: z.enum(["access", "materials", "equipment", "other"]),
  reason: z.string().max(5000),
});

const closeInput = transition.extend({
  comment: z.string().max(5000),
});

const invalid: ActionResult<never> = {
  ok: false,
  error: { kind: "validation", message: "Проверьте введённые данные." },
};

export async function loadMyTasks(): Promise<ActionResult<Snapshot<MyTasks>>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: toAppError({ code: "MB401" }) };
  if (viewer.profile.role !== "foreman" || !viewer.crew) return { ok: false, error: toAppError({ code: "MB403" }) };
  try {
    return { ok: true, data: snapshot(await getMyTasks(viewer.crew.id)) };
  } catch {
    return { ok: false, error: toAppError(null) };
  }
}

export async function acceptTask(input: z.input<typeof transition>): Promise<ActionResult<TaskMutationResult>> {
  const parsed = transition.safeParse(input);
  if (!parsed.success) return invalid;
  return callRpc("accept_task", {
    p_task_id: parsed.data.taskId,
    p_expected_version: parsed.data.version,
    p_client_key: parsed.data.clientKey,
  });
}

export async function startTask(input: z.input<typeof transition>): Promise<ActionResult<TaskMutationResult>> {
  const parsed = transition.safeParse(input);
  if (!parsed.success) return invalid;
  return callRpc("start_task", {
    p_task_id: parsed.data.taskId,
    p_expected_version: parsed.data.version,
    p_client_key: parsed.data.clientKey,
  });
}

export async function openObstacle(input: z.input<typeof obstacleInput>): Promise<ActionResult<TaskMutationResult>> {
  const parsed = obstacleInput.safeParse(input);
  if (!parsed.success) return invalid;
  return callRpc("open_obstacle", {
    p_task_id: parsed.data.taskId,
    p_expected_version: parsed.data.version,
    p_category: parsed.data.category,
    p_reason: parsed.data.reason,
    p_client_key: parsed.data.clientKey,
  });
}

export async function closeObstacle(input: z.input<typeof closeInput>): Promise<ActionResult<TaskMutationResult>> {
  const parsed = closeInput.safeParse(input);
  if (!parsed.success) return invalid;
  return callRpc("close_obstacle", {
    p_task_id: parsed.data.taskId,
    p_expected_version: parsed.data.version,
    p_comment: parsed.data.comment,
    p_client_key: parsed.data.clientKey,
  });
}
