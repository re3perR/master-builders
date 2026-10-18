"use client";

import { useCallback } from "react";
import { PageHeader } from "@/components/app/page-header";
import { RefreshStatus } from "@/components/app/refresh-status";
import { usePolling } from "@/hooks/use-polling";
import type { Snapshot } from "@/lib/snapshot";
import { refreshManagerOverview } from "../actions";
import type { ManagerOverviewData } from "../types";
import { AttentionQueue } from "./attention-queue";
import { CounterTiles } from "./counter-tiles";
import { OnTimeCard } from "./on-time-card";
import { StatusDistribution } from "./status-distribution";

type ManagerOverviewProps = {
  divisionName: string;
  initial: Snapshot<ManagerOverviewData>;
};

export function ManagerOverview({ divisionName, initial }: ManagerOverviewProps) {
  const days = initial.data.period.days;
  const loader = useCallback(() => refreshManagerOverview(days), [days]);
  const { data, loadedAt, error, refreshing, refresh } = usePolling(loader, initial);
  const now = Date.parse(loadedAt);

  return (
    <>
      <PageHeader title="Обзор" description={`${divisionName} · только просмотр`} />
      <RefreshStatus
        loadedAt={loadedAt}
        error={error}
        refreshing={refreshing}
        onRefresh={refresh}
        className="-mt-3 mb-4"
      />
      <CounterTiles counters={data.counters} />
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <StatusDistribution counters={data.counters} />
        <OnTimeCard metrics={data.metrics} period={data.period} />
      </div>
      <AttentionQueue columns queue={data.attention} counters={data.counters} now={now} className="mt-6" />
    </>
  );
}
