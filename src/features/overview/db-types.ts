import type { Fn, ObstacleCategory, OverlapItem, TaskPriority, TaskStatus } from "@/lib/database.types";

export type DivisionCounters = {
  total: number;
  active: number;
  overdue: number;
  obstacles: number;
  review: number;
  statuses: Record<TaskStatus, number>;
};

export type DivisionMetrics = {
  accepted: number;
  on_time_original: number;
  on_time_current: number;
  avg_review_seconds: number | null;
};

export type AcceptedTask = {
  task_id: string;
  number: number;
  title: string;
  crew_id: string;
  crew_name: string | null;
  report_id: string;
  report_version: number;
  submitted_at: string;
  decided_at: string;
  planned_end_original: string;
  planned_end: string;
  on_time_original: boolean;
  on_time_current: boolean;
  review_seconds: number;
};

type QueueTask = {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  crew_id: string;
  crew_name: string | null;
  site_name: string | null;
  planned_start: string;
  planned_end: string;
};

type OverdueItem = QueueTask & { obstacle_category: ObstacleCategory | null };

type ObstacleItem = QueueTask & { category: ObstacleCategory; reason: string; opened_at: string };

type ReviewItem = QueueTask & { report_version: number; submitted_at: string };

export type AttentionQueue = {
  overdue: OverdueItem[];
  obstacles: ObstacleItem[];
  review: ReviewItem[];
};

export type ScheduleTask = {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  crew_id: string;
  crew_name: string | null;
  site_id: string;
  site_name: string | null;
  planned_start: string;
  planned_end: string;
  obstacle_category: ObstacleCategory | null;
  overlapping: OverlapItem[];
};

type Period = { p_from: string; p_to: string };

export type FeatureFunctions = {
  division_counters: Fn<Record<string, never>, DivisionCounters>;
  division_metrics: Fn<Period, DivisionMetrics>;
  division_accepted_tasks: Fn<Period, AcceptedTask[]>;
  division_attention: Fn<{ p_limit?: number }, AttentionQueue>;
  schedule_tasks: Fn<Period, ScheduleTask[]>;
};
