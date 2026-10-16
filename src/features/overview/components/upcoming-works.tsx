import Link from "next/link";
import { ObstacleBadge, OverdueBadge, StatusBadge } from "@/components/app/task-badges";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DayInterval } from "@/features/schedule/components/day-interval";
import { overlapsDay } from "@/features/schedule/interval";
import { isOverdue, taskCode } from "@/lib/labels";
import { dayRange, formatWeekday, shiftDay } from "@/lib/time";
import type { ScheduleTask } from "../db-types";
import { scheduleLink, taskLink } from "../links";

const perDay = 6;

type UpcomingWorksProps = {
  tasks: ScheduleTask[];
  today: string;
  now: number;
  className?: string;
};

export function UpcomingWorks({ tasks, today, now, className }: UpcomingWorksProps) {
  const days = [
    { key: today, label: "Сегодня" },
    { key: shiftDay(today, 1), label: "Завтра" },
  ];

  return (
    <Card className={className}>
      <CardHeader className="items-center">
        <CardTitle>Ближайшие работы</CardTitle>
        <Link
          href={scheduleLink(today)}
          className="inline-flex min-h-11 items-center text-sm font-medium text-status-assigned hover:underline sm:min-h-8"
        >
          Расписание
        </Link>
      </CardHeader>
      {days.map((day) => {
        const items = tasks.filter((task) => overlapsDay(task, day.key));
        const shown = items.slice(0, perDay);
        const headingId = `upcoming-${day.key}`;
        return (
          <section key={day.key} aria-labelledby={headingId} className="border-t border-line first-of-type:border-t-0">
            <h3 id={headingId} className="flex items-baseline gap-2 px-4 pt-3 font-semibold">
              {day.label}
              <span className="text-sm font-normal text-ink-muted">{formatWeekday(dayRange(day.key).start)}</span>
            </h3>
            {shown.length ? (
              <ul className="pb-2">
                {shown.map((task) => (
                  <li key={task.id}>
                    <Link href={taskLink(task.id)} className="block px-4 py-2.5 hover:bg-canvas">
                      <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <span className="min-w-0 font-medium">
                          <span className="tabular text-ink-muted">{taskCode(task.number)}</span> {task.title}
                        </span>
                        <StatusBadge status={task.status} />
                      </span>
                      <span className="mt-0.5 block text-sm text-ink-muted">
                        <DayInterval
                          start={task.planned_start}
                          end={task.planned_end}
                          date={day.key}
                          today={today}
                          className="text-ink"
                        />
                        {" · "}
                        {[task.crew_name, task.site_name].filter(Boolean).join(" · ")}
                      </span>
                      {isOverdue(task, now) || task.obstacle_category ? (
                        <span className="mt-1 flex flex-wrap gap-1.5">
                          {isOverdue(task, now) ? <OverdueBadge /> : null}
                          {task.obstacle_category ? <ObstacleBadge category={task.obstacle_category} /> : null}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 pt-1 pb-4 text-sm text-ink-muted">Работ не запланировано.</p>
            )}
            {items.length > shown.length ? (
              <Link
                href={scheduleLink(day.key)}
                className="mx-4 mb-3 inline-flex min-h-11 items-center text-sm font-medium text-status-assigned hover:underline sm:min-h-8"
              >
                Ещё {items.length - shown.length} в расписании
              </Link>
            ) : null}
          </section>
        );
      })}
    </Card>
  );
}
