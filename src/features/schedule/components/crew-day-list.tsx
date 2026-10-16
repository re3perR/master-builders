import { AlertTriangle, Plus } from "lucide-react";
import Link from "next/link";
import { ObstacleBadge, OverdueBadge, StatusBadge } from "@/components/app/task-badges";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ScheduleTask } from "@/features/overview/db-types";
import { plural } from "@/features/overview/format";
import { newTaskLink, taskLink } from "@/features/overview/links";
import { cn } from "@/lib/cn";
import { isOverdue, taskCode } from "@/lib/labels";
import { intervalText } from "../interval";
import type { CrewDay } from "../types";
import { DayInterval } from "./day-interval";

type CrewDayListProps = {
  group: CrewDay;
  date: string;
  today: string;
  now: number;
  canCreate: boolean;
};

function conflictCount(tasks: ScheduleTask[]) {
  const pairs = new Set<string>();
  for (const task of tasks) {
    for (const other of task.overlapping) pairs.add([task.id, other.id].sort().join(":"));
  }
  return pairs.size;
}

export function CrewDayList({ group, date, today, now, canCreate }: CrewDayListProps) {
  const { crew, tasks } = group;
  const conflicts = conflictCount(tasks);
  const reference = date === today ? today : null;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{crew.name}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            <span>
              {tasks.length
                ? `${tasks.length} ${plural(tasks.length, "задание", "задания", "заданий")}`
                : "Нет заданий"}
            </span>
            {crew.archived ? <Badge>В архиве</Badge> : null}
            {conflicts ? (
              <Badge tone="warning">
                <AlertTriangle aria-hidden className="size-3.5" />
                Пересечения: {conflicts}
              </Badge>
            ) : null}
          </p>
        </div>
        {canCreate && !crew.archived ? (
          <Link
            href={newTaskLink({ crew: crew.id, date })}
            aria-label={`Создать задание: ${crew.name}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            <Plus aria-hidden className="size-4" />
            Задание
          </Link>
        ) : null}
      </div>
      {tasks.length ? (
        <ul className="divide-y divide-line">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} date={date} reference={reference} now={now} />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-sm text-ink-muted">Заданий на этот день нет.</p>
      )}
    </Card>
  );
}

type TaskRowProps = {
  task: ScheduleTask;
  date: string;
  reference: string | null;
  now: number;
};

function TaskRow({ task, date, reference, now }: TaskRowProps) {
  const conflict = task.overlapping.length > 0;
  const overdue = isOverdue(task, now);

  return (
    <li
      className={cn(
        "relative",
        conflict && "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-warning",
      )}
    >
      <Link
        href={taskLink(task.id)}
        className="grid gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-canvas md:grid-cols-[11rem_minmax(0,1fr)_auto] md:items-start"
      >
        <DayInterval start={task.planned_start} end={task.planned_end} date={date} today={reference} />
        <span className="min-w-0">
          <span className="block font-medium">
            <span className="tabular text-ink-muted">{taskCode(task.number)}</span> {task.title}
          </span>
          {task.site_name ? <span className="block text-sm text-ink-muted">{task.site_name}</span> : null}
        </span>
        <span className="flex flex-wrap gap-1.5 md:max-w-64 md:justify-end">
          <StatusBadge status={task.status} />
          {overdue ? <OverdueBadge /> : null}
          {task.obstacle_category ? <ObstacleBadge category={task.obstacle_category} /> : null}
        </span>
      </Link>
      {conflict ? (
        <div className="flex flex-wrap items-center gap-x-3 border-t border-line bg-warning-soft px-4 py-1.5 text-sm text-warning md:pl-52">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <AlertTriangle aria-hidden className="size-4" />
            Пересекается с
          </span>
          {task.overlapping.map((other) => (
            <Link
              key={other.id}
              href={taskLink(other.id)}
              className="tabular inline-flex min-h-11 items-center underline underline-offset-2 hover:no-underline md:min-h-8"
            >
              {taskCode(other.number)} · {intervalText(other.planned_start, other.planned_end, date, reference)}
            </Link>
          ))}
        </div>
      ) : null}
    </li>
  );
}
