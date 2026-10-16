import { CheckCircle2, Clock3, OctagonX, RotateCcw } from "lucide-react";
import type { ReportDecision } from "@/lib/database.types";
import { cn } from "@/lib/cn";
import { decisionLabels } from "@/lib/labels";

const styles: Record<ReportDecision, { className: string; Icon: typeof Clock3 }> = {
  pending: { className: "border-[#c7d2fe] bg-status-review-soft text-status-review", Icon: Clock3 },
  accepted: { className: "border-[#bbf7d0] bg-status-done-soft text-status-done", Icon: CheckCircle2 },
  returned: { className: "border-[#fed7aa] bg-status-progress-soft text-[#9a3412]", Icon: RotateCcw },
  cancelled: { className: "border-[#e5e7eb] bg-status-cancelled-soft text-status-cancelled", Icon: OctagonX },
};

export function DecisionBadge({ decision, className }: { decision: ReportDecision; className?: string }) {
  const { className: tone, Icon } = styles[decision];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[13px] font-medium",
        tone,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {decisionLabels[decision]}
    </span>
  );
}
