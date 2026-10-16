"use server";

import type { ActionResult } from "@/lib/rpc";
import { snapshot, type Snapshot } from "@/lib/snapshot";
import { parsePeriod } from "./period";
import { loadAcceptedReport, loadDispatcherOverview, loadManagerOverview } from "./queries";
import { sessionRole } from "./session";
import type { AcceptedReport, DispatcherOverviewData, ManagerOverviewData } from "./types";

export async function refreshDispatcherOverview(): Promise<ActionResult<Snapshot<DispatcherOverviewData>>> {
  const session = await sessionRole(["dispatcher"]);
  if (!session.ok) return session;
  const result = await loadDispatcherOverview();
  return result.ok ? { ok: true, data: snapshot(result.data) } : result;
}

export async function refreshManagerOverview(days: number): Promise<ActionResult<Snapshot<ManagerOverviewData>>> {
  const session = await sessionRole(["manager"]);
  if (!session.ok) return session;
  const result = await loadManagerOverview(parsePeriod(days));
  return result.ok ? { ok: true, data: snapshot(result.data) } : result;
}

export async function refreshAcceptedReport(days: number): Promise<ActionResult<Snapshot<AcceptedReport>>> {
  const session = await sessionRole(["dispatcher", "manager"]);
  if (!session.ok) return session;
  const result = await loadAcceptedReport(parsePeriod(days));
  return result.ok ? { ok: true, data: snapshot(result.data) } : result;
}
