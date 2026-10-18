"use client";

import { Archive, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RefreshStatus } from "@/components/app/refresh-status";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { usePolling } from "@/hooks/use-polling";
import type { UserRole } from "@/lib/database.types";
import { countLabel } from "@/lib/plural";
import type { Snapshot } from "@/lib/snapshot";
import { loadCrewCard } from "../actions";
import type { CrewCard } from "../types";
import { CrewFormDialog } from "./crew-form-dialog";
import { TaskList, TaskSection } from "./task-list";

export function CrewView({ initial, role }: { initial: Snapshot<CrewCard>; role: UserRole }) {
  const crewId = initial.data.crew.id;
  const { data, loadedAt, error, refreshing, refresh } = usePolling(() => loadCrewCard(crewId), initial);
  const [notice, setNotice] = useState<string | null>(null);
  const { crew, foremanName, members, tasks } = data;
  const office = role !== "foreman";
  const canManage = role === "dispatcher";
  const total = tasks.activeTotal + tasks.closedTotal;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {office ? (
            <Link
              href="/crews"
              className="-ml-1 inline-flex min-h-11 items-center gap-0.5 rounded px-1 text-sm text-ink-muted hover:text-ink hover:underline sm:min-h-8"
            >
              <ChevronLeft aria-hidden className="size-4" />
              Бригады
            </Link>
          ) : (
            <p className="text-sm text-ink-muted">Ваша бригада</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight break-words">{crew.name}</h1>
            {crew.archived_at ? (
              <Badge>
                <Archive aria-hidden className="size-3.5" />В архиве
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-ink-muted">
            Бригадир: {foremanName ?? "не назначен"} ·{" "}
            {members.length ? countLabel(members.length, ["человек", "человека", "человек"]) : "состав не указан"}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          {canManage && !crew.archived_at ? (
            <CrewFormDialog
              crew={crew}
              members={members}
              onSaved={(changed) =>
                setNotice(changed ? "Изменения сохранены." : "Изменений нет: данные совпадают с сохранёнными.")
              }
            />
          ) : null}
          <RefreshStatus loadedAt={loadedAt} error={error} refreshing={refreshing} onRefresh={refresh} />
        </div>
      </header>

      {error?.kind === "not_found" ? (
        <Alert variant="warning" title="Бригада больше недоступна">
          У вас больше нет доступа к этой бригаде.
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

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-5 lg:col-start-2 lg:row-start-1">
          <Card>
            <CardHeader>
              <CardTitle>Бригадир</CardTitle>
            </CardHeader>
            <CardBody className="text-[15px]">
              <p className="font-medium">{foremanName ?? "Не назначен"}</p>
              {canManage ? (
                <p className="mt-1 text-sm text-ink-muted">
                  Бригадира назначают при настройке системы, в интерфейсе он не меняется.
                </p>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                Состав <span className="tabular font-normal text-ink-muted">· {members.length}</span>
              </CardTitle>
            </CardHeader>
            {members.length ? (
              <ol className="divide-y divide-line text-[15px]">
                {members.map((member, index) => (
                  <li key={member.id} className="flex gap-3 px-4 py-2.5 sm:px-5">
                    <span className="tabular w-5 shrink-0 text-right text-ink-muted">{index + 1}.</span>
                    <span className="min-w-0 break-words">{member.name}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-4 py-4 text-sm text-ink-muted sm:px-5">
                {canManage
                  ? "Состав не указан. Добавьте участников через «Изменить»."
                  : "Состав не указан, его заполняет диспетчер."}
              </p>
            )}
          </Card>
        </div>

        <Card className="lg:col-start-1 lg:row-start-1">
          <CardHeader className="items-center">
            <CardTitle>Задания бригады</CardTitle>
            {office && total ? (
              <Link
                href={`/tasks?crew=${crew.id}`}
                className="inline-flex min-h-11 items-center text-sm font-medium text-status-assigned hover:underline sm:min-h-0"
              >
                <span>
                  Все задания<span className="max-sm:sr-only"> бригады</span>
                </span>
              </Link>
            ) : null}
          </CardHeader>
          {total === 0 ? (
            <EmptyState
              title="У бригады пока нет заданий"
              description={
                office ? "Назначенные бригаде задания появятся здесь." : "Задания вашей бригаде назначает диспетчер."
              }
            />
          ) : (
            <>
              <TaskSection
                id="crew-active-tasks"
                title="Активные"
                total={tasks.activeTotal}
                empty="Активных заданий нет."
                more={
                  tasks.activeTotal > tasks.active.length
                    ? `Показаны ближайшие ${tasks.active.length} по сроку окончания.`
                    : null
                }
              >
                <TaskList tasks={tasks.active} detail="site" />
              </TaskSection>
              <TaskSection
                id="crew-recent-tasks"
                title="Недавно закрытые"
                total={tasks.closedTotal}
                empty="Завершённых и отменённых заданий пока нет."
                more={tasks.closedTotal > tasks.closed.length ? `Показаны последние ${tasks.closed.length}.` : null}
              >
                <TaskList tasks={tasks.closed} detail="site" />
              </TaskSection>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
