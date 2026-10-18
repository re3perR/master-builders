"use client";

import { CheckCircle2, ChevronLeft, TimerOff } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { PageHeader } from "@/components/app/page-header";
import { RefreshStatus } from "@/components/app/refresh-status";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { usePolling } from "@/hooks/use-polling";
import { taskCode } from "@/lib/labels";
import type { Snapshot } from "@/lib/snapshot";
import { formatDuration } from "@/lib/time";
import { refreshAcceptedReport } from "../actions";
import type { AcceptedTask, DivisionMetrics } from "../db-types";
import { formatMoment, formatSeconds, formatShare } from "../format";
import { taskLink } from "../links";
import { periodLabel } from "../period";
import type { AcceptedReport } from "../types";
import { PeriodSwitch } from "./period-switch";

function Verdict({ submitted, deadline }: { submitted: string; deadline: string }) {
  if (Date.parse(submitted) <= Date.parse(deadline)) {
    return (
      <Badge tone="success">
        <CheckCircle2 aria-hidden className="size-3.5" />В срок
      </Badge>
    );
  }
  return (
    <Badge tone="danger">
      <TimerOff aria-hidden className="size-3.5" />
      Позже на {formatDuration(deadline, submitted)}
    </Badge>
  );
}

function Deadline({
  label,
  task,
  deadline,
  now,
}: {
  label?: string;
  task: AcceptedTask;
  deadline: string;
  now: number;
}) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {label ? <span className="text-ink-muted">{label}</span> : null}
      <span className="tabular">{formatMoment(deadline, now)}</span>
      <Verdict submitted={task.submitted_at} deadline={deadline} />
    </span>
  );
}

function Summary({ metrics }: { metrics: DivisionMetrics }) {
  const share = (part: number) =>
    metrics.accepted ? `${formatShare(part, metrics.accepted)} · ${part} из ${metrics.accepted}` : "Нет данных";
  const items = [
    { label: "Принято заданий", value: String(metrics.accepted) },
    { label: "В исходный срок", value: share(metrics.on_time_original) },
    { label: "В текущий срок", value: share(metrics.on_time_current) },
    {
      label: "Среднее время проверки",
      value: metrics.avg_review_seconds === null ? "Нет данных" : formatSeconds(metrics.avg_review_seconds),
    },
  ];
  return (
    <Card className="mb-5 overflow-hidden">
      <dl className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="bg-surface px-4 py-3">
            <dt className="text-sm text-ink-muted">{item.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function AcceptedTable({ tasks, now }: { tasks: AcceptedTask[]; now: number }) {
  return (
    <>
      <Card className="hidden overflow-hidden md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-canvas text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Задание
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Отчёт отправлен
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Исходный срок
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Текущий срок
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                Проверка
              </th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.report_id} className="border-t border-line align-top first:border-t-0">
                <td className="px-4 py-3">
                  <Link href={taskLink(task.task_id, "reports")} className="font-medium hover:underline">
                    <span className="tabular text-ink-muted">{taskCode(task.number)}</span> {task.title}
                  </Link>
                  <p className="text-ink-muted">
                    {task.crew_name ?? "Бригада недоступна"} · принята версия {task.report_version}
                  </p>
                </td>
                <td className="tabular px-4 py-3 whitespace-nowrap">{formatMoment(task.submitted_at, now)}</td>
                <td className="px-4 py-3">
                  <Deadline task={task} deadline={task.planned_end_original} now={now} />
                </td>
                <td className="px-4 py-3">
                  <Deadline task={task} deadline={task.planned_end} now={now} />
                </td>
                <td className="tabular px-4 py-3 text-right whitespace-nowrap">{formatSeconds(task.review_seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ul className="flex flex-col gap-3 md:hidden">
        {tasks.map((task) => (
          <li key={task.report_id}>
            <Card className="relative px-4 py-3 text-sm">
              <Link
                href={taskLink(task.task_id, "reports")}
                className="block text-base font-medium after:absolute after:inset-0 after:rounded-[var(--radius-card)]"
              >
                <span className="tabular text-ink-muted">{taskCode(task.number)}</span> {task.title}
              </Link>
              <p className="mt-0.5 text-ink-muted">
                {task.crew_name ?? "Бригада недоступна"} · принята версия {task.report_version}
              </p>
              <p className="tabular mt-2">
                <span className="text-ink-muted">Отправлен</span> {formatMoment(task.submitted_at, now)}
                <span className="text-ink-muted"> · проверка </span>
                {formatSeconds(task.review_seconds)}
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                <Deadline label="Исходный срок" task={task} deadline={task.planned_end_original} now={now} />
                <Deadline label="Текущий срок" task={task} deadline={task.planned_end} now={now} />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

type AcceptedReportViewProps = {
  divisionName: string;
  initial: Snapshot<AcceptedReport>;
};

export function AcceptedReportView({ divisionName, initial }: AcceptedReportViewProps) {
  const days = initial.data.period.days;
  const loader = useCallback(() => refreshAcceptedReport(days), [days]);
  const { data, loadedAt, error, refreshing, refresh } = usePolling(loader, initial);
  const now = Date.parse(loadedAt);

  return (
    <>
      <Link
        href={`/overview?days=${days}`}
        className="-ml-1 inline-flex min-h-11 items-center gap-0.5 rounded px-1 text-sm text-ink-muted hover:text-ink hover:underline sm:min-h-8"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Обзор
      </Link>
      <PageHeader
        title="Принятые задания"
        description={`${divisionName} · отчёт принят ${periodLabel(data.period)}`}
        actions={<PeriodSwitch days={days} basePath="/overview/accepted" />}
        className="mt-1"
      />
      <RefreshStatus
        loadedAt={loadedAt}
        error={error}
        refreshing={refreshing}
        onRefresh={refresh}
        className="-mt-3 mb-4"
      />
      <Summary metrics={data.metrics} />
      {data.tasks.length ? (
        <AcceptedTable tasks={data.tasks} now={now} />
      ) : (
        <Card>
          <EmptyState
            title="За этот период принятых заданий нет"
            description="Здесь появятся задания, отчёт по которым принял диспетчер. Попробуйте выбрать период длиннее."
          />
        </Card>
      )}
      <p className="mt-4 text-sm text-ink-muted">
        Срок сравнивается со временем отправки принятой версии отчёта. Возвращённые версии и отменённые задания не
        учитываются.
      </p>
    </>
  );
}
