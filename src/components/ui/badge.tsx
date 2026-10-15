import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-canvas text-ink-muted border-line",
  danger: "bg-danger-soft text-danger border-[#fecaca]",
  warning: "bg-warning-soft text-warning border-[#fde68a]",
  success: "bg-success-soft text-success border-[#bbf7d0]",
  info: "bg-status-assigned-soft text-status-assigned border-[#bfdbfe]",
  brand: "bg-brand-soft text-brand border-[#fed7aa]",
};

export type BadgeTone = keyof typeof tones;

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
