import type { ObstacleCategory, TaskPriority, TaskStatus } from "@/lib/database.types";

export const myViews = ["action", "today", "upcoming", "review", "done"] as const;

export const donePageSize = 30;
export const doneLimitMax = 1000;

export type MyView = (typeof myViews)[number];

export type Need = "accept" | "start" | "rework" | "obstacle" | "overdue";

export type MyTask = {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  version: number;
  site_name: string;
  address: string;
  planned_start: string;
  planned_end: string;
  overdue: boolean;
  needs: Need[];
  obstacle: { category: ObstacleCategory; reason: string; opened_at: string } | null;
  returned: { version: number; note: string; decided_at: string } | null;
  review: { version: number; submitted_at: string } | null;
  finished_at: string | null;
  cancel_reason: string | null;
};

export type MyTasks = {
  today: string;
  tasks: MyTask[];
  views: Record<MyView, string[]>;
  done_total: number;
};

export function parseView(value: unknown): MyView | null {
  return myViews.find((view) => view === value) ?? null;
}
