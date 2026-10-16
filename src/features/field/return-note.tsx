import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/time";

type ReturnNoteProps = {
  returned: { version: number; note: string; decided_at: string };
  className?: string;
};

export function ReturnNote({ returned, className }: ReturnNoteProps) {
  return (
    <div className={cn("rounded-lg border border-[#fed7aa] bg-status-progress-soft p-3 text-[#7c2d12]", className)}>
      <p className="flex items-center gap-2 font-semibold">
        <RotateCcw aria-hidden className="size-4 shrink-0" />
        Отчёт, версия {returned.version}, возвращён на доработку
      </p>
      <p className="mt-0.5 text-sm">Замечание диспетчера от {formatDateTime(returned.decided_at)}:</p>
      <p className="mt-1 whitespace-pre-line break-words text-ink">{returned.note}</p>
    </div>
  );
}
