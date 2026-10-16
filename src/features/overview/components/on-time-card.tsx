import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import type { DivisionMetrics } from "../db-types";
import { formatSeconds, formatShare } from "../format";
import { periodLabel, type Period } from "../period";
import { PeriodSwitch } from "./period-switch";

function Share({ label, hint, value, total }: { label: string; hint: string; value: number; total: number }) {
  return (
    <div className="py-3 first:pt-0">
      <dt className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">{label}</span>
        <span className="text-sm text-ink-muted">{hint}</span>
      </dt>
      <dd className="mt-1">
        {total > 0 ? (
          <>
            <span className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{formatShare(value, total)}</span>
              <span className="text-sm text-ink-muted">
                {value} из {total}
              </span>
            </span>
            <span aria-hidden className="mt-2 block h-2 rounded-full bg-line">
              <span className="block h-2 rounded-full bg-ink-muted" style={{ width: `${(value / total) * 100}%` }} />
            </span>
          </>
        ) : (
          <span className="text-ink-muted">Нет данных</span>
        )}
      </dd>
    </div>
  );
}

type OnTimeCardProps = {
  metrics: DivisionMetrics;
  period: Period;
  className?: string;
};

export function OnTimeCard({ metrics, period, className }: OnTimeCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex-wrap items-center">
        <div className="min-w-0">
          <CardTitle>Сдача в срок</CardTitle>
          <p className="text-sm text-ink-muted">Задания, принятые {periodLabel(period)}</p>
        </div>
        <PeriodSwitch days={period.days} basePath="/overview" />
      </CardHeader>
      <CardBody>
        <dl className="divide-y divide-line">
          <Share
            label="В исходный срок"
            hint="к первоначальному окончанию"
            value={metrics.on_time_original}
            total={metrics.accepted}
          />
          <Share
            label="В текущий срок"
            hint="с учётом переносов"
            value={metrics.on_time_current}
            total={metrics.accepted}
          />
          <div className="py-3">
            <dt className="font-medium">Среднее время проверки</dt>
            <dd className="mt-1">
              {metrics.avg_review_seconds === null ? (
                <span className="text-ink-muted">Нет данных</span>
              ) : (
                <span className="text-2xl font-semibold">{formatSeconds(metrics.avg_review_seconds)}</span>
              )}
            </dd>
          </div>
        </dl>
        <p className="mt-1 text-sm text-ink-muted">
          Сравнивается время отправки принятой версии отчёта со сроком окончания. Возвращённые версии и отменённые
          задания не учитываются.
        </p>
        <Link
          href={`/overview/accepted?days=${period.days}`}
          className={buttonVariants({ variant: "secondary", className: "mt-4" })}
        >
          Принятые задания: {metrics.accepted}
        </Link>
      </CardBody>
    </Card>
  );
}
