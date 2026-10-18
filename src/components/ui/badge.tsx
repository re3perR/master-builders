import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-canvas text-ink-muted border-line",
  danger: "bg-danger-soft text-danger border-danger-line",
  warning: "bg-warning-soft text-warning border-warning-line",
  success: "bg-success-soft text-success border-success-line",
};

type BadgeTone = keyof typeof tones;

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[13px] font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
