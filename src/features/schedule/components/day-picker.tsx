"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { scheduleLink } from "@/features/overview/links";
import { rememberFocus, useRestoreFocus } from "@/features/overview/restore-focus";
import { cn } from "@/lib/cn";
import { isDayKey, shiftDay } from "@/lib/time";

export function DayPicker({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const [value, setValue] = useState(date);
  const [pending, startTransition] = useTransition();
  const nav = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const typed = useRef(false);
  const previous = shiftDay(date, -1);
  const next = shiftDay(date, 1);

  useRestoreFocus(`schedule:${date}`, nav);

  const open = useCallback(
    (target: string, control: string | null) => {
      typed.current = false;
      if (!isDayKey(target)) {
        setValue(date);
        return;
      }
      if (target === date) return;
      if (control) rememberFocus(`schedule:${target}`, control);
      startTransition(() => router.push(scheduleLink(target), { scroll: false }));
    },
    [date, router],
  );

  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const commit = () => {
      if (!typed.current) open(element.value, "date");
    };
    element.addEventListener("change", commit);
    return () => element.removeEventListener("change", commit);
  }, [open]);

  return (
    <nav ref={nav} aria-label="Выбор дня" className="flex flex-wrap items-center gap-2">
      <Link
        href={scheduleLink(previous)}
        data-control="previous"
        onClick={() => rememberFocus(`schedule:${previous}`, "previous")}
        className={cn(buttonVariants({ variant: "secondary", size: "icon" }))}
        scroll={false}
      >
        <ChevronLeft aria-hidden className="size-5" />
        <span className="sr-only">Предыдущий день</span>
      </Link>
      <label htmlFor="schedule-date" className="sr-only">
        Дата
      </label>
      <Input
        ref={input}
        id="schedule-date"
        type="date"
        data-control="date"
        value={value}
        aria-busy={pending}
        className="min-w-0 flex-1 basis-40 sm:w-auto sm:flex-none"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            open(event.currentTarget.value, "date");
          } else if (event.key === "Escape") {
            typed.current = false;
            setValue(date);
          } else {
            typed.current = true;
          }
        }}
        onBlur={(event) => {
          if (typed.current) open(event.currentTarget.value, event.relatedTarget?.getAttribute("data-control") ?? null);
        }}
      />
      <Link
        href={scheduleLink(next)}
        data-control="next"
        onClick={() => rememberFocus(`schedule:${next}`, "next")}
        className={cn(buttonVariants({ variant: "secondary", size: "icon" }))}
        scroll={false}
      >
        <ChevronRight aria-hidden className="size-5" />
        <span className="sr-only">Следующий день</span>
      </Link>
      <Link
        href="/schedule"
        data-control="today"
        onClick={() => rememberFocus(`schedule:${today}`, "today")}
        aria-current={date === today ? "date" : undefined}
        className={cn(buttonVariants({ variant: "secondary" }), date === today && "border-field")}
        scroll={false}
      >
        Сегодня
      </Link>
    </nav>
  );
}
