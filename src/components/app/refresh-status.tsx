"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import type { AppError } from "@/lib/errors";
import { cn } from "@/lib/cn";

type RefreshStatusProps = {
  loadedAt: string;
  error: AppError | null;
  refreshing: boolean;
  onRefresh: () => void;
  className?: string;
};

function clock(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: process.env.NEXT_PUBLIC_COMPANY_TIMEZONE || "Europe/Moscow",
  }).format(new Date(value));
}

export function RefreshStatus({ loadedAt, error, refreshing, onRefresh, className }: RefreshStatusProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted", className)}>
      {error ? (
        <span role="status" className="text-warning">
          {error.kind === "auth" ? (
            <>
              Сессия истекла.{" "}
              <Link href="/login?expired=1" className="underline">
                Войти снова
              </Link>
            </>
          ) : (
            <>Не удалось обновить, показаны данные на {clock(loadedAt)}</>
          )}
        </span>
      ) : (
        <span aria-live="polite">Обновлено в {clock(loadedAt)}</span>
      )}
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-medium text-ink hover:bg-surface disabled:opacity-60 sm:min-h-8"
      >
        <RefreshCw aria-hidden className={cn("size-4", refreshing && "animate-spin")} />
        Обновить
      </button>
    </div>
  );
}
