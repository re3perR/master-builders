"use client";

import { Hammer, Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { ActionError } from "./action-error";
import { acceptTask, startTask } from "./actions";
import { useTaskAction } from "./use-task-action";

const steps = {
  accept: { action: acceptTask, label: "Принять задание", busy: "Принимаем…", Icon: Handshake },
  start: { action: startTask, label: "Начать работу", busy: "Начинаем…", Icon: Hammer },
};

type TransitionButtonProps = {
  taskId: string;
  version: number;
  step: keyof typeof steps;
  className?: string;
};

export function TransitionButton({ taskId, version, step, className }: TransitionButtonProps) {
  const { run, pending, error } = useTaskAction();
  const { action, label, busy, Icon } = steps[step];

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Button
        className="w-full sm:w-auto"
        disabled={pending}
        onClick={() => run((clientKey) => action({ taskId, version, clientKey }))}
      >
        {pending ? <Spinner label={busy} /> : <Icon aria-hidden className="size-4" />}
        {pending ? busy : label}
      </Button>
      <ActionError error={error} />
    </div>
  );
}
