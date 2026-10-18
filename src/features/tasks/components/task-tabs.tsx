import Link from "next/link";
import { cn } from "@/lib/cn";

export const taskTabs = [
  { key: "details", label: "Детали" },
  { key: "discussion", label: "Обсуждение" },
  { key: "reports", label: "Отчёты" },
  { key: "history", label: "История" },
] as const;

export type TaskTab = (typeof taskTabs)[number]["key"];

export function parseTab(value: unknown): TaskTab {
  return taskTabs.some((tab) => tab.key === value) ? (value as TaskTab) : "details";
}

export function TaskTabs({
  taskId,
  active,
  counts,
}: {
  taskId: string;
  active: TaskTab;
  counts?: Partial<Record<TaskTab, number>>;
}) {
  return (
    <nav aria-label="Разделы задания" className="mb-4 border-b border-line">
      <ul className="grid grid-cols-2 sm:flex sm:gap-1">
        {taskTabs.map((tab) => {
          const current = tab.key === active;
          const count = counts?.[tab.key];
          return (
            <li key={tab.key}>
              <Link
                href={tab.key === "details" ? `/tasks/${taskId}` : `/tasks/${taskId}?tab=${tab.key}`}
                aria-current={current ? "page" : undefined}
                scroll={false}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-1.5 border-b-2 border-transparent px-3 whitespace-nowrap text-ink-muted hover:text-ink sm:justify-start",
                  current && "border-brand font-medium text-ink",
                )}
              >
                {tab.label}
                {count ? (
                  <span className="tabular rounded bg-canvas px-1.5 text-xs text-ink-muted">{count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
