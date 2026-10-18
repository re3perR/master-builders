"use server";

import type { TaskMutationResult } from "@/lib/database.types";
import { getViewer } from "@/lib/auth";
import type { AppError } from "@/lib/errors";
import { callRpc, type ActionResult } from "@/lib/rpc";
import { snapshot, type Snapshot } from "@/lib/snapshot";
import { isGuid } from "@/lib/validation";
import { parseTaskFilters } from "./filters";
import { getTaskList } from "./queries";
import type { SaveResult, TaskListPage } from "./types";
import {
  checkDetails,
  checkReason,
  checkReassign,
  checkReschedule,
  checkTaskDraft,
  type DetailsInput,
  type FieldErrors,
  type ReassignInput,
  type RescheduleInput,
  type TaskDraftInput,
} from "./validation";

function invalid(errors: FieldErrors): { ok: false; error: AppError } {
  const [field, message] = Object.entries(errors)[0] ?? ["form", "Проверьте введённые данные."];
  return { ok: false, error: { kind: "validation", field, message: message ?? "Проверьте введённые данные." } };
}

function badRequest(): { ok: false; error: AppError } {
  return { ok: false, error: { kind: "validation", message: "Некорректный запрос. Обновите страницу и повторите." } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function acknowledgedIds(values: unknown) {
  return Array.isArray(values) ? values.filter(isGuid).slice(0, 100) : [];
}

function toSaveResult(result: ActionResult<TaskMutationResult>): ActionResult<SaveResult> {
  if (!result.ok) return result;
  if (result.data.result === "overlaps") {
    return { ok: true, data: { status: "overlaps", overlaps: result.data.overlaps } };
  }
  return { ok: true, data: { status: "saved", taskId: result.data.task_id } };
}

export async function refreshTaskList(query: string): Promise<ActionResult<Snapshot<TaskListPage>>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: { kind: "auth", message: "Сессия истекла. Войдите снова." } };
  if (viewer.profile.role === "foreman") {
    return { ok: false, error: { kind: "forbidden", message: "Недостаточно прав для этого действия." } };
  }
  const result = await getTaskList(parseTaskFilters(new URLSearchParams(typeof query === "string" ? query : "")));
  return result.ok ? { ok: true, data: snapshot(result.data) } : result;
}

export async function createTask(
  input: TaskDraftInput,
  clientKey: string,
  acknowledged: string[],
  sourceTaskId: string | null,
): Promise<ActionResult<SaveResult>> {
  if (!isRecord(input) || !isGuid(clientKey) || (sourceTaskId !== null && !isGuid(sourceTaskId))) return badRequest();
  const checked = checkTaskDraft(input);
  if (!checked.ok) return invalid(checked.errors);
  const draft = checked.data;
  return toSaveResult(
    await callRpc("create_task", {
      p_title: draft.title,
      p_description: draft.description,
      p_site_id: draft.site_id,
      p_crew_id: draft.crew_id,
      p_priority: draft.priority,
      p_planned_start: draft.planned_start.toISOString(),
      p_planned_end: draft.planned_end.toISOString(),
      p_client_key: clientKey,
      p_acknowledged_overlaps: acknowledgedIds(acknowledged),
      p_source_task_id: sourceTaskId,
    }),
  );
}

export async function updateTaskDetails(
  taskId: string,
  version: number,
  input: DetailsInput,
  clientKey: string,
): Promise<ActionResult<{ changed: boolean }>> {
  if (!isRecord(input) || !isGuid(taskId) || !isGuid(clientKey) || !Number.isInteger(version)) return badRequest();
  const checked = checkDetails(input);
  if (!checked.ok) return invalid(checked.errors);
  const result = await callRpc("update_task_details", {
    p_task_id: taskId,
    p_expected_version: version,
    p_title: checked.data.title,
    p_description: checked.data.description,
    p_priority: checked.data.priority,
    p_address_snapshot: checked.data.address_snapshot,
    p_access_note_snapshot: checked.data.access_note_snapshot,
    p_client_key: clientKey,
  });
  if (!result.ok) return result;
  return { ok: true, data: { changed: result.data.result === "ok" && result.data.changed !== false } };
}

export async function rescheduleTask(
  taskId: string,
  version: number,
  input: RescheduleInput,
  clientKey: string,
  acknowledged: string[],
): Promise<ActionResult<SaveResult>> {
  if (!isRecord(input) || !isGuid(taskId) || !isGuid(clientKey) || !Number.isInteger(version)) return badRequest();
  const checked = checkReschedule(input);
  if (!checked.ok) return invalid(checked.errors);
  return toSaveResult(
    await callRpc("reschedule_task", {
      p_task_id: taskId,
      p_expected_version: version,
      p_planned_start: checked.data.planned_start.toISOString(),
      p_planned_end: checked.data.planned_end.toISOString(),
      p_reason: checked.data.reason,
      p_client_key: clientKey,
      p_acknowledged_overlaps: acknowledgedIds(acknowledged),
    }),
  );
}

export async function reassignTask(
  taskId: string,
  version: number,
  input: ReassignInput,
  clientKey: string,
  acknowledged: string[],
): Promise<ActionResult<SaveResult>> {
  if (!isRecord(input) || !isGuid(taskId) || !isGuid(clientKey) || !Number.isInteger(version)) return badRequest();
  const checked = checkReassign(input);
  if (!checked.ok) return invalid(checked.errors);
  return toSaveResult(
    await callRpc("reassign_task", {
      p_task_id: taskId,
      p_expected_version: version,
      p_crew_id: checked.data.crew_id,
      p_reason: checked.data.reason,
      p_client_key: clientKey,
      p_acknowledged_overlaps: acknowledgedIds(acknowledged),
    }),
  );
}

export async function cancelTask(
  taskId: string,
  version: number,
  reason: string,
  clientKey: string,
): Promise<ActionResult<SaveResult>> {
  if (!isGuid(taskId) || !isGuid(clientKey) || !Number.isInteger(version)) return badRequest();
  const checked = checkReason({ reason });
  if (!checked.ok) return invalid(checked.errors);
  return toSaveResult(
    await callRpc("cancel_task", {
      p_task_id: taskId,
      p_expected_version: version,
      p_reason: checked.data.reason,
      p_client_key: clientKey,
    }),
  );
}
