import type { AcceptedTask, AttentionQueue, DivisionCounters, DivisionMetrics, ScheduleTask } from "./db-types";
import type { Period } from "./period";

export type DispatcherOverviewData = {
  today: string;
  counters: DivisionCounters;
  attention: AttentionQueue;
  upcoming: ScheduleTask[];
};

export type ManagerOverviewData = {
  counters: DivisionCounters;
  attention: AttentionQueue;
  metrics: DivisionMetrics;
  period: Period;
};

export type AcceptedReport = {
  period: Period;
  metrics: DivisionMetrics;
  tasks: AcceptedTask[];
};
