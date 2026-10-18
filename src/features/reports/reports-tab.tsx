import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { TaskCard } from "@/features/tasks/types";
import type { Viewer } from "@/lib/auth";
import { isFinal } from "@/lib/labels";
import { formatDateTime, formatDuration } from "@/lib/time";
import { DecisionBadge } from "./decision-badge";
import { PhotoGallery } from "./photo-gallery";
import { getReportVersions, type ReportVersion } from "./queries";

function Decision({ report }: { report: ReportVersion }) {
  const by = report.decided_by_name ? `${report.decided_by_name}, ` : "";
  const when = report.decided_at ? formatDateTime(report.decided_at) : "";

  if (report.decision === "pending") {
    return (
      <p className="text-sm text-ink-muted">
        Ждёт решения диспетчера · {formatDuration(report.submitted_at)} с момента отправки
      </p>
    );
  }
  if (report.decision === "accepted") {
    return (
      <p className="text-sm">
        Принят: {by}
        {when}.{" "}
        {report.decided_at ? (
          <span className="text-ink-muted">
            Проверка заняла {formatDuration(report.submitted_at, report.decided_at)}.
          </span>
        ) : null}
      </p>
    );
  }
  return (
    <div
      className={
        report.decision === "returned"
          ? "rounded-lg border border-[#fed7aa] bg-status-progress-soft p-3"
          : "rounded-lg border border-line bg-canvas p-3"
      }
    >
      <p className="text-sm">
        {report.decision === "returned" ? "Возвращён на доработку" : "Отменён вместе с заданием"}: {by}
        {when}
      </p>
      {report.decision_note ? (
        <p className="mt-1 whitespace-pre-line break-words">
          <span className="font-medium">{report.decision === "returned" ? "Замечание: " : "Причина отмены: "}</span>
          {report.decision_note}
        </p>
      ) : null}
    </div>
  );
}

export async function ReportsTab({ card, viewer }: { card: TaskCard; viewer: Viewer }) {
  const reports = await getReportVersions(card.id);
  const assigned = viewer.profile.role === "foreman" && viewer.crew?.id === card.crew_id;

  if (!reports.length) {
    return (
      <Card>
        <EmptyState
          title="Отчётов пока нет"
          description={
            isFinal(card.status)
              ? "По этому заданию отчёт не отправляли."
              : assigned
                ? card.open_obstacle
                  ? "Отчёт можно будет отправить после того, как препятствие будет закрыто."
                  : "Когда работа будет выполнена, отправьте фотоотчёт: комментарий и от 1 до 10 фото."
                : "Бригадир отправит фотоотчёт, когда закончит работу. Список обновится после отправки."
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {reports.map((report) => (
        <Card key={report.id}>
          <CardHeader className="flex-wrap">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">Версия {report.version}</h2>
              <p className="text-sm text-ink-muted">
                {report.submitted_by_name ?? "Бригадир"} · отправлен {formatDateTime(report.submitted_at)}
              </p>
            </div>
            <DecisionBadge decision={report.decision} />
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <p className="whitespace-pre-line break-words">{report.comment}</p>
            <PhotoGallery
              taskId={card.id}
              reportId={report.id}
              label={`Отчёт, версия ${report.version}`}
              photos={report.photos}
            />
            <Decision report={report} />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
