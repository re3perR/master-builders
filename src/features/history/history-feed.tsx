"use client";

import { History } from "lucide-react";
import { RefreshStatus } from "@/components/app/refresh-status";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { usePolling } from "@/hooks/use-polling";
import type { Snapshot } from "@/lib/snapshot";
import { dayKey, formatDate, timeZoneLabel } from "@/lib/time";
import { loadHistory } from "./actions";
import { EventItem, openedObstacles, type HistoryContext } from "./event-view";
import type { HistoryEvent } from "./types";

type HistoryFeedProps = {
  taskId: string;
  initial: Snapshot<HistoryEvent[]>;
  context: Omit<HistoryContext, "taskId" | "obstacleOpenedAt">;
};

function byDay(events: HistoryEvent[]) {
  const days: { key: string; events: HistoryEvent[] }[] = [];
  for (const event of events) {
    const key = dayKey(event.createdAt);
    const last = days.at(-1);
    if (last?.key === key) last.events.push(event);
    else days.push({ key, events: [event] });
  }
  return days;
}

export function HistoryFeed({ taskId, initial, context }: HistoryFeedProps) {
  const { data: events, loadedAt, error, refreshing, refresh } = usePolling(() => loadHistory(taskId), initial);
  const full: HistoryContext = { ...context, taskId, obstacleOpenedAt: openedObstacles(events) };

  return (
    <Card>
      <CardHeader className="flex-wrap items-center">
        <div>
          <CardTitle>
            История изменений <span className="tabular font-normal text-ink-muted">· {events.length}</span>
          </CardTitle>
          <p className="text-sm text-ink-muted">Время указано в поясе компании: {timeZoneLabel()}</p>
        </div>
        <RefreshStatus loadedAt={loadedAt} error={error} refreshing={refreshing} onRefresh={refresh} />
      </CardHeader>

      {events.length ? (
        <div className="divide-y divide-line">
          {byDay(events).map((day) => (
            <section key={day.key} aria-labelledby={`history-${day.key}`}>
              <h3
                id={`history-${day.key}`}
                className="border-b border-line bg-canvas px-4 py-1.5 text-sm font-medium text-ink-muted sm:px-5"
              >
                {formatDate(day.events[0].createdAt)}
              </h3>
              <ol className="divide-y divide-line">
                {day.events.map((event) => (
                  <EventItem key={event.id} event={event} context={full} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<History className="size-6" aria-hidden />}
          title="История пуста"
          description="События появятся после первых действий с заданием."
        />
      )}
    </Card>
  );
}
