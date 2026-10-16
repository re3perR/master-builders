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
  Assigned: { className: "bg-status-assigned-soft text-status-assigned border-[#bfdbfe]", Icon: CircleDashed },
  Accepted: { className: "bg-status-accepted-soft text-status-accepted border-[#ddd6fe]", Icon: Handshake },
  InProgress: { className: "bg-status-progress-soft text-status-progress border-[#fed7aa]", Icon: Hammer },
  InReview: { className: "bg-status-review-soft text-status-review border-[#c7d2fe]", Icon: Eye },
  Completed: { className: "bg-status-done-soft text-status-done border-[#bbf7d0]", Icon: CheckCircle2 },
  Cancelled: { className: "bg-status-cancelled-soft text-status-cancelled border-[#e5e7eb]", Icon: OctagonX },
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
        priority === "high" ? "border-[#fecaca] bg-danger-soft text-danger" : "border-line bg-canvas text-ink-muted",
        className,
      )}
    >
      {priority === "high" ? "Высокий приоритет" : "Низкий приоритет"}
    </span>
  );
}

export function OverdueBadge({ className }: { className?: string }) {
  return (
    <span className={cn(base, "border-[#fecaca] bg-danger-soft text-danger", className)}>
      <TimerOff aria-hidden className="size-3.5" />
      Просрочено
    </span>
  );
}

export function ObstacleBadge({ category, className }: { category: ObstacleCategory; className?: string }) {
  return (
    <span className={cn(base, "border-[#fde68a] bg-warning-soft text-warning", className)}>
      <AlertOctagon aria-hidden className="size-3.5" />
      Препятствие: {obstacleLabels[category].toLowerCase()}
    </span>
  );
}

export function ReviewWaitBadge({ className }: { className?: string }) {
  return (
    <span className={cn(base, "border-[#c7d2fe] bg-status-review-soft text-status-review", className)}>
      <Clock3 aria-hidden className="size-3.5" />
      Ждёт проверки
    </span>
  );
}
