"use client";

import { AlertOctagon, Archive, TimerOff } from "lucide-react";
import Link from "next/link";
import { RefreshStatus } from "@/components/app/refresh-status";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { usePolling } from "@/hooks/use-polling";
import type { Snapshot } from "@/lib/snapshot";
import { loadCrews } from "../actions";
import { divisionWithoutCrews } from "../crew-notices";
import type { CrewSummary } from "../db-types";
import { plural } from "../plural";
import type { CrewList } from "../types";

export function CrewsView({ initial }: { initial: Snapshot<CrewList> }) {
  const { data, loadedAt, error, refreshing, refresh } = usePolling(() => loadCrews(), initial);
  const { crews } = data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-ink-muted">{plural(crews.length, "бригада", "бригады", "бригад")}</p>
        <RefreshStatus loadedAt={loadedAt} error={error} refreshing={refreshing} onRefresh={refresh} />
      </div>
      {crews.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {crews.map((crew) => (
            <li key={crew.id}>
              <CrewTile crew={crew} />
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <EmptyState {...divisionWithoutCrews} />
        </Card>
      )}
    </div>
  );
}

function CrewTile({ crew }: { crew: CrewSummary }) {
  const counts = [
    { label: "Назначено", value: crew.assigned },
    { label: "Принято", value: crew.accepted },
    { label: "В работе", value: crew.in_progress },
    { label: "На проверке", value: crew.in_review },
  ];

  return (
    <article className="@container relative flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-4 hover:border-field">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold">
          <Link
            href={`/crews/${crew.id}`}
            className="after:absolute after:inset-0 after:rounded-[var(--radius-card)] hover:underline"
          >
            {crew.name}
          </Link>
        </h2>
        {crew.archived_at ? (
          <Badge>
            <Archive aria-hidden className="size-3.5" />В архиве
          </Badge>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-ink-muted">Бригадир: {crew.foreman_name ?? "не назначен"}</p>
      <p className="text-sm text-ink-muted">
        Состав: {crew.members ? plural(crew.members, "человек", "человека", "человек") : "не указан"}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-2 gap-y-3 border-t border-line pt-3 @min-[19rem]:grid-cols-4">
        {counts.map((item) => (
          <div key={item.label} className="flex flex-col-reverse">
            <dt className="text-xs leading-tight text-ink-muted">{item.label}</dt>
            <dd className="tabular text-lg font-semibold">{item.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        {crew.overdue ? (
          <Badge tone="danger">
            <TimerOff aria-hidden className="size-3.5" />
            Просрочено: {crew.overdue}
          </Badge>
        ) : null}
        {crew.open_obstacles ? (
          <Badge tone="warning">
            <AlertOctagon aria-hidden className="size-3.5" />
            Препятствия: {crew.open_obstacles}
          </Badge>
        ) : null}
        {!crew.overdue && !crew.open_obstacles ? (
          <span className="text-sm text-ink-muted">Просрочек и препятствий нет</span>
        ) : null}
      </div>
    </article>
  );
}
