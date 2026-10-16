"use client";

import Link from "next/link";
import { useRef } from "react";
import { cn } from "@/lib/cn";
import { periodOptions, type PeriodDays } from "../period";
import { rememberFocus, useRestoreFocus } from "../restore-focus";

export function PeriodSwitch({ days, basePath }: { days: PeriodDays; basePath: string }) {
  const nav = useRef<HTMLElement>(null);
  useRestoreFocus(`${basePath}:${days}`, nav);

  return (
    <nav ref={nav} aria-label="Период">
      <ul className="inline-flex rounded-lg border border-line bg-surface p-0.5">
        {periodOptions.map((option) => {
          const current = option === days;
          return (
            <li key={option}>
              <Link
                href={`${basePath}?days=${option}`}
                scroll={false}
                data-control={option}
                onClick={() => rememberFocus(`${basePath}:${option}`, String(option))}
                aria-current={current ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-ink-muted hover:bg-canvas hover:text-ink sm:min-h-8",
                  current && "bg-nav text-white hover:bg-nav hover:text-white",
                )}
              >
                {option} дней
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
