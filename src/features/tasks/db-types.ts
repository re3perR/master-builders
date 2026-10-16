import type { ObstacleCategory, TaskPriority, TaskStatus } from "@/lib/database.types";

export type FeatureFunctions = Record<never, never>;

export type TaskListRow = {
  id: string;
  company_id: string;
  division_id: string;
  number: number;
  title: string;
  site_id: string;
  site_name: string | null;
  crew_id: string;
  crew_name: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  address_snapshot: string;
  planned_start: string;
  planned_end: string;
  planned_start_original: string;
  planned_end_original: string;
  accepted_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  source_task_id: string | null;
  terms_changed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  version: number;
  is_overdue: boolean;
  has_open_obstacle: boolean;
  obstacle_category: ObstacleCategory | null;
  obstacle_reason: string | null;
  obstacle_opened_at: string | null;
  pending_submitted_at: string | null;
  search_text: string;
};

export type FeatureViews = {
  task_list: { Row: TaskListRow; Relationships: [] };
};
