import { cn } from "@/lib/cn";
import { dayInterval, type IntervalPoint } from "../interval";

function Point({ point }: { point: IntervalPoint }) {
  return (
    <span className="whitespace-nowrap">
      {point.day ? <span className="font-normal text-ink-muted">{point.day} </span> : null}
      {point.time}
    </span>
  );
}

type DayIntervalProps = {
  start: string;
  end: string;
  date: string;
  today: string | null;
  className?: string;
};

export function DayInterval({ start, end, date, today, className }: DayIntervalProps) {
  const interval = dayInterval(start, end, date, today);
  return (
    <span className={cn("tabular font-medium", className)}>
      <Point point={interval.start} /> – <Point point={interval.end} />
    </span>
  );
}
