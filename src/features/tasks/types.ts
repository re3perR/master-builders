import type { ObstacleCategory, OverlapItem, Task } from "@/lib/database.types";
import type { TaskListRow } from "./db-types";

export type TaskCard = Task & {
  site: { id: string; name: string; archived_at: string | null };
  crew: { id: string; name: string; foreman_id: string; foreman_name: string | null; archived_at: string | null };
  creator_name: string | null;
  canceller_name: string | null;
  open_obstacle: {
    id: string;
    category: ObstacleCategory;
    reason: string;
    opened_at: string;
    opened_by_name: string | null;
  } | null;
  pending_report: { id: string; version: number; submitted_at: string } | null;
  last_return: { version: number; note: string; decided_at: string } | null;
  report_count: number;
  message_count: number;
  source_task: { id: string; number: number; title: string } | null;
  follow_ups: { id: string; number: number; title: string }[];
};

export type TaskListItem = Pick<
  TaskListRow,
  | "id"
  | "number"
  | "title"
  | "site_id"
  | "site_name"
  | "crew_id"
  | "crew_name"
  | "priority"
  | "status"
  | "address_snapshot"
  | "planned_start"
  | "planned_end"
  | "planned_start_original"
  | "planned_end_original"
  | "is_overdue"
  | "has_open_obstacle"
  | "obstacle_category"
  | "obstacle_reason"
  | "obstacle_opened_at"
  | "pending_submitted_at"
>;

export type TaskListPage = {
  rows: TaskListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type FilterOption = { id: string; name: string; archived: boolean };

export type TaskFilterOptions = { sites: FilterOption[]; crews: FilterOption[] };

export type SiteChoice = { id: string; name: string; address: string; access_note: string | null };

export type CrewChoice = { id: string; name: string; foreman_name: string | null };

export type SaveResult = { status: "saved"; taskId: string } | { status: "overlaps"; overlaps: OverlapItem[] };
