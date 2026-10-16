"use client";

import { Check, Search, SlidersHorizontal } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { TaskStatus } from "@/lib/database.types";
import { cn } from "@/lib/cn";
import { statusLabels, statusOrder } from "@/lib/labels";
import { formatShortDate, dayRange, isDayKey, shiftDay, timeZoneLabel } from "@/lib/time";
import { buildTaskQuery, weekOf, type TaskFilters } from "../filters";
import type { FilterOption, TaskFilterOptions } from "../types";

type DateMode = "any" | "today" | "tomorrow" | "week" | "day" | "period";

function dateModeOf(filters: TaskFilters, today: string): DateMode {
  if (filters.date) {
    if (filters.date === today) return "today";
    if (filters.date === shiftDay(today, 1)) return "tomorrow";
    return "day";
  }
  if (filters.from || filters.to) {
    const week = weekOf(today);
    return filters.from === week.from && filters.to === week.to ? "week" : "period";
  }
  return "any";
}

function ToggleChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium sm:min-h-9",
        pressed ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:bg-canvas",
      )}
    >
      {pressed ? <Check aria-hidden className="size-4" /> : null}
      {children}
    </button>
  );
}

function OptionList({ items, all }: { items: FilterOption[]; all: string }) {
  return (
    <>
      <option value="">{all}</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.archived ? `${item.name} (архив)` : item.name}
        </option>
      ))}
    </>
  );
}

type TaskFilterPanelProps = {
  filters: TaskFilters;
  options: TaskFilterOptions;
  today: string;
  activeCount: number;
  onApply: (next: TaskFilters) => void;
};

export function TaskFilterPanel({ filters, options, today, activeCount, onApply }: TaskFilterPanelProps) {
  const filtersKey = buildTaskQuery(filters);
  const [seenKey, setSeenKey] = useState(filtersKey);
  const [text, setText] = useState(filters.q);
  const [open, setOpen] = useState(false);
  const [draftMode, setDraftMode] = useState<DateMode | null>(null);
  const [day, setDay] = useState(filters.date ?? "");
  const [period, setPeriod] = useState({ from: filters.from ?? "", to: filters.to ?? "" });
  const [periodError, setPeriodError] = useState<string | null>(null);

  if (filtersKey !== seenKey) {
    setSeenKey(filtersKey);
    setText(filters.q);
    setDraftMode(null);
    setDay(filters.date ?? "");
    setPeriod({ from: filters.from ?? "", to: filters.to ?? "" });
    setPeriodError(null);
  }

  const mode = draftMode ?? dateModeOf(filters, today);
  const apply = (patch: Partial<TaskFilters>) => onApply({ ...filters, q: text.trim(), ...patch });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply({});
  }

  function toggleStatus(status: TaskStatus) {
    const statuses = filters.statuses.includes(status)
      ? filters.statuses.filter((item) => item !== status)
      : statusOrder.filter((item) => item === status || filters.statuses.includes(item));
    apply({ statuses });
  }

  function changeMode(value: DateMode) {
    setPeriodError(null);
    if (value === "day" || value === "period") {
      setDraftMode(value);
      return;
    }
    setDraftMode(null);
    if (value === "any") apply({ date: null, from: null, to: null });
    if (value === "today") apply({ date: today, from: null, to: null });
    if (value === "tomorrow") apply({ date: shiftDay(today, 1), from: null, to: null });
    if (value === "week") apply({ date: null, ...weekOf(today) });
  }

  function changeDay(value: string) {
    setDay(value);
    if (isDayKey(value)) apply({ date: value, from: null, to: null });
  }

  function changePeriod(next: { from: string; to: string }) {
    setPeriod(next);
    if ((next.from && !isDayKey(next.from)) || (next.to && !isDayKey(next.to))) return;
    if (next.from && next.to && next.from > next.to) {
      setPeriodError("Дата окончания периода раньше даты начала.");
      return;
    }
    setPeriodError(null);
    if (next.from || next.to) apply({ date: null, from: next.from || null, to: next.to || null });
  }

  const tomorrow = shiftDay(today, 1);

  return (
    <section
      aria-label="Поиск и фильтры"
      className="mb-4 rounded-[var(--radius-card)] border border-line bg-surface p-3 sm:p-4"
    >
      <div className="flex flex-col gap-2 lg:flex-row">
        <form role="search" onSubmit={submitSearch} className="flex min-w-0 flex-1 gap-2">
          <label htmlFor="task-search" className="sr-only">
            Поиск по номеру, названию, объекту или адресу
          </label>
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
            />
            <Input
              id="task-search"
              type="search"
              value={text}
              maxLength={100}
              enterKeyHint="search"
              placeholder="Номер, название, объект, адрес"
              onChange={(event) => setText(event.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Найти
          </Button>
        </form>
        <Button
          variant="secondary"
          className="lg:hidden"
          aria-expanded={open}
          aria-controls="task-filters"
          onClick={() => setOpen((value) => !value)}
        >
          <SlidersHorizontal aria-hidden className="size-4" />
          {open ? "Скрыть фильтры" : "Фильтры"}
          {activeCount ? (
            <span className="tabular rounded bg-canvas px-1.5 text-xs text-ink-muted">{activeCount}</span>
          ) : null}
        </Button>
      </div>

      <div id="task-filters" className={cn("mt-3 flex-col gap-4", open ? "flex" : "hidden lg:flex")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="filter-site" className="text-sm font-medium">
              Объект
            </label>
            <Select
              id="filter-site"
              value={filters.site ?? ""}
              onChange={(event) => apply({ site: event.target.value || null })}
            >
              <OptionList items={options.sites} all="Все объекты" />
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="filter-crew" className="text-sm font-medium">
              Бригада
            </label>
            <Select
              id="filter-crew"
              value={filters.crew ?? ""}
              onChange={(event) => apply({ crew: event.target.value || null })}
            >
              <OptionList items={options.crews} all="Все бригады" />
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
            <label htmlFor="filter-date" className="text-sm font-medium">
              Дата работ
            </label>
            <Select
              id="filter-date"
              value={mode}
              aria-describedby="filter-date-hint"
              onChange={(event) => changeMode(event.target.value as DateMode)}
            >
              <option value="any">Любая</option>
              <option value="today">Сегодня, {formatShortDate(dayRange(today).start)}</option>
              <option value="tomorrow">Завтра, {formatShortDate(dayRange(tomorrow).start)}</option>
              <option value="week">Эта неделя</option>
              <option value="day">Выбрать день…</option>
              <option value="period">Выбрать период…</option>
            </Select>
            {mode === "day" ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="filter-day" className="text-sm text-ink-muted">
                  День
                </label>
                <Input id="filter-day" type="date" value={day} onChange={(event) => changeDay(event.target.value)} />
              </div>
            ) : null}
            {mode === "period" ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor="filter-from" className="text-sm text-ink-muted">
                    С
                  </label>
                  <Input
                    id="filter-from"
                    type="date"
                    value={period.from}
                    aria-invalid={Boolean(periodError)}
                    aria-describedby={periodError ? "filter-period-error" : undefined}
                    onChange={(event) => changePeriod({ ...period, from: event.target.value })}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor="filter-to" className="text-sm text-ink-muted">
                    По
                  </label>
                  <Input
                    id="filter-to"
                    type="date"
                    value={period.to}
                    aria-invalid={Boolean(periodError)}
                    aria-describedby={periodError ? "filter-period-error" : undefined}
                    onChange={(event) => changePeriod({ ...period, to: event.target.value })}
                  />
                </div>
              </div>
            ) : null}
            {periodError ? (
              <p id="filter-period-error" role="alert" className="text-sm text-danger">
                {periodError}
              </p>
            ) : null}
            <p id="filter-date-hint" className="text-sm text-ink-muted">
              Учитываются задания, чьи сроки захватывают выбранные дни. {timeZoneLabel()}.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <fieldset className="max-w-full shrink-0">
            <legend className="mb-1.5 text-sm font-medium">Статус</legend>
            <div className="flex flex-wrap gap-2">
              {statusOrder.map((status) => (
                <ToggleChip
                  key={status}
                  pressed={filters.statuses.includes(status)}
                  onClick={() => toggleStatus(status)}
                >
                  {statusLabels[status]}
                </ToggleChip>
              ))}
            </div>
          </fieldset>

          <fieldset className="max-w-full shrink-0">
            <legend className="mb-1.5 text-sm font-medium">Требуют внимания</legend>
            <div className="flex flex-wrap gap-2">
              <ToggleChip pressed={filters.overdue} onClick={() => apply({ overdue: !filters.overdue })}>
                Просрочено
              </ToggleChip>
              <ToggleChip pressed={filters.obstacle} onClick={() => apply({ obstacle: !filters.obstacle })}>
                Есть препятствие
              </ToggleChip>
              <ToggleChip pressed={filters.review} onClick={() => apply({ review: !filters.review })}>
                Ждёт проверки
              </ToggleChip>
            </div>
          </fieldset>
        </div>
      </div>
    </section>
  );
}
