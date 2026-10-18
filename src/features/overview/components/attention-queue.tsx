import { AlertOctagon, Eye, TimerOff } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ObstacleBadge, StatusBadge } from "@/components/app/task-badges";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { taskCode } from "@/lib/labels";
import { formatDuration } from "@/lib/time";
import type { AttentionQueue as Queue, DivisionCounters } from "../db-types";
import { formatMoment } from "../format";
import { taskLink, taskListLinks } from "../links";

type SectionProps = {
  id: string;
  columns: boolean;
  title: string;
  count: number;
  shown: number;
  href: string;
  empty: string;
  Icon: typeof TimerOff;
  tone: string;
  children: ReactNode;
};

function Section({ id, columns, title, count, shown, href, empty, Icon, tone, children }: SectionProps) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "border-t border-line first:border-t-0",
        columns && "lg:border-t-0 lg:border-l lg:first:border-l-0",
      )}
    >
      <h3 id={id} className="flex items-center gap-2 px-4 pt-3 font-semibold">
        <Icon aria-hidden className={cn("size-4 shrink-0", count > 0 ? tone : "text-ink-muted")} />
        {title}
        <span className="tabular rounded bg-canvas px-1.5 text-sm font-medium text-ink-muted">{count}</span>
      </h3>
      {shown > 0 ? (
        <ul className="py-1">{children}</ul>
      ) : (
        <p className="px-4 pt-1 pb-4 text-sm text-ink-muted">{empty}</p>
      )}
      {count > shown ? (
        <Link
          href={href}
          className="mx-4 mb-2 inline-flex min-h-11 items-center text-sm font-medium text-status-assigned hover:underline sm:min-h-8"
        >
          Показать все в списке заданий: {count}
        </Link>
      ) : null}
    </section>
  );
}

type RowProps = {
  href: string;
  task: { number: number; title: string; crew_name: string | null; site_name: string | null };
  aside?: ReactNode;
  children: ReactNode;
};

function Row({ href, task, aside, children }: RowProps) {
  return (
    <li>
      <Link href={href} className="block px-4 py-2.5 hover:bg-canvas">
        <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <span className="min-w-0 font-medium">
            <span className="tabular text-ink-muted">{taskCode(task.number)}</span> {task.title}
          </span>
          {aside}
        </span>
        <span className="mt-0.5 block text-sm text-ink-muted">
          {[task.crew_name, task.site_name].filter(Boolean).join(" · ")}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">{children}</span>
      </Link>
    </li>
  );
}

type AttentionQueueProps = {
  columns?: boolean;
  queue: Queue;
  counters: DivisionCounters;
  now: number;
  className?: string;
};

export function AttentionQueue({ columns = false, queue, counters, now, className }: AttentionQueueProps) {
  const at = new Date(now);

  return (
    <Card className={className}>
      <CardHeader className="flex-col gap-0.5">
        <CardTitle>Требуют внимания</CardTitle>
        <p className="text-sm text-ink-muted">Одно задание может попасть сразу в несколько разделов.</p>
      </CardHeader>
      <div className={cn(columns && "lg:grid lg:grid-cols-3")}>
        <Section
          id="queue-overdue"
          columns={columns}
          title="Просрочено исполнение"
          count={counters.overdue}
          shown={queue.overdue.length}
          href={taskListLinks.overdue}
          empty="Просроченных заданий нет."
          Icon={TimerOff}
          tone="text-danger"
        >
          {queue.overdue.map((task) => (
            <Row key={task.id} href={taskLink(task.id)} task={task} aside={<StatusBadge status={task.status} />}>
              <span className="font-medium text-danger">Просрочено на {formatDuration(task.planned_end, at)}</span>
              <span className="tabular text-ink-muted">срок {formatMoment(task.planned_end, now)}</span>
              {task.obstacle_category ? <ObstacleBadge category={task.obstacle_category} /> : null}
            </Row>
          ))}
        </Section>

        <Section
          id="queue-obstacles"
          columns={columns}
          title="Открытые препятствия"
          count={counters.obstacles}
          shown={queue.obstacles.length}
          href={taskListLinks.obstacles}
          empty="Открытых препятствий нет."
          Icon={AlertOctagon}
          tone="text-warning"
        >
          {queue.obstacles.map((task) => (
            <Row key={task.id} href={taskLink(task.id)} task={task}>
              <ObstacleBadge category={task.category} />
              <span className="font-medium text-warning">Длится {formatDuration(task.opened_at, at)}</span>
              <span className="tabular text-ink-muted">с {formatMoment(task.opened_at, now)}</span>
              <span className="line-clamp-2 w-full">{task.reason}</span>
            </Row>
          ))}
        </Section>

        <Section
          id="queue-review"
          columns={columns}
          title="Ждут проверки"
          count={counters.review}
          shown={queue.review.length}
          href={taskListLinks.review}
          empty="Отчётов, ожидающих решения, нет."
          Icon={Eye}
          tone="text-status-review"
        >
          {queue.review.map((task) => (
            <Row key={task.id} href={taskLink(task.id, "reports")} task={task}>
              <span className="font-medium text-status-review">Ждёт {formatDuration(task.submitted_at, at)}</span>
              <span className="tabular text-ink-muted">
                отчёт, версия {task.report_version}, отправлен {formatMoment(task.submitted_at, now)}
              </span>
              {Date.parse(task.planned_end) < now ? (
                <span className="tabular w-full text-ink-muted">
                  Плановый срок окончания прошёл {formatMoment(task.planned_end, now)}
                </span>
              ) : null}
            </Row>
          ))}
        </Section>
      </div>
    </Card>
  );
}
