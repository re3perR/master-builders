import { AlertOctagon, ClipboardList, Eye, TimerOff } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { DivisionCounters } from "../db-types";
import { taskListLinks } from "../links";

const tiles = [
  {
    key: "active",
    label: "Активные задания",
    hint: "Назначены, приняты, в работе или на проверке",
    href: taskListLinks.active,
    Icon: ClipboardList,
    tone: "text-status-assigned",
  },
  {
    key: "overdue",
    label: "Просрочено исполнение",
    hint: "Срок окончания прошёл, работа не сдана",
    href: taskListLinks.overdue,
    Icon: TimerOff,
    tone: "text-danger",
  },
  {
    key: "obstacles",
    label: "Открытые препятствия",
    hint: "Бригада сообщила о проблеме",
    href: taskListLinks.obstacles,
    Icon: AlertOctagon,
    tone: "text-warning",
  },
  {
    key: "review",
    label: "Ждут проверки",
    hint: "Отчёт отправлен, решения ещё нет",
    href: taskListLinks.review,
    Icon: Eye,
    tone: "text-status-review",
  },
] as const;

export function CounterTiles({ counters }: { counters: DivisionCounters }) {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map(({ key, label, hint, href, Icon, tone }) => {
        const value = counters[key];
        return (
          <li key={key}>
            <Link
              href={href}
              className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-4 hover:border-field"
            >
              <span className="flex items-start justify-between gap-2 text-sm font-medium text-ink-muted">
                {label}
                <Icon aria-hidden className={cn("size-5 shrink-0", value > 0 ? tone : "text-ink-muted")} />
              </span>
              <span className={cn("mt-1 text-3xl font-semibold", key === "overdue" && value > 0 && "text-danger")}>
                {value}
              </span>
              <span className="mt-1 hidden text-sm text-ink-muted sm:block">{hint}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
