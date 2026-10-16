"use client";

import { Archive, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { RefreshStatus } from "@/components/app/refresh-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { usePolling } from "@/hooks/use-polling";
import type { Snapshot } from "@/lib/snapshot";
import { loadSites } from "../actions";
import type { SiteSummary } from "../db-types";
import { sitesHref } from "../filters";
import { plural } from "../plural";
import type { SiteFilters, SiteList } from "../types";
import { SiteFormDialog } from "./site-form-dialog";

type SitesViewProps = {
  initial: Snapshot<SiteList>;
  filters: SiteFilters;
  canManage: boolean;
};

export function SitesView({ initial, filters, canManage }: SitesViewProps) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [query, setQuery] = useState(filters.query);
  const [archived, setArchived] = useState(filters.archived);
  const [applied, setApplied] = useState(filters);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { data, loadedAt, error, refreshing, refresh } = usePolling(() => loadSites(filters), initial);

  if (applied.query !== filters.query || applied.archived !== filters.archived) {
    setApplied(filters);
    setArchived(filters.archived);
    if (filters.query !== query.trim()) setQuery(filters.query);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function go(next: SiteFilters) {
    clearTimeout(timer.current);
    startNavigation(() => router.replace(sitesHref(next), { scroll: false }));
  }

  function changeQuery(value: string) {
    setQuery(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ query: value, archived }), 400);
  }

  function changeArchived(value: boolean) {
    setArchived(value);
    go({ query, archived: value });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go({ query, archived });
  }

  const { sites, archivedCount } = data;
  const searching = filters.query.length > 0;
  const shownArchived = sites.filter((site) => site.archived_at).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form role="search" onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="relative sm:w-80">
            <label htmlFor="sites-search" className="sr-only">
              Поиск по названию или адресу
            </label>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
            />
            <Input
              id="sites-search"
              type="search"
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              placeholder="Название или адрес"
              autoComplete="off"
              className="pl-9"
            />
          </div>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] sm:min-h-10">
            <input
              type="checkbox"
              checked={archived}
              onChange={(event) => changeArchived(event.target.checked)}
              className="size-4 accent-brand"
            />
            Показать архивные{archivedCount ? ` (${archivedCount})` : ""}
          </label>
          {navigating ? <Spinner label="Обновляем список" className="text-ink-muted" /> : null}
        </form>
        <RefreshStatus loadedAt={loadedAt} error={error} refreshing={refreshing} onRefresh={refresh} />
      </div>

      {sites.length ? (
        <>
          <p className="text-sm text-ink-muted" aria-live="polite">
            {searching ? "Найдено: " : null}
            {plural(sites.length, "объект", "объекта", "объектов")}
            {shownArchived ? `, из них в архиве — ${shownArchived}` : null}
            {!filters.archived && !searching && archivedCount ? ` · ещё ${archivedCount} в архиве` : null}
          </p>
          <SitesTable sites={sites} />
          <SitesCards sites={sites} />
        </>
      ) : (
        <Card>
          {searching ? (
            <EmptyState
              title="Ничего не найдено"
              description="Проверьте написание или поищите по другой части названия или адреса."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    go({ query: "", archived });
                  }}
                >
                  Сбросить поиск
                </Button>
              }
            />
          ) : !filters.archived && archivedCount ? (
            <EmptyState
              title="Все объекты в архиве"
              description="Архивные объекты не выбираются для новых заданий, но их можно открыть и восстановить."
              action={
                <Button variant="secondary" onClick={() => changeArchived(true)}>
                  Показать архивные
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Объектов пока нет"
              description={
                canManage
                  ? "Добавьте объект, чтобы назначать на него задания."
                  : "Объекты подразделения добавляет диспетчер."
              }
              action={canManage ? <SiteFormDialog /> : null}
            />
          )}
        </Card>
      )}
    </div>
  );
}

function ArchivedBadge() {
  return (
    <Badge>
      <Archive aria-hidden className="size-3.5" />В архиве
    </Badge>
  );
}

function SitesTable({ sites }: { sites: SiteSummary[] }) {
  return (
    <Card className="hidden overflow-hidden md:block">
      <table className="w-full text-left text-[15px]">
        <caption className="sr-only">Объекты подразделения</caption>
        <thead className="border-b border-line bg-canvas text-sm text-ink-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Объект
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Адрес
            </th>
            <th scope="col" className="hidden px-4 py-2.5 font-medium xl:table-cell">
              Контакт
            </th>
            <th scope="col" className="w-px px-4 py-2.5 text-right font-medium whitespace-nowrap">
              Активные задания
            </th>
            <th scope="col" className="w-px px-4 py-2.5 text-right font-medium whitespace-nowrap">
              Всего заданий
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sites.map((site) => (
            <tr key={site.id} className={site.archived_at ? "bg-canvas/50" : undefined}>
              <td className="px-4 py-3 align-top">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/sites/${site.id}`} className="font-medium text-ink hover:underline">
                    {site.name}
                  </Link>
                  {site.archived_at ? <ArchivedBadge /> : null}
                </div>
              </td>
              <td className="px-4 py-3 align-top text-ink-muted">{site.address}</td>
              <td className="hidden px-4 py-3 align-top text-ink-muted xl:table-cell">{site.contact ?? "—"}</td>
              <td className="tabular px-4 py-3 text-right align-top font-medium">{site.active_tasks}</td>
              <td className="tabular px-4 py-3 text-right align-top text-ink-muted">{site.total_tasks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function SitesCards({ sites }: { sites: SiteSummary[] }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {sites.map((site) => (
        <li key={site.id}>
          <Link
            href={`/sites/${site.id}`}
            className="block rounded-[var(--radius-card)] border border-line bg-surface p-4 hover:bg-canvas"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="font-medium">{site.name}</span>
              {site.archived_at ? <ArchivedBadge /> : null}
            </span>
            <span className="mt-1 block text-sm text-ink-muted">{site.address}</span>
            <span className="tabular mt-2 block text-sm">
              Активных заданий: <span className="font-medium">{site.active_tasks}</span>
              <span className="text-ink-muted"> · всего {site.total_tasks}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
