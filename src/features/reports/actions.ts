"use server";

import { z } from "zod";
import { getViewer } from "@/lib/auth";
import type { TaskMutationResult } from "@/lib/database.types";
import { toAppError } from "@/lib/errors";
import { callRpc, type ActionResult } from "@/lib/rpc";
import { createClient } from "@/lib/supabase/server";
import { getReportPhotoLinks } from "./queries";

const taskVersion = {
  taskId: z.guid(),
  version: z.number().int().positive(),
  clientKey: z.guid(),
};

const reportInput = z.object({
  ...taskVersion,
  comment: z.string().max(10000),
  uploadIds: z.array(z.guid()).max(20),
});

const decisionInput = z.object({
  ...taskVersion,
  reportId: z.guid(),
});

const returnInput = decisionInput.extend({
  note: z.string().max(10000),
});

const invalid: ActionResult<never> = {
  ok: false,
  error: { kind: "validation", message: "Проверьте введённые данные." },
};

export async function submitReport(input: z.input<typeof reportInput>): Promise<ActionResult<TaskMutationResult>> {
  const parsed = reportInput.safeParse(input);
  if (!parsed.success) return invalid;
  return callRpc("submit_report", {
    p_task_id: parsed.data.taskId,
    p_expected_version: parsed.data.version,
    p_comment: parsed.data.comment,
    p_upload_ids: parsed.data.uploadIds,
    p_client_key: parsed.data.clientKey,
  });
}

export async function approveReport(input: z.input<typeof decisionInput>): Promise<ActionResult<TaskMutationResult>> {
  const parsed = decisionInput.safeParse(input);
  if (!parsed.success) return invalid;
  return callRpc("approve_report", {
    p_task_id: parsed.data.taskId,
    p_expected_version: parsed.data.version,
    p_report_id: parsed.data.reportId,
    p_client_key: parsed.data.clientKey,
  });
}

export async function returnReport(input: z.input<typeof returnInput>): Promise<ActionResult<TaskMutationResult>> {
  const parsed = returnInput.safeParse(input);
  if (!parsed.success) return invalid;
  return callRpc("return_report", {
    p_task_id: parsed.data.taskId,
    p_expected_version: parsed.data.version,
    p_report_id: parsed.data.reportId,
    p_note: parsed.data.note,
    p_client_key: parsed.data.clientKey,
  });
}

export async function discardUpload(input: { uploadId: string }): Promise<ActionResult<null>> {
  const parsed = z.object({ uploadId: z.guid() }).safeParse(input);
  if (!parsed.success) return invalid;
  try {
    const supabase = await createClient();
    const { data: upload } = await supabase
      .from("uploads")
      .select("storage_path, report_id")
      .eq("id", parsed.data.uploadId)
      .maybeSingle();
    if (upload && !upload.report_id) {
      await supabase.storage.from("task-photos").remove([upload.storage_path]);
    }
  } catch {
    return { ok: false, error: toAppError(null) };
  }
  const result = await callRpc("discard_upload", { p_upload_id: parsed.data.uploadId });
  return result.ok ? { ok: true, data: null } : result;
}

export async function refreshPhotoLinks(input: {
  taskId: string;
  reportId: string;
}): Promise<ActionResult<Record<string, string | null>>> {
  const parsed = z.object({ taskId: z.guid(), reportId: z.guid() }).safeParse(input);
  if (!parsed.success) return invalid;
  if (!(await getViewer())) return { ok: false, error: toAppError({ code: "MB401" }) };
  try {
    return { ok: true, data: await getReportPhotoLinks(parsed.data.taskId, parsed.data.reportId) };
  } catch {
    return { ok: false, error: toAppError(null) };
  }
}
