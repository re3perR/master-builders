import Link from "next/link";
import type { ReactNode } from "react";
import { ObstacleBadge, OverdueBadge, PriorityBadge, StatusBadge } from "@/components/app/task-badges";
import { taskCode } from "@/lib/labels";
import { formatInterval } from "@/lib/time";
import type { TaskItem } from "../types";

export function TaskList({ tasks, detail }: { tasks: TaskItem[]; detail: "site" | "crew" }) {
  return (
    <ul className="divide-y divide-line">
      {tasks.map((task) => {
        const owner = detail === "site" ? task.site_name : task.crew_name;
        return (
          <li key={task.id}>
            <Link href={`/tasks/${task.id}`} className="block px-4 py-3 -outline-offset-2 hover:bg-canvas sm:px-5">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="tabular mr-0.5 text-sm font-medium text-ink-muted">{taskCode(task.number)}</span>
                <StatusBadge status={task.status} />
                {task.priority === "high" ? <PriorityBadge priority="high" /> : null}
                {task.overdue ? <OverdueBadge /> : null}
                {task.obstacle ? <ObstacleBadge category={task.obstacle} /> : null}
              </span>
              <span className="mt-1 block font-medium">{task.title}</span>
              <span className="tabular mt-0.5 block text-sm text-ink-muted">
                {owner ? `${owner} · ` : null}
                {formatInterval(task.planned_start, task.planned_end)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

type TaskSectionProps = {
  id: string;
  title: string;
  total: number;
  empty: string;
  more: string | null;
  children: ReactNode;
};

export function TaskSection({ id, title, total, empty, more, children }: TaskSectionProps) {
  return (
    <section aria-labelledby={id} className="border-b border-line last:border-b-0">
      <h3 id={id} className="tabular bg-canvas px-4 py-2 text-sm font-medium text-ink-muted sm:px-5">
        {title} · {total}
      </h3>
      {total ? children : <p className="px-4 py-3 text-sm text-ink-muted sm:px-5">{empty}</p>}
      {more ? <p className="border-t border-line px-4 py-2.5 text-sm text-ink-muted sm:px-5">{more}</p> : null}
    </section>
  );
}
