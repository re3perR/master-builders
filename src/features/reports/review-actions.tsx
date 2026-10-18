import { CalendarClock, Clock3, Eye } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { TaskTab } from "@/features/tasks/components/task-tabs";
import type { TaskCard } from "@/features/tasks/types";
import type { Viewer } from "@/lib/auth";
import { formatDateTime, formatDuration } from "@/lib/time";
import { ApproveReportDialog, ReturnReportDialog } from "./review-dialogs";

function passedDeadline(card: TaskCard, submittedAt: string) {
  const end = new Date(card.planned_end).getTime();
  if (end >= Date.now()) return null;
  return { submittedBefore: new Date(submittedAt).getTime() <= end };
}

export function ReviewActions({ card, viewer, tab }: { card: TaskCard; viewer: Viewer; tab: TaskTab }) {
  const report = card.pending_report;
  const role = viewer.profile.role;
  if (card.status !== "InReview" || !report || role === "foreman") return null;

  const deadline = passedDeadline(card, report.submitted_at);

  return (
    <section
      aria-labelledby="review-title"
      className="rounded-[var(--radius-card)] border border-status-review-line bg-status-review-soft p-4"
    >
      <div className="flex gap-3">
        <Clock3 aria-hidden className="mt-0.5 size-5 shrink-0 text-status-review" />
        <div className="min-w-0 flex-1">
          <h2 id="review-title" className="font-semibold text-status-review">
            Отчёт, версия {report.version}, ждёт проверки
          </h2>
          <p className="mt-0.5 text-ink">
            Отправлен {formatDateTime(report.submitted_at)} · ожидает {formatDuration(report.submitted_at)}
          </p>
          {deadline ? (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-muted">
              <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                Плановый срок окончания прошёл: {formatDateTime(card.planned_end)}
                {deadline.submittedBefore ? ". Отчёт был отправлен до него." : "."}
              </span>
            </p>
          ) : null}
        </div>
      </div>
      {role === "dispatcher" ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <ApproveReportDialog
            taskId={card.id}
            version={card.version}
            reportId={report.id}
            reportVersion={report.version}
          />
          <ReturnReportDialog
            taskId={card.id}
            version={card.version}
            reportId={report.id}
            reportVersion={report.version}
          />
          {tab !== "reports" ? (
            <Link
              href={`/tasks/${card.id}?tab=reports`}
              scroll={false}
              className={buttonVariants({ variant: "ghost", className: "w-full sm:w-auto" })}
            >
              <Eye aria-hidden className="size-4" />
              Открыть отчёт
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
