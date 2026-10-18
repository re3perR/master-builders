import { CalendarClock, ChevronLeft, FilePenLine, History, MapPin, OctagonX, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ObstacleBadge, OverdueBadge, PriorityBadge, StatusBadge } from "@/components/app/task-badges";
import type { Viewer } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { isOverdue, taskCode } from "@/lib/labels";
import { formatDateTime, formatDuration, formatInterval } from "@/lib/time";
import type { TaskCard } from "../types";

export function isRescheduled(card: TaskCard) {
  return (
    new Date(card.planned_start).getTime() !== new Date(card.planned_start_original).getTime() ||
    new Date(card.planned_end).getTime() !== new Date(card.planned_end_original).getTime()
  );
}

type MetaLineProps = { icon: ReactNode; label: string; linked?: boolean; children: ReactNode };

function MetaLine({ icon, label, linked, children }: MetaLineProps) {
  return (
    <li className="flex gap-2">
      <span aria-hidden className={cn("mt-1 shrink-0 text-ink-muted", linked && "mt-3.5 sm:mt-1")}>
        {icon}
      </span>
      <span className="sr-only">{label}: </span>
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

function deadlinePassed(card: TaskCard) {
  return new Date(card.planned_end).getTime() < Date.now();
}

export function TaskHeader({ card, viewer }: { card: TaskCard; viewer: Viewer }) {
  const foreman = viewer.profile.role === "foreman";
  const overdue = isOverdue(card);
  const pastDeadline = card.status === "InReview" && deadlinePassed(card);
  const linkClass =
    "flex min-h-11 w-fit items-center font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink sm:inline sm:min-h-0";
  const separator = <span className="hidden sm:inline"> · </span>;

  return (
    <div className="mb-4">
      <Link
        href={foreman ? "/my" : "/tasks"}
        className="inline-flex min-h-11 items-center gap-1 text-sm text-ink-muted hover:underline sm:min-h-0"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {foreman ? "Мои задания" : "Задания"}
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="tabular text-sm font-medium text-ink-muted">{taskCode(card.number)}</span>
        <StatusBadge status={card.status} />
        {card.priority !== "normal" ? <PriorityBadge priority={card.priority} /> : null}
        {overdue ? <OverdueBadge /> : null}
        {card.open_obstacle ? <ObstacleBadge category={card.open_obstacle.category} /> : null}
      </div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight break-words">{card.title}</h1>

      <ul className="mt-3 flex flex-col gap-1.5 text-ink-muted">
        <MetaLine icon={<MapPin className="size-4" />} label="Объект" linked>
          <Link href={`/sites/${card.site.id}`} className={linkClass}>
            {card.site.name}
          </Link>
          {separator}
          {card.address_snapshot}
        </MetaLine>
        <MetaLine icon={<Users className="size-4" />} label="Бригада" linked>
          <Link href={`/crews/${card.crew.id}`} className={linkClass}>
            {card.crew.name}
          </Link>
          {card.crew.foreman_name ? (
            <>
              {separator}
              бригадир {card.crew.foreman_name}
            </>
          ) : null}
        </MetaLine>
        <MetaLine icon={<CalendarClock className="size-4" />} label="Плановые сроки">
          <span className="tabular text-ink">{formatInterval(card.planned_start, card.planned_end)}</span>
          {isRescheduled(card) ? (
            <span className="ml-2 inline-flex items-center gap-1 text-sm whitespace-nowrap">
              <History aria-hidden className="size-3.5" />
              Перенесено
            </span>
          ) : null}
          {overdue ? (
            <span className="ml-2 text-sm whitespace-nowrap text-danger">
              просрочено на {formatDuration(card.planned_end)}
            </span>
          ) : null}
          {pastDeadline ? <span className="ml-2 text-sm whitespace-nowrap">Плановый срок прошёл</span> : null}
        </MetaLine>
        {card.terms_changed_at ? (
          <MetaLine icon={<FilePenLine className="size-4" />} label="Изменения">
            Условия изменены после принятия, {formatDateTime(card.terms_changed_at)} ·{" "}
            <Link
              href={`/tasks/${card.id}?tab=history`}
              scroll={false}
              className="font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
            >
              история
            </Link>
          </MetaLine>
        ) : null}
      </ul>

      {card.status === "Cancelled" ? (
        <div className="mt-4 flex gap-2.5 rounded-lg border border-line bg-status-cancelled-soft px-3 py-2.5 text-sm text-ink">
          <OctagonX aria-hidden className="mt-0.5 size-4 shrink-0 text-status-cancelled" />
          <div className="min-w-0">
            <p className="font-semibold">
              Задание отменено{card.cancelled_at ? ` ${formatDateTime(card.cancelled_at)}` : ""}
              {card.canceller_name ? ` · ${card.canceller_name}` : ""}
            </p>
            {card.cancel_reason ? (
              <p className="mt-0.5 whitespace-pre-line break-words">Причина: {card.cancel_reason}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
