import { cn } from "@/lib/cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg aria-hidden viewBox="0 0 24 24" className="size-6">
        <rect x="2" y="2" width="20" height="20" rx="5" fill="#C2410C" />
        <path d="M6.5 16.5V8l5.5 5 5.5-5v8.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      Master Builders
    </span>
  );
}
