"use client";

import { Ban, CalendarClock, CopyPlus, Pencil, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import type { TaskStatus } from "@/lib/database.types";
import { executionStatuses, isFinal, taskCode } from "@/lib/labels";
import { formatInterval } from "@/lib/time";
import type { CrewChoice, TaskCard } from "../types";
import { CancelForm, EditForm, ReassignForm, RescheduleForm } from "./dispatcher-forms";

type Action = "edit" | "reschedule" | "reassign" | "cancel";

const reassignStatuses: TaskStatus[] = ["Assigned", "Accepted"];

function hintFor(card: TaskCard) {
  switch (card.status) {
    case "Assigned":
    case "Accepted":
      return card.open_obstacle ? "Переназначить бригаду можно после закрытия препятствия." : null;
    case "InProgress":
      return "Бригада уже начала работу, сменить её нельзя. Если нужна другая бригада, отмените задание и создайте новое на основе этого.";
    case "InReview":
      return "Пока отчёт на проверке, условия задания менять нельзя: сначала примите или верните отчёт.";
    case "Completed":
      return "Задание завершено и доступно только для чтения. Для повторной работы создайте новое задание на основе этого.";
    case "Cancelled":
      return "Задание отменено и доступно только для чтения. Чтобы всё же выполнить работу, создайте новое задание на основе этого.";
  }
}

export function DispatcherPanel({ card, crews }: { card: TaskCard; crews: CrewChoice[] }) {
  const [open, setOpen] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const editable = executionStatuses.includes(card.status);
  const reassignable = reassignStatuses.includes(card.status) && !card.open_obstacle;
  const cancellable = !isFinal(card.status);
  const hint = hintFor(card);

  function toggle(action: Action) {
    return (next: boolean) => {
      setOpen(next ? action : null);
      if (next) setNotice(null);
    };
  }

  function finish(message: string) {
    setOpen(null);
    setNotice(message);
  }

  return (
    <section
      aria-labelledby="dispatcher-actions-title"
      className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
    >
      <h2 id="dispatcher-actions-title" className="font-semibold">
        Управление заданием
      </h2>
      {hint ? <p className="mt-1 text-sm text-ink-muted">{hint}</p> : null}
      {notice ? (
        <Alert variant="success" className="mt-3">
          {notice}
        </Alert>
      ) : null}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Dialog open={open === "edit"} onOpenChange={toggle("edit")}>
          {editable ? (
            <DialogTrigger asChild>
              <Button variant="secondary">
                <Pencil aria-hidden className="size-4" />
                Изменить
              </Button>
            </DialogTrigger>
          ) : null}
          <DialogContent
            title="Изменить задание"
            description={`${taskCode(card.number)}: название, описание, приоритет и адрес объекта на момент создания.`}
          >
            <EditForm card={card} available={editable} onDone={finish} />
          </DialogContent>
        </Dialog>

        <Dialog open={open === "reschedule"} onOpenChange={toggle("reschedule")}>
          {editable ? (
            <DialogTrigger asChild>
              <Button variant="secondary">
                <CalendarClock aria-hidden className="size-4" />
                Перенести
              </Button>
            </DialogTrigger>
          ) : null}
          <DialogContent
            title="Перенести сроки"
            description={`Сейчас: ${formatInterval(card.planned_start, card.planned_end)}.`}
          >
            <RescheduleForm card={card} available={editable} onDone={finish} />
          </DialogContent>
        </Dialog>

        <Dialog open={open === "reassign"} onOpenChange={toggle("reassign")}>
          {reassignable ? (
            <DialogTrigger asChild>
              <Button variant="secondary">
                <Users aria-hidden className="size-4" />
                Переназначить
              </Button>
            </DialogTrigger>
          ) : null}
          <DialogContent title="Переназначить бригаду" description={`Сейчас: ${card.crew.name}.`}>
            <ReassignForm
              card={card}
              crews={crews}
              available={reassignStatuses.includes(card.status)}
              onDone={finish}
            />
          </DialogContent>
        </Dialog>

        <Link href={`/tasks/new?from=${card.id}`} className={buttonVariants({ variant: "secondary" })}>
          <CopyPlus aria-hidden className="size-4" />
          Создать на основе
        </Link>

        <Dialog open={open === "cancel"} onOpenChange={toggle("cancel")}>
          {cancellable ? (
            <DialogTrigger asChild>
              <Button variant="secondary" className="text-danger xl:ml-auto">
                <Ban aria-hidden className="size-4" />
                Отменить
              </Button>
            </DialogTrigger>
          ) : null}
          <DialogContent title="Отменить задание?" description={`${taskCode(card.number)} «${card.title}»`}>
            <CancelForm card={card} available={cancellable} onDone={finish} />
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
