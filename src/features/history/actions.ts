"use server";

import type { ActionResult } from "@/lib/rpc";
import { snapshot, type Snapshot } from "@/lib/snapshot";
import { getHistory } from "./queries";
import type { HistoryEvent } from "./types";

export async function loadHistory(taskId: string): Promise<ActionResult<Snapshot<HistoryEvent[]>>> {
  const result = await getHistory(taskId);
  return result.ok ? { ok: true, data: snapshot(result.data) } : result;
}
