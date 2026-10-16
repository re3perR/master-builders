"use client";

import { ChevronLeft, ChevronRight, ClipboardList, History, Plus, SearchX, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import { PriorityBadge } from "@/components/app/task-badges";
import { RefreshStatus } from "@/components/app/refresh-status";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { usePolling } from "@/hooks/use-polling";
import { cn } from "@/lib/cn";
import { statusLabels, taskCode } from "@/lib/labels";
import type { Snapshot } from "@/lib/snapshot";
import { dayKey, dayRange, formatInterval, formatShortDate, formatTime, shiftDay } from "@/lib/time";
import { refreshTaskList } from "../actions";
import { buildTaskQuery, emptyFilters, hasActiveFilters, taskListHref, type TaskFilters } from "../filters";
import type { TaskFilterOptions, TaskListItem, TaskListPage } from "../types";
import { TaskFilterPanel } from "./task-filter-panel";
import { TaskSignals } from "./task-signals";

function plural(count: number, forms: [string, string, string]) {
  const tens = count % 100;
  const units = count % 10;
  if (units === 1 && tens !== 11) return forms[0];
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return forms[1];
  return forms[2];
}

function dayLabel(key: string, today: string) {
  if (key === today) return "сегодня";
  if (key === shiftDay(today, 1)) return "завтра";
  if (key === shiftDay(today, -1)) return "вчера";
  return formatShortDate(dayRange(key).start);
}

type Chip = { key: string; label: string; next: TaskFilters };

function filterChips(filters: TaskFilters, options: TaskFilterOptions, today: string): Chip[] {
  const chips: Chip[] = [];
  const nameOf = (items: { id: string; name: string }[], id: string) =>
    items.find((item) => item.id === id)?.name ?? "недоступен";

  if (filters.q) chips.push({ key: "q", label: `Поиск: «${filters.q}»`, next: { ...filters, q: "" } });
  for (const status of filters.statuses) {
    chips.push({
      key: `status-${status}`,
      label: `Статус: ${statusLabels[status]}`,
      next: { ...filters, statuses: filters.statuses.filter((item) => item !== status) },
    });
  }
  if (filters.site) {
    chips.push({
      key: "site",
      label: `Объект: ${nameOf(options.sites, filters.site)}`,
      next: { ...filters, site: null },
    });
  }
  if (filters.crew) {
    chips.push({
      key: "crew",
      label: `Бригада: ${nameOf(options.crews, filters.crew)}`,
      next: { ...filters, crew: null },
    });
  }
  if (filters.date) {
    chips.push({ key: "date", label: `Дата: ${dayLabel(filters.date, today)}`, next: { ...filters, date: null } });
  }
  if (filters.from || filters.to) {
    const from = filters.from ? `с ${dayLabel(filters.from, today)}` : "";
    const to = filters.to ? `по ${dayLabel(filters.to, today)}` : "";
    chips.push({
      key: "period",
      label: `Период: ${[from, to].filter(Boolean).join(" ")}`,
      next: { ...filters, from: null, to: null },
    });
  }
  if (filters.overdue) chips.push({ key: "overdue", label: "Просрочено", next: { ...filters, overdue: false } });
  if (filters.obstacle) {
    chips.push({ key: "obstacle", label: "Есть препятствие", next: { ...filters, obstacle: false } });
  }
  if (filters.review) chips.push({ key: "review", label: "Ждёт проверки", next: { ...filters, review: false } });
  return chips;
}

function TaskInterval({ item }: { item: TaskListItem }) {
  const moved = item.planned_end !== item.planned_end_original;
  const sameDay = dayKey(item.planned_start) === dayKey(item.planned_end);
  return (
    <span className="flex flex-col">
      {sameDay ? (
        <span className="tabular">{formatInterval(item.planned_start, item.planned_end)}</span>
      ) : (
        <span className="tabular">
          {formatShortDate(item.planned_start)}, {formatTime(item.planned_start)} –
          <br />
          {formatShortDate(item.planned_end)}, {formatTime(item.planned_end)}
        </span>
      )}
      {moved ? (
        <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
          <History aria-hidden className="size-3.5" />
          Перенесено
        </span>
      ) : null}
    </span>
  );
}

function TaskTable({ rows, now }: { rows: TaskListItem[]; now: string }) {
  return (
    <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface lg:block">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">Задания</caption>
        <thead className="bg-canvas text-sm text-ink-muted">
          <tr>
            <th scope="col" className="w-24 px-4 py-2.5 font-medium">
              Номер
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Задание и объект
            </th>
            <th scope="col" className="w-44 px-4 py-2.5 font-medium xl:w-52">
              Бригада
            </th>
            <th scope="col" className="w-44 px-4 py-2.5 font-medium xl:w-52">
              Срок
            </th>
            <th scope="col" className="w-56 px-4 py-2.5 font-medium xl:w-64">
              Статус и признаки
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id} className="relative border-t border-line align-top hover:bg-canvas">
              <td className="tabular px-4 py-3 whitespace-nowrap text-ink-muted">{taskCode(item.number)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={`/tasks/${item.id}`}
                    className="font-medium text-ink after:absolute after:inset-0 hover:underline"
                  >
                    {item.title}
                  </Link>
                  {item.priority === "high" ? <PriorityBadge priority="high" /> : null}
                </div>
                <p className="mt-0.5 truncate text-sm text-ink-muted" title={item.address_snapshot}>
                  {item.site_name ?? "Объект недоступен"} · {item.address_snapshot}
                </p>
              </td>
              <td className="px-4 py-3 break-words">{item.crew_name ?? "Бригада недоступна"}</td>
              <td className="px-4 py-3">
                <TaskInterval item={item} />
              </td>
              <td className="px-4 py-3">
                <TaskSignals item={item} now={now} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaskCards({ rows, now }: { rows: TaskListItem[]; now: string }) {
  return (
    <ul className="flex flex-col gap-3 lg:hidden">
      {rows.map((item) => (
        <li
          key={item.id}
          className="relative rounded-[var(--radius-card)] border border-line bg-surface p-4 hover:border-field"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="tabular pt-0.5 text-sm text-ink-muted">{taskCode(item.number)}</span>
            {item.priority === "high" ? <PriorityBadge priority="high" /> : null}
          </div>
          <Link
            href={`/tasks/${item.id}`}
            className="mt-1 block font-semibold text-ink after:absolute after:inset-0 hover:underline"
          >
            {item.title}
          </Link>
          <p className="mt-1 text-sm text-ink-muted">
            {item.site_name ?? "Объект недоступен"} · {item.address_snapshot}
          </p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-ink-muted">Бригада</dt>
            <dd>{item.crew_name ?? "Бригада недоступна"}</dd>
            <dt className="text-ink-muted">Срок</dt>
            <dd>
              <TaskInterval item={item} />
            </dd>
          </dl>
          <div className="mt-3">
            <TaskSignals item={item} now={now} />
          </div>
        </li>
      ))}
    </ul>
  );
}

type TaskListViewProps = {
  initial: Snapshot<TaskListPage>;
  filters: TaskFilters;
  options: TaskFilterOptions;
  today: string;
  canCreate: boolean;
};

export function TaskListView({ initial, filters, options, today, canCreate }: TaskListViewProps) {
  const router = useRouter();
  const [navigating, startTransition] = useTransition();
  const query = buildTaskQuery(filters);
  const loader = useCallback(() => refreshTaskList(query), [query]);
  const { data, loadedAt, error, refreshing, refresh } = usePolling(loader, initial);

  const chips = filterChips(filters, options, today);
  const filtered = hasActiveFilters(filters);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const firstShown = (data.page - 1) * data.pageSize + 1;
  const lastShown = firstShown + data.rows.length - 1;

  function go(next: TaskFilters) {
    startTransition(() => router.push(taskListHref({ ...next, page: 1 }), { scroll: false }));
  }

  return (
    <>
      <TaskFilterPanel filters={filters} options={options} today={today} activeCount={chips.length} onApply={go} />

      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-1 font-medium" aria-live="polite">
            Найдено {data.total} {plural(data.total, ["задание", "задания", "заданий"])}
          </p>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => go(chip.next)}
              aria-label={`Убрать фильтр «${chip.label}»`}
              className="inline-flex min-h-11 max-w-full items-center gap-1 rounded-lg border border-line bg-surface pr-2 pl-3 text-sm hover:bg-canvas sm:min-h-8"
            >
              <span className="truncate">{chip.label}</span>
              <X aria-hidden className="size-4 shrink-0 text-ink-muted" />
            </button>
          ))}
          {chips.length ? (
            <button
              type="button"
              onClick={() => go(emptyFilters)}
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-status-assigned hover:underline sm:min-h-8"
            >
              Сбросить
            </button>
          ) : null}
        </div>
        <RefreshStatus
          loadedAt={loadedAt}
          error={error}
          refreshing={refreshing}
          onRefresh={refresh}
          className="shrink-0"
        />
      </div>

      <div aria-busy={navigating} className={cn(navigating && "opacity-60")}>
        {data.rows.length ? (
          <>
            <TaskTable rows={data.rows} now={loadedAt} />
            <TaskCards rows={data.rows} now={loadedAt} />
          </>
        ) : data.total > 0 ? (
          <EmptyState
            className="rounded-[var(--radius-card)] border border-line bg-surface"
            title={`На странице ${data.page} заданий нет`}
            description={`Всего ${data.total} ${plural(data.total, ["задание", "задания", "заданий"])}, страниц: ${pages}.`}
            action={
              <Link
                href={taskListHref({ ...filters, page: pages })}
                className={buttonVariants({ variant: "secondary" })}
              >
                К последней странице
              </Link>
            }
          />
        ) : filtered ? (
          <EmptyState
            className="rounded-[var(--radius-card)] border border-line bg-surface"
            icon={<SearchX aria-hidden className="size-8" />}
            title="Ничего не найдено"
            description="По выбранным условиям заданий нет. Измените поиск или фильтры либо сбросьте их."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => go(emptyFilters)}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Сбросить фильтры
                </button>
                {canCreate ? (
                  <Link href="/tasks/new" className={buttonVariants()}>
                    <Plus aria-hidden className="size-4" />
                    Создать задание
                  </Link>
                ) : null}
              </div>
            }
          />
        ) : (
          <EmptyState
            className="rounded-[var(--radius-card)] border border-line bg-surface"
            icon={<ClipboardList aria-hidden className="size-8" />}
            title="Заданий пока нет"
            description={
              canCreate
                ? "Создайте первое задание: оно сразу получит статус «Назначено» и появится у бригадира."
                : "Задания появятся здесь, когда диспетчер подразделения их создаст."
            }
            action={
              canCreate ? (
                <Link href="/tasks/new" className={buttonVariants()}>
                  <Plus aria-hidden className="size-4" />
                  Создать задание
                </Link>
              ) : null
            }
          />
        )}
      </div>

      {data.total > data.pageSize ? (
        <nav aria-label="Страницы" className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="tabular text-sm text-ink-muted">
            {data.rows.length ? `Показаны ${firstShown}–${lastShown} из ${data.total}` : `Всего ${data.total}`}
          </p>
          <div className="flex items-center gap-2">
            {data.page > 1 ? (
              <Link
                href={taskListHref({ ...filters, page: Math.min(data.page - 1, pages) })}
                className={buttonVariants({ variant: "secondary" })}
              >
                <ChevronLeft aria-hidden className="size-4" />
                Назад
              </Link>
            ) : null}
            <span className="tabular px-1 text-sm text-ink-muted">
              Страница {data.page} из {pages}
            </span>
            {data.page < pages ? (
              <Link
                href={taskListHref({ ...filters, page: data.page + 1 })}
                className={buttonVariants({ variant: "secondary" })}
              >
                Вперёд
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
