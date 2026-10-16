"use server";

import { sessionRole } from "@/features/overview/session";
import type { ActionResult } from "@/lib/rpc";
import { snapshot, type Snapshot } from "@/lib/snapshot";
import { isDayKey } from "@/lib/time";
import { loadSchedule } from "./queries";
import type { ScheduleData } from "./types";

export async function refreshSchedule(date: string): Promise<ActionResult<Snapshot<ScheduleData>>> {
  if (!isDayKey(date)) return { ok: false, error: { kind: "validation", message: "Неверная дата." } };
  const session = await sessionRole(["dispatcher", "foreman", "manager"]);
  if (!session.ok) return session;
  const result = await loadSchedule(date);
  return result.ok ? { ok: true, data: snapshot(result.data) } : result;
}
