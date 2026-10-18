"use client";

import { Tabs } from "radix-ui";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { RefreshStatus } from "@/components/app/refresh-status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { usePolling } from "@/hooks/use-polling";
import { cn } from "@/lib/cn";
import type { Snapshot } from "@/lib/snapshot";
import { loadMyTasks } from "./actions";
import { MyTaskCard } from "./my-task-card";
import { doneLimitMax, donePageSize, myViews, type MyTasks, type MyView } from "./types";

const viewLabels: Record<MyView, string> = {
  action: "Требуют действия",
  today: "Сегодня",
  upcoming: "Ближайшие",
  review: "На проверке",
  done: "Завершённые",
};

export function MyTasksBoard({ initial, initialView }: { initial: Snapshot<MyTasks>; initialView: MyView }) {
  const doneLimit = useRef(donePageSize);
  const load = useCallback(() => loadMyTasks(doneLimit.current), []);
  const { data, loadedAt, error, refreshing, refresh } = usePolling(load, initial);
  const [view, setView] = useState<MyView>(initialView);
  const [loadingMore, setLoadingMore] = useState(false);
  const byId = new Map(data.tasks.map((task) => [task.id, task]));

  function select(next: string) {
    const value = myViews.find((item) => item === next) ?? "today";
    setView(value);
    const url = new URL(window.location.href);
    url.searchParams.set("view", value);
    window.history.replaceState(window.history.state, "", url);
  }

  async function showMoreDone() {
    doneLimit.current = Math.min(data.views.done.length + donePageSize, doneLimitMax);
    setLoadingMore(true);
    await refresh();
    setLoadingMore(false);
  }

  const empty: Record<MyView, { title: string; description: string; action?: ReactNode }> = {
    action: {
      title: "Срочных дел нет",
      description: "Новых назначений, возвратов на доработку и открытых препятствий нет.",
      action: (
        <Button variant="secondary" onClick={() => select("today")}>
          Задания на сегодня
        </Button>
      ),
    },
    today: {
      title: "На сегодня работ нет",
      description: "Посмотрите задания на следующие дни.",
      action: (
        <Button variant="secondary" onClick={() => select("upcoming")}>
          Ближайшие задания
        </Button>
      ),
    },
    upcoming: {
      title: "Будущих заданий пока нет",
      description: "Новые работы назначает диспетчер. Список обновляется сам каждые 30 секунд.",
      action: (
        <Button variant="secondary" onClick={() => void refresh()} disabled={refreshing}>
          Обновить сейчас
        </Button>
      ),
    },
    review: {
      title: "Нет отчётов на проверке",
      description: "Здесь будут задания, по которым вы отправили отчёт, пока диспетчер его не проверит.",
    },
    done: {
      title: "Завершённых заданий пока нет",
      description: "Здесь появятся принятые и отменённые задания вашей бригады.",
    },
  };

  return (
    <div className="flex flex-col gap-4">
      <RefreshStatus loadedAt={loadedAt} error={error} refreshing={refreshing} onRefresh={() => void refresh()} />
      <Tabs.Root value={view} onValueChange={select}>
        <Tabs.List
          aria-label="Разделы списка"
          className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1 sm:flex"
        >
          {myViews.map((key, index) => {
            const count = key === "done" ? data.done_total : data.views[key].length;
            return (
              <Tabs.Trigger
                key={key}
                value={key}
                className={cn(
                  "group flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-center text-sm leading-tight font-medium text-ink-muted hover:bg-canvas hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-white sm:flex-1",
                  index === 0 && "col-span-2",
                )}
              >
                <span>{viewLabels[key]}</span>
                <span
                  className={cn(
                    "tabular rounded-md bg-canvas px-1.5 text-[13px] text-ink group-data-[state=active]:bg-white/15 group-data-[state=active]:text-white",
                    key === "action" && count > 0 && "bg-brand-soft text-brand",
                  )}
                >
                  {count}
                </span>
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>
        {myViews.map((key) => {
          const tasks = data.views[key].flatMap((id) => byId.get(id) ?? []);
          return (
            <Tabs.Content key={key} value={key} className="mt-4">
              {tasks.length ? (
                <ul className="grid gap-3 lg:grid-cols-2">
                  {tasks.map((task) => (
                    <li key={task.id}>
                      <MyTaskCard task={task} today={data.today} now={loadedAt} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-[var(--radius-card)] border border-line bg-surface">
                  <EmptyState {...empty[key]} />
                </div>
              )}
              {key === "done" && data.done_total > tasks.length ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <p className="text-sm text-ink-muted">
                    Показаны последние {tasks.length} из {data.done_total}.
                  </p>
                  {tasks.length < doneLimitMax ? (
                    <Button
                      variant="secondary"
                      className="w-full sm:w-auto"
                      disabled={refreshing}
                      onClick={() => void showMoreDone()}
                    >
                      {loadingMore ? <Spinner label="Загружаем" /> : null}
                      Показать ещё
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Tabs.Content>
          );
        })}
      </Tabs.Root>
    </div>
  );
}
