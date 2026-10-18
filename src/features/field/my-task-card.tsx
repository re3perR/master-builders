import { AlertOctagon, Camera, Clock, Eye, MapPin, RotateCcw } from "lucide-react";
import Link from "next/link";
import { OverdueBadge, PriorityBadge, StatusBadge } from "@/components/app/task-badges";
import { buttonVariants } from "@/components/ui/button";
import { obstacleLabels, taskCode } from "@/lib/labels";
import { formatDateTime, formatDuration } from "@/lib/time";
import { formatPlan } from "./format";
import { TransitionButton } from "./transition-button";
import type { MyTask } from "./types";

function NextStep({ task }: { task: MyTask }) {
  const wide = "w-full sm:w-auto";
  if (task.status === "Assigned") return <TransitionButton taskId={task.id} version={task.version} step="accept" />;
  if (task.status === "Accepted") return <TransitionButton taskId={task.id} version={task.version} step="start" />;
  if (task.status === "InProgress" && task.obstacle) {
    return (
      <Link href={`/tasks/${task.id}`} className={buttonVariants({ variant: "secondary", className: wide })}>
        <AlertOctagon aria-hidden className="size-4" />
        Перейти к препятствию
      </Link>
    );
  }
  if (task.status === "InProgress") {
    return (
      <Link href={`/tasks/${task.id}/report`} className={buttonVariants({ className: wide })}>
        <Camera aria-hidden className="size-4" />
        {task.returned ? "Отправить исправленный отчёт" : "Отправить отчёт"}
      </Link>
    );
  }
  if (task.status === "InReview") {
    return (
      <Link
        href={`/tasks/${task.id}?tab=reports`}
        className={buttonVariants({ variant: "secondary", className: wide })}
      >
        <Eye aria-hidden className="size-4" />
        Открыть отчёт
      </Link>
    );
  }
  return (
    <Link href={`/tasks/${task.id}`} className={buttonVariants({ variant: "secondary", className: wide })}>
      Открыть задание
    </Link>
  );
}

export function MyTaskCard({ task, today, now }: { task: MyTask; today: string; now: string }) {
  return (
    <article className="relative flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="tabular text-sm font-medium text-ink-muted">{taskCode(task.number)}</span>
        <StatusBadge status={task.status} />
        {task.priority === "high" ? <PriorityBadge priority="high" /> : null}
        {task.overdue ? <OverdueBadge /> : null}
      </div>

      <h3 className="text-[17px] leading-snug font-semibold">
        <Link
          href={`/tasks/${task.id}`}
          className="after:absolute after:inset-0 after:rounded-[var(--radius-card)] hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
        >
          {task.title}
        </Link>
      </h3>

      <dl className="flex flex-col gap-1.5 text-[15px]">
        <div className="flex gap-2">
          <dt className="pt-0.5">
            <MapPin aria-hidden className="size-4 text-ink-muted" />
            <span className="sr-only">Адрес</span>
          </dt>
          <dd className="min-w-0">
            {task.address}
            {task.site_name ? <span className="block text-sm text-ink-muted">{task.site_name}</span> : null}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="pt-0.5">
            <Clock aria-hidden className="size-4 text-ink-muted" />
            <span className="sr-only">Срок</span>
          </dt>
          <dd className="tabular">{formatPlan(task.planned_start, task.planned_end, today)}</dd>
        </div>
      </dl>

      {task.obstacle ? (
        <div className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertOctagon aria-hidden className="size-3.5" />
            Препятствие: {obstacleLabels[task.obstacle.category].toLowerCase()} · длится{" "}
            {formatDuration(task.obstacle.opened_at, now)}
          </p>
          <p className="line-clamp-2 text-ink">{task.obstacle.reason}</p>
        </div>
      ) : null}

      {task.returned ? (
        <div className="rounded-lg border border-status-progress-line bg-status-progress-soft px-3 py-2 text-sm text-status-progress">
          <p className="flex items-center gap-1.5 font-medium">
            <RotateCcw aria-hidden className="size-3.5" />
            Возвращено на доработку, версия {task.returned.version}
          </p>
          <p className="line-clamp-3 text-ink">{task.returned.note}</p>
        </div>
      ) : null}

      {task.review ? (
        <p className="text-sm text-ink-muted">
          Отчёт, версия {task.review.version}, отправлен {formatDateTime(task.review.submitted_at)} · ждёт проверки{" "}
          {formatDuration(task.review.submitted_at, now)}
        </p>
      ) : null}

      {task.finished_at ? (
        <p className="text-sm text-ink-muted">
          {task.status === "Completed" ? "Результат принят" : "Отменено"} {formatDateTime(task.finished_at)}
          {task.cancel_reason ? `: ${task.cancel_reason}` : ""}
        </p>
      ) : null}

      <div className="relative z-10">
        <NextStep task={task} />
      </div>
    </article>
  );
}
