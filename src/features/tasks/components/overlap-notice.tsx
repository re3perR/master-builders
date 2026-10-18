import { AlertTriangle, ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { OverlapItem } from "@/lib/database.types";
import { statusLabels, taskCode } from "@/lib/labels";
import { formatInterval } from "@/lib/time";

type OverlapNoticeProps = {
  crewName: string | null;
  overlaps: OverlapItem[];
  acknowledged: string[];
  pending: boolean;
  editLabel?: string;
  headingLevel?: "h2" | "h3";
  onConfirm: () => void;
  onEdit: () => void;
};

export function OverlapNotice({
  crewName,
  overlaps,
  acknowledged,
  pending,
  editLabel = "Изменить сроки",
  headingLevel: Heading = "h2",
  onConfirm,
  onEdit,
}: OverlapNoticeProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const fresh = overlaps.filter((item) => !acknowledged.includes(item.id));
  const repeated = acknowledged.length > 0 && fresh.length > 0;

  useEffect(() => {
    heading.current?.focus();
  }, [overlaps]);

  return (
    <div className="rounded-lg border border-warning-line bg-warning-soft px-3 py-3 text-sm text-warning sm:px-4">
      <div className="flex gap-2.5">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <Heading ref={heading} tabIndex={-1} className="font-semibold">
            {repeated ? "Появились новые пересечения" : "Бригада уже занята в это время"}
          </Heading>
          <p className="mt-0.5">
            {crewName ? `У бригады «${crewName}» ` : "У бригады "}
            {overlaps.length === 1
              ? "есть задание, срок которого пересекается с указанным."
              : "есть задания, сроки которых пересекаются с указанным."}{" "}
            Если это согласовано, сохраните, несмотря на пересечение.
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {overlaps.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <a
                  href={`/tasks/${item.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-baseline gap-1 font-medium text-ink underline underline-offset-2"
                >
                  {taskCode(item.number)} {item.title}
                  <ExternalLink aria-hidden className="size-3.5 self-center" />
                  <span className="sr-only">(откроется в новой вкладке)</span>
                </a>
                <span className="tabular">
                  {statusLabels[item.status]} · {formatInterval(item.planned_start, item.planned_end)}
                </span>
                {repeated && fresh.some((entry) => entry.id === item.id) ? (
                  <span className="rounded bg-surface px-1.5 text-xs font-medium">новое</span>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button onClick={onConfirm} disabled={pending}>
              {pending ? "Сохраняем…" : "Сохранить, несмотря на пересечение"}
            </Button>
            <Button variant="secondary" onClick={onEdit} disabled={pending}>
              {editLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
