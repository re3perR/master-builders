import Link from "next/link";
import { StatusBadge } from "@/components/app/task-badges";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { statusLabels, statusOrder } from "@/lib/labels";
import type { DivisionCounters } from "../db-types";
import { statusListLink } from "../links";

export function StatusDistribution({ counters, className }: { counters: DivisionCounters; className?: string }) {
  const largest = Math.max(1, ...statusOrder.map((status) => counters.statuses[status]));

  return (
    <Card className={className}>
      <CardHeader className="items-center">
        <CardTitle>Распределение по статусам</CardTitle>
        <Link
          href="/tasks"
          className="inline-flex min-h-11 items-center text-sm font-medium text-status-assigned hover:underline sm:min-h-8"
        >
          Всего заданий: {counters.total}
        </Link>
      </CardHeader>
      <ul className="py-1">
        {statusOrder.map((status) => {
          const count = counters.statuses[status];
          return (
            <li key={status}>
              <Link
                href={statusListLink(status)}
                aria-label={`${statusLabels[status]}: ${count}. Открыть список`}
                className="grid min-h-11 grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3 px-4 py-1.5 hover:bg-canvas"
              >
                <StatusBadge status={status} className="justify-self-start" />
                <span aria-hidden className="h-2">
                  {count > 0 ? (
                    <span
                      className="block h-2 min-w-0.5 rounded-r bg-field"
                      style={{ width: `${(count / largest) * 100}%` }}
                    />
                  ) : null}
                </span>
                <span className="tabular text-right font-semibold">{count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
