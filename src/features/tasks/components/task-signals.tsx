import { ObstacleBadge, OverdueBadge, ReviewWaitBadge, StatusBadge } from "@/components/app/task-badges";
import { formatDuration } from "@/lib/time";
import type { TaskListItem } from "../types";

export function TaskSignals({ item, now }: { item: TaskListItem; now: string }) {
  const reviewPastDue = item.status === "InReview" && Date.parse(item.planned_end) < Date.parse(now);

  return (
    <div className="flex flex-col items-start gap-1.5">
      <StatusBadge status={item.status} />
      {item.is_overdue ? (
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <OverdueBadge />
          <span className="tabular text-sm text-danger">на {formatDuration(item.planned_end, now)}</span>
        </span>
      ) : null}
      {item.has_open_obstacle && item.obstacle_category ? (
        <span className="flex flex-col items-start gap-0.5">
          <ObstacleBadge category={item.obstacle_category} />
          <span className="line-clamp-2 text-sm text-ink-muted" title={item.obstacle_reason ?? undefined}>
            {item.obstacle_opened_at ? (
              <span className="tabular">{formatDuration(item.obstacle_opened_at, now)} · </span>
            ) : null}
            {item.obstacle_reason}
          </span>
        </span>
      ) : null}
      {item.status === "InReview" ? (
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <ReviewWaitBadge />
          {item.pending_submitted_at ? (
            <span className="tabular text-sm text-ink-muted">{formatDuration(item.pending_submitted_at, now)}</span>
          ) : null}
          {reviewPastDue ? <span className="text-sm text-ink-muted">Плановый срок прошёл</span> : null}
        </span>
      ) : null}
    </div>
  );
}
