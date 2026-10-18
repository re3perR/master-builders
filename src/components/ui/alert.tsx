import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const variants = {
  info: { className: "border-status-assigned-line bg-status-assigned-soft text-status-assigned", Icon: Info },
  warning: { className: "border-warning-line bg-warning-soft text-warning", Icon: AlertTriangle },
  danger: { className: "border-danger-line bg-danger-soft text-danger", Icon: XCircle },
  success: { className: "border-success-line bg-success-soft text-success", Icon: CheckCircle2 },
};

type AlertProps = {
  variant?: keyof typeof variants;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function Alert({ variant = "info", title, children, action, className }: AlertProps) {
  const { className: tone, Icon } = variants[variant];
  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border px-3 py-2.5 text-sm", tone, className)}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
