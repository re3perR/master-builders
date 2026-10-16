import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { taskLink } from "@/features/overview/links";
import type { TaskStatus } from "@/lib/database.types";
import { cn } from "@/lib/cn";
import { statusLabels, taskCode } from "@/lib/labels";
import { dayRange } from "@/lib/time";
import { intervalText } from "../interval";
import { hourLabel, hourWindow, placeInLanes } from "../timeline";
import type { CrewDay } from "../types";

const hour = 3_600_000;
const laneHeight = 32;

const barTones: Record<TaskStatus, string> = {
  Assigned: "border-status-assigned bg-status-assigned-soft text-status-assigned",
  Accepted: "border-status-accepted bg-status-accepted-soft text-status-accepted",
  InProgress: "border-status-progress bg-status-progress-soft text-status-progress",
  InReview: "border-status-review bg-status-review-soft text-status-review",
  Completed: "border-status-done bg-status-done-soft text-status-done",
  Cancelled: "border-status-cancelled bg-status-cancelled-soft text-status-cancelled",
};

type CrewTimelineProps = {
  groups: CrewDay[];
  date: string;
  today: string;
  now: number;
};

export function CrewTimeline({ groups, date, today, now }: CrewTimelineProps) {
  const range = dayRange(date);
  const dayStart = range.start.getTime();
  const reference = date === today ? today : null;
  const rows = groups.map((group) => ({ group, ...placeInLanes(group.tasks, dayStart, range.end.getTime()) }));
  const window = hourWindow(
    rows.flatMap((row) => row.placed),
    dayStart,
    range.end.getTime(),
  );
  const position = (moment: number) =>
    ((Math.min(Math.max(moment, window.start), window.end) - window.start) / (window.end - window.start)) * 100;
  const nowVisible = date === today && now >= window.start && now <= window.end;

  return (
    <Card aria-hidden className="mb-5 hidden overflow-hidden md:block">
      <div className="grid grid-cols-[10rem_minmax(0,1fr)] lg:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="bg-canvas" />
        <div className="bg-canvas px-5">
          <div className="relative h-8">
            {window.ticks.map((tick) => (
              <span
                key={tick}
                className="tabular absolute top-1.5 -translate-x-1/2 text-xs text-ink-muted"
                style={{ left: `${position(dayStart + tick * hour)}%` }}
              >
                {hourLabel(tick)}
              </span>
            ))}
          </div>
        </div>
        {rows.map(({ group, placed, lanes }) => (
          <div key={group.crew.id} className="contents">
            <div className="flex items-center border-t border-line px-4 py-2 text-sm font-medium">
              <span className="line-clamp-2">{group.crew.name}</span>
            </div>
            <div className="border-t border-line px-5">
              <div className="relative" style={{ height: lanes * laneHeight + 12 }}>
                {window.ticks.map((tick) => (
                  <span
                    key={tick}
                    className="absolute inset-y-0 w-px bg-line/70"
                    style={{ left: `${position(dayStart + tick * hour)}%` }}
                  />
                ))}
                {nowVisible ? (
                  <span className="absolute inset-y-0 w-0.5 bg-danger" style={{ left: `${position(now)}%` }} />
                ) : null}
                {placed.map(({ task, lane, start, end }) => {
                  const conflict = task.overlapping.length > 0;
                  const label = [
                    taskCode(task.number),
                    task.title,
                    intervalText(task.planned_start, task.planned_end, date, reference),
                    statusLabels[task.status],
                    conflict
                      ? `пересекается с ${task.overlapping.map((item) => taskCode(item.number)).join(", ")}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <Link
                      key={task.id}
                      href={taskLink(task.id)}
                      tabIndex={-1}
                      title={label}
                      className={cn(
                        "@container absolute flex h-7 items-center gap-1 overflow-hidden rounded-md border border-l-4 px-1.5 text-xs font-semibold whitespace-nowrap hover:brightness-95",
                        barTones[task.status],
                        Date.parse(task.planned_start) < window.start && "rounded-l-none border-l",
                        Date.parse(task.planned_end) > window.end && "rounded-r-none",
                        conflict && "outline-2 outline-warning",
                      )}
                      style={{
                        left: `${position(start)}%`,
                        width: `${position(end) - position(start)}%`,
                        top: 6 + lane * laneHeight,
                      }}
                    >
                      {conflict ? (
                        <AlertTriangle aria-hidden className="hidden size-3.5 shrink-0 @min-[4.5rem]:block" />
                      ) : null}
                      <span className="tabular hidden @min-[2.75rem]:inline">{taskCode(task.number)}</span>
                      <span className="hidden truncate font-normal text-ink @min-[6rem]:inline">{task.title}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
