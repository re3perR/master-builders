"use client";

import { Archive, ChevronLeft, MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RefreshStatus } from "@/components/app/refresh-status";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { usePolling } from "@/hooks/use-polling";
import type { Site, UserRole } from "@/lib/database.types";
import type { Snapshot } from "@/lib/snapshot";
import { loadSiteCard } from "../actions";
import type { SiteCard, TaskGroups } from "../types";
import { SiteFormDialog } from "./site-form-dialog";
import { SiteManage } from "./site-manage";
import { TaskList, TaskSection } from "./task-list";

export function SiteView({ initial, role }: { initial: Snapshot<SiteCard>; role: UserRole }) {
  const siteId = initial.data.site.id;
  const { data, loadedAt, error, refreshing, refresh } = usePolling(() => loadSiteCard(siteId), initial);
  const [notice, setNotice] = useState<string | null>(null);
  const { site, tasks } = data;
  const office = role !== "foreman";
  const canManage = role === "dispatcher";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={office ? "/sites" : "/my"}
            className="-ml-1 inline-flex min-h-11 items-center gap-0.5 rounded px-1 text-sm text-ink-muted hover:text-ink hover:underline sm:min-h-8"
          >
            <ChevronLeft aria-hidden className="size-4" />
            {office ? "Объекты" : "Мои задания"}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight break-words">{site.name}</h1>
            {site.archived_at ? (
              <Badge>
                <Archive aria-hidden className="size-3.5" />В архиве
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 flex items-start gap-1.5 text-ink-muted">
            <MapPin aria-hidden className="mt-1 size-4 shrink-0" />
            <span>{site.address}</span>
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          {canManage && !site.archived_at ? (
            <SiteFormDialog
              site={site}
              onSaved={(changed) =>
                setNotice(changed ? "Изменения сохранены." : "Изменений нет: данные совпадают с сохранёнными.")
              }
            />
          ) : null}
          <RefreshStatus loadedAt={loadedAt} error={error} refreshing={refreshing} onRefresh={refresh} />
        </div>
      </header>

      {error?.kind === "not_found" ? (
        <Alert variant="warning" title="Объект больше недоступен">
          Его удалили или у вас больше нет к нему доступа.{" "}
          <Link href={office ? "/sites" : "/my"} className="underline">
            {office ? "К списку объектов" : "К моим заданиям"}
          </Link>
        </Alert>
      ) : null}
      {notice ? (
        <Alert
          variant="success"
          action={
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="-my-1 inline-flex min-h-9 items-center rounded px-2 text-sm font-medium underline-offset-2 hover:underline"
            >
              Скрыть
            </button>
          }
        >
          {notice}
        </Alert>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr]">
        <div className="lg:col-start-2 lg:row-start-1">
          <SiteDetails site={site} />
        </div>
        <SiteTasks site={site} tasks={tasks} office={office} canCreate={canManage && !site.archived_at} />
        {canManage ? (
          <div className="lg:col-start-2 lg:row-start-2">
            <SiteManage
              site={site}
              activeCount={tasks.activeTotal}
              totalCount={tasks.activeTotal + tasks.closedTotal}
              onDone={setNotice}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SiteDetails({ site }: { site: Site }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Доступ и контакт</CardTitle>
      </CardHeader>
      <CardBody>
        <dl className="flex flex-col gap-4 text-[15px]">
          <div>
            <dt className="text-sm text-ink-muted">Примечание о доступе</dt>
            <dd className="mt-0.5 break-words whitespace-pre-line">
              {site.access_note ?? <span className="text-ink-muted">Не указано</span>}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">Рабочий контакт</dt>
            <dd className="mt-0.5 break-words">{site.contact ?? <span className="text-ink-muted">Не указан</span>}</dd>
          </div>
        </dl>
      </CardBody>
    </Card>
  );
}

type SiteTasksProps = {
  site: Site;
  tasks: TaskGroups;
  office: boolean;
  canCreate: boolean;
};

function SiteTasks({ site, tasks, office, canCreate }: SiteTasksProps) {
  const total = tasks.activeTotal + tasks.closedTotal;

  return (
    <Card className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
      <CardHeader className="items-center">
        <CardTitle>Задания на объекте</CardTitle>
        {office && total ? (
          <Link
            href={`/tasks?site=${site.id}`}
            className="inline-flex min-h-11 items-center text-sm font-medium text-status-assigned hover:underline sm:min-h-0"
          >
            <span>
              Все задания<span className="max-sm:sr-only"> объекта</span>
            </span>
          </Link>
        ) : null}
      </CardHeader>
      {!office ? (
        <p className="border-b border-line px-4 py-2.5 text-sm text-ink-muted sm:px-5">
          Показаны только задания вашей бригады.
        </p>
      ) : null}
      {total === 0 ? (
        <EmptyState
          title="На объекте ещё не было заданий"
          description={
            canCreate
              ? "Создайте задание и выберите в нём этот объект."
              : site.archived_at
                ? "Объект в архиве: для новых заданий его нужно сначала восстановить."
                : "Задания на объект назначает диспетчер."
          }
          action={
            canCreate ? (
              <Link href={`/tasks/new?site=${site.id}`} className={buttonVariants({ variant: "secondary" })}>
                Создать задание
              </Link>
            ) : null
          }
        />
      ) : (
        <>
          <TaskSection
            id="site-active-tasks"
            title="Активные"
            total={tasks.activeTotal}
            empty="Активных заданий нет."
            more={
              tasks.activeTotal > tasks.active.length
                ? `Показаны ближайшие ${tasks.active.length} по сроку окончания.`
                : null
            }
          >
            <TaskList tasks={tasks.active} detail="crew" />
          </TaskSection>
          <TaskSection
            id="site-closed-tasks"
            title="Завершённые и отменённые"
            total={tasks.closedTotal}
            empty="Завершённых и отменённых заданий нет."
            more={tasks.closedTotal > tasks.closed.length ? `Показаны последние ${tasks.closed.length}.` : null}
          >
            <TaskList tasks={tasks.closed} detail="crew" />
          </TaskSection>
        </>
      )}
    </Card>
  );
}
