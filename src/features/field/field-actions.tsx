import { AlertOctagon, Camera, Eye } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import type { TaskTab } from "@/features/tasks/components/task-tabs";
import type { TaskCard } from "@/features/tasks/types";
import type { Viewer } from "@/lib/auth";
import { executionStatuses, obstacleLabels } from "@/lib/labels";
import { formatDateTime, formatDuration } from "@/lib/time";
import { CloseObstacleDialog, OpenObstacleDialog } from "./obstacle-dialogs";
import { ReturnNote } from "./return-note";
import { TransitionButton } from "./transition-button";

type Returned = NonNullable<TaskCard["last_return"]>;

function ObstacleNotice({ card, canClose }: { card: TaskCard; canClose: boolean }) {
  const obstacle = card.open_obstacle;
  if (!obstacle) return null;
  return (
    <section
      aria-labelledby="open-obstacle-title"
      className="rounded-[var(--radius-card)] border border-[#fde68a] bg-warning-soft p-4 text-[#713f12]"
    >
      <div className="flex gap-3">
        <AlertOctagon aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 id="open-obstacle-title" className="font-semibold">
            Препятствие: {obstacleLabels[obstacle.category].toLowerCase()}
          </h2>
          <p className="mt-1 whitespace-pre-line break-words text-ink">{obstacle.reason}</p>
          <p className="mt-1.5 text-sm">
            {obstacle.opened_by_name ? `Сообщил ${obstacle.opened_by_name}, ` : "Открыто "}
            {formatDateTime(obstacle.opened_at)} · длится {formatDuration(obstacle.opened_at)}
          </p>
          {canClose ? (
            <div className="mt-3">
              <CloseObstacleDialog taskId={card.id} version={card.version} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ReportButton({ card, returned }: { card: TaskCard; returned: Returned | null }) {
  const label = returned ? "Отправить исправленный отчёт" : "Отправить отчёт";
  if (card.open_obstacle) {
    return (
      <div className="flex flex-col gap-1.5 sm:items-start">
        <Button disabled aria-describedby="report-blocked" className="w-full sm:w-auto">
          <Camera aria-hidden className="size-4" />
          {label}
        </Button>
        <p id="report-blocked" className="text-sm text-ink-muted">
          Отчёт можно отправить после того, как препятствие будет закрыто.
        </p>
      </div>
    );
  }
  return (
    <Link href={`/tasks/${card.id}/report`} className={buttonVariants({ className: "w-full sm:w-auto" })}>
      <Camera aria-hidden className="size-4" />
      {label}
    </Link>
  );
}

function ForemanPanel({ card, returned, tab }: { card: TaskCard; returned: Returned | null; tab: TaskTab }) {
  const canReportObstacle = executionStatuses.includes(card.status) && !card.open_obstacle;

  if (card.status === "Cancelled") return null;
  if (card.status === "Completed") {
    return (
      <p className="text-ink-muted">
        Результат принят{card.completed_at ? ` ${formatDateTime(card.completed_at)}` : ""}. Задание завершено.
      </p>
    );
  }
  if (card.status === "InReview") {
    return (
      <Card>
        <CardBody>
          <p>
            Отчёт{card.pending_report ? `, версия ${card.pending_report.version},` : ""} отправлен
            {card.pending_report ? ` ${formatDateTime(card.pending_report.submitted_at)}` : ""} и ждёт проверки
            диспетчером.
          </p>
          {tab !== "reports" ? (
            <Link
              href={`/tasks/${card.id}?tab=reports`}
              scroll={false}
              className={buttonVariants({ variant: "secondary", className: "mt-3 w-full sm:w-auto" })}
            >
              <Eye aria-hidden className="size-4" />
              Открыть отчёт
            </Link>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        {returned ? <ReturnNote returned={returned} /> : null}
        <p>
          {card.status === "Assigned"
            ? "Ознакомьтесь с условиями и примите задание, чтобы диспетчер видел, что бригада в курсе."
            : card.status === "Accepted"
              ? `Задание принято${card.accepted_at ? ` ${formatDateTime(card.accepted_at)}` : ""}. Когда бригада приступит, нажмите «Начать работу».`
              : returned
                ? "Исправьте замечания и отправьте новую версию отчёта."
                : "Работа идёт. Когда закончите, отправьте фотоотчёт: комментарий и от 1 до 10 фото."}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
          {card.status === "Assigned" ? (
            <TransitionButton taskId={card.id} version={card.version} step="accept" />
          ) : null}
          {card.status === "Accepted" ? (
            <TransitionButton taskId={card.id} version={card.version} step="start" />
          ) : null}
          {card.status === "InProgress" ? <ReportButton card={card} returned={returned} /> : null}
          {canReportObstacle ? <OpenObstacleDialog taskId={card.id} version={card.version} /> : null}
        </div>
      </CardBody>
    </Card>
  );
}

export function FieldActions({ card, viewer, tab }: { card: TaskCard; viewer: Viewer; tab: TaskTab }) {
  const role = viewer.profile.role;
  const assigned = role === "foreman" && viewer.crew?.id === card.crew_id;
  const canClose = (assigned || role === "dispatcher") && executionStatuses.includes(card.status);
  const returned = card.status === "InProgress" ? card.last_return : null;

  return (
    <>
      <ObstacleNotice card={card} canClose={canClose} />
      {assigned ? <ForemanPanel card={card} returned={returned} tab={tab} /> : null}
      {!assigned && returned ? <ReturnNote returned={returned} /> : null}
    </>
  );
}
