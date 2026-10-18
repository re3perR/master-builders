"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { RefreshStatus } from "@/components/app/refresh-status";
import { buttonVariants } from "@/components/ui/button";
import { usePolling } from "@/hooks/use-polling";
import type { Snapshot } from "@/lib/snapshot";
import { refreshDispatcherOverview } from "../actions";
import { newTaskLink } from "../links";
import type { DispatcherOverviewData } from "../types";
import { AttentionQueue } from "./attention-queue";
import { CounterTiles } from "./counter-tiles";
import { UpcomingWorks } from "./upcoming-works";

type DispatcherOverviewProps = {
  divisionName: string;
  initial: Snapshot<DispatcherOverviewData>;
};

export function DispatcherOverview({ divisionName, initial }: DispatcherOverviewProps) {
  const { data, loadedAt, error, refreshing, refresh } = usePolling(refreshDispatcherOverview, initial);
  const now = Date.parse(loadedAt);

  return (
    <>
      <PageHeader
        title="Обзор"
        description={divisionName}
        actions={
          <Link href={newTaskLink()} className={buttonVariants()}>
            <Plus aria-hidden className="size-4" />
            Создать задание
          </Link>
        }
      />
      <RefreshStatus
        loadedAt={loadedAt}
        error={error}
        refreshing={refreshing}
        onRefresh={refresh}
        className="-mt-3 mb-4"
      />
      <CounterTiles counters={data.counters} />
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-5">
        <AttentionQueue queue={data.attention} counters={data.counters} now={now} className="lg:col-span-3" />
        <UpcomingWorks tasks={data.upcoming} today={data.today} now={now} className="lg:col-span-2" />
      </div>
    </>
  );
}
