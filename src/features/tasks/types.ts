import type { ObstacleCategory, Task } from "@/lib/database.types";

export type TaskCard = Task & {
  site: { id: string; name: string; archived_at: string | null };
  crew: { id: string; name: string; foreman_id: string; foreman_name: string | null };
  creator_name: string | null;
  open_obstacle: {
    id: string;
    category: ObstacleCategory;
    reason: string;
    opened_at: string;
    opened_by_name: string | null;
  } | null;
  pending_report: { id: string; version: number; submitted_at: string } | null;
  last_return: { version: number; note: string; decided_at: string } | null;
  source_task: { id: string; number: number; title: string } | null;
  follow_ups: { id: string; number: number; title: string }[];
};
