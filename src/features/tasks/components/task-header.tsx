import Link from "next/link";
import { ObstacleBadge, OverdueBadge, PriorityBadge, StatusBadge } from "@/components/app/task-badges";
import type { Viewer } from "@/lib/auth";
import { isOverdue, taskCode } from "@/lib/labels";
import { formatInterval } from "@/lib/time";
import type { TaskCard } from "../types";

export function TaskHeader({ card }: { card: TaskCard; viewer: Viewer }) {
  return (
    <div className="mb-4">
      <Link href="/tasks" className="text-sm text-ink-muted hover:underline">
        Задания
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="tabular text-sm font-medium text-ink-muted">{taskCode(card.number)}</span>
        <StatusBadge status={card.status} />
        <PriorityBadge priority={card.priority} />
        {isOverdue(card) ? <OverdueBadge /> : null}
        {card.open_obstacle ? <ObstacleBadge category={card.open_obstacle.category} /> : null}
      </div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{card.title}</h1>
      <p className="mt-1 text-ink-muted">
        {card.site.name} · {card.address_snapshot}
      </p>
      <p className="tabular mt-1 text-ink-muted">
        {card.crew.name} · {formatInterval(card.planned_start, card.planned_end)}
      </p>
    </div>
  );
}
