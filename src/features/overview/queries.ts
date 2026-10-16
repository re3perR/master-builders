import "server-only";
import { callRpc, type ActionResult } from "@/lib/rpc";
import { dayKey, dayRange, shiftDay } from "@/lib/time";
import { periodFor, type PeriodDays } from "./period";
import type { AcceptedReport, DispatcherOverviewData, ManagerOverviewData } from "./types";

const queueSize = 5;

export async function loadDispatcherOverview(): Promise<ActionResult<DispatcherOverviewData>> {
  const today = dayKey();
  const [counters, attention, upcoming] = await Promise.all([
    callRpc("division_counters", {}),
    callRpc("division_attention", { p_limit: queueSize }),
    callRpc("schedule_tasks", {
      p_from: dayRange(today).start.toISOString(),
      p_to: dayRange(shiftDay(today, 1)).end.toISOString(),
    }),
  ]);
  if (!counters.ok) return counters;
  if (!attention.ok) return attention;
  if (!upcoming.ok) return upcoming;

  return {
    ok: true,
    data: {
      today,
      counters: counters.data,
      attention: attention.data,
      upcoming: upcoming.data.filter((task) => task.status !== "Completed"),
    },
  };
}

export async function loadManagerOverview(days: PeriodDays): Promise<ActionResult<ManagerOverviewData>> {
  const period = periodFor(days);
  const [counters, attention, metrics] = await Promise.all([
    callRpc("division_counters", {}),
    callRpc("division_attention", { p_limit: queueSize }),
    callRpc("division_metrics", { p_from: period.from, p_to: period.to }),
  ]);
  if (!counters.ok) return counters;
  if (!attention.ok) return attention;
  if (!metrics.ok) return metrics;

  return { ok: true, data: { counters: counters.data, attention: attention.data, metrics: metrics.data, period } };
}

export async function loadAcceptedReport(days: PeriodDays): Promise<ActionResult<AcceptedReport>> {
  const period = periodFor(days);
  const [metrics, tasks] = await Promise.all([
    callRpc("division_metrics", { p_from: period.from, p_to: period.to }),
    callRpc("division_accepted_tasks", { p_from: period.from, p_to: period.to }),
  ]);
  if (!metrics.ok) return metrics;
  if (!tasks.ok) return tasks;

  return { ok: true, data: { period, metrics: metrics.data, tasks: tasks.data } };
}
