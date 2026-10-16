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
    <nav aria-label="Разделы задания" className="-mx-4 mb-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1">
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
                  "inline-flex min-h-11 items-center gap-1.5 border-b-2 border-transparent px-3 whitespace-nowrap text-ink-muted hover:text-ink",
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
