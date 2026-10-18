import {
  AlertOctagon,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Eye,
  Hammer,
  Handshake,
  OctagonX,
  TimerOff,
} from "lucide-react";
import type { ObstacleCategory, TaskPriority, TaskStatus } from "@/lib/database.types";
import { cn } from "@/lib/cn";
import { obstacleLabels, priorityLabels, statusLabels } from "@/lib/labels";

const statusStyles: Record<TaskStatus, { className: string; Icon: typeof Clock3 }> = {
  Assigned: {
    className: "bg-status-assigned-soft text-status-assigned border-status-assigned-line",
    Icon: CircleDashed,
  },
  Accepted: { className: "bg-status-accepted-soft text-status-accepted border-status-accepted-line", Icon: Handshake },
  InProgress: { className: "bg-status-progress-soft text-status-progress border-status-progress-line", Icon: Hammer },
  InReview: { className: "bg-status-review-soft text-status-review border-status-review-line", Icon: Eye },
  Completed: { className: "bg-status-done-soft text-status-done border-status-done-line", Icon: CheckCircle2 },
  Cancelled: {
    className: "bg-status-cancelled-soft text-status-cancelled border-status-cancelled-line",
    Icon: OctagonX,
  },
};

const base = "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[13px] font-medium";

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const { className: tone, Icon } = statusStyles[status];
  return (
    <span className={cn(base, tone, className)}>
      <Icon aria-hidden className="size-3.5" />
      {statusLabels[status]}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }) {
  if (priority === "normal") {
    return (
      <span className={cn(base, "border-line bg-surface text-ink-muted", className)}>{priorityLabels.normal}</span>
    );
  }
  return (
    <span
      className={cn(
        base,
        priority === "high" ? "border-danger-line bg-danger-soft text-danger" : "border-line bg-canvas text-ink-muted",
        className,
      )}
    >
      {priority === "high" ? "Высокий приоритет" : "Низкий приоритет"}
    </span>
  );
}

export function OverdueBadge({ className }: { className?: string }) {
  return (
    <span className={cn(base, "border-danger-line bg-danger-soft text-danger", className)}>
      <TimerOff aria-hidden className="size-3.5" />
      Просрочено
    </span>
  );
}

export function ObstacleBadge({ category, className }: { category: ObstacleCategory; className?: string }) {
  return (
    <span className={cn(base, "border-warning-line bg-warning-soft text-warning", className)}>
      <AlertOctagon aria-hidden className="size-3.5" />
      Препятствие: {obstacleLabels[category].toLowerCase()}
    </span>
  );
}

export function ReviewWaitBadge({ className }: { className?: string }) {
  return (
    <span className={cn(base, "border-status-review-line bg-status-review-soft text-status-review", className)}>
      <Clock3 aria-hidden className="size-3.5" />
      Ждёт проверки
    </span>
  );
}
