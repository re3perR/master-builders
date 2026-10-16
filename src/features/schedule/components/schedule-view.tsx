"use client";

import { CalendarX2, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { PageHeader } from "@/components/app/page-header";
import { RefreshStatus } from "@/components/app/refresh-status";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { newTaskLink, scheduleLink } from "@/features/overview/links";
import { usePolling } from "@/hooks/use-polling";
import type { UserRole } from "@/lib/database.types";
import type { Snapshot } from "@/lib/snapshot";
import { dayKey, dayRange, formatWeekday, shiftDay } from "@/lib/time";
import { refreshSchedule } from "../actions";
import { groupByCrew, type CrewDay, type ScheduleData } from "../types";
import { CrewDayList } from "./crew-day-list";
import { CrewTimeline } from "./crew-timeline";
import { DayPicker } from "./day-picker";

function dayTitle(date: string, today: string) {
  const weekday = formatWeekday(dayRange(date).start);
  if (date === today) return `Сегодня, ${weekday}`;
  if (date === shiftDay(today, 1)) return `Завтра, ${weekday}`;
  if (date === shiftDay(today, -1)) return `Вчера, ${weekday}`;
  return weekday[0].toUpperCase() + weekday.slice(1);
}

type ScheduleViewProps = {
  initial: Snapshot<ScheduleData>;
  role: UserRole;
  timeZone: string;
};

export function ScheduleView({ initial, role, timeZone }: ScheduleViewProps) {
  const date = initial.data.date;
  const loader = useCallback(() => refreshSchedule(date), [date]);
  const { data, loadedAt, error, refreshing, refresh } = usePolling(loader, initial);
  const now = Date.parse(loadedAt);
  const today = dayKey(new Date(now));
  const groups = groupByCrew(data);
  const canCreate = role === "dispatcher";

  return (
    <>
      <PageHeader
        title="Расписание"
        description={
          <>
            <span className="block font-medium text-ink">{dayTitle(date, today)}</span>
            <span className="block text-sm">Время указано в поясе компании: {timeZone}</span>
          </>
        }
        actions={
          canCreate ? (
            <Link href={newTaskLink({ date })} className={buttonVariants()}>
              <Plus aria-hidden className="size-4" />
              Создать задание
            </Link>
          ) : null
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <DayPicker date={date} today={today} />
        <RefreshStatus loadedAt={loadedAt} error={error} refreshing={refreshing} onRefresh={refresh} />
      </div>
      {data.tasks.length ? (
        <>
          <CrewTimeline groups={groups} date={date} today={today} now={now} />
          <div className="grid gap-4">
            {groups.map((group) => (
              <CrewDayList
                key={group.crew.id}
                group={group}
                date={date}
                today={today}
                now={now}
                canCreate={canCreate}
              />
            ))}
          </div>
        </>
      ) : (
        <EmptyDay groups={groups} date={date} today={today} role={role} />
      )}
    </>
  );
}

type EmptyDayProps = {
  groups: CrewDay[];
  date: string;
  today: string;
  role: UserRole;
};

function EmptyDay({ groups, date, today, role }: EmptyDayProps) {
  const crews = groups.map((group) => group.crew).filter((crew) => !crew.archived);
  const otherDay =
    date === today ? (
      <Link href={scheduleLink(shiftDay(date, 1))} className={buttonVariants({ variant: "secondary" })}>
        Следующий день
      </Link>
    ) : (
      <Link href="/schedule" className={buttonVariants({ variant: "secondary" })}>
        Открыть сегодня
      </Link>
    );

  if (!crews.length) {
    return (
      <Card>
        <EmptyState
          icon={<CalendarX2 aria-hidden className="size-8" />}
          title={role === "foreman" ? "Вы не закреплены за бригадой" : "В подразделении нет бригад"}
          description={
            role === "foreman"
              ? "Расписание появится, когда диспетчер закрепит за вами бригаду."
              : role === "dispatcher"
                ? "Задания планируются на бригады. Добавьте бригаду в справочнике, чтобы составить расписание."
                : "Расписание появится, когда в подразделении будут бригады."
          }
          action={
            role === "dispatcher" ? (
              <Link href="/crews" className={buttonVariants({ variant: "secondary" })}>
                Открыть бригады
              </Link>
            ) : null
          }
        />
      </Card>
    );
  }

  if (role !== "dispatcher") {
    return (
      <Card>
        <EmptyState
          icon={<CalendarX2 aria-hidden className="size-8" />}
          title="На этот день работ нет"
          description={
            role === "foreman"
              ? "Для вашей бригады на этот день ничего не запланировано. Выберите другой день."
              : "В подразделении на этот день ничего не запланировано. Выберите другой день."
          }
          action={otherDay}
        />
      </Card>
    );
  }

  return (
    <Card>
      <EmptyState
        icon={<CalendarX2 aria-hidden className="size-8" />}
        title="На этот день работ нет"
        description="Выберите бригаду, чтобы запланировать работу на этот день, или откройте другой день."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {crews.map((crew) => (
              <Link
                key={crew.id}
                href={newTaskLink({ crew: crew.id, date })}
                className={buttonVariants({ variant: "secondary" })}
              >
                <Plus aria-hidden className="size-4" />
                {crew.name}
              </Link>
            ))}
          </div>
        }
      />
    </Card>
  );
}
