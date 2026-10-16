"use client";

import { CheckCircle2, RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ActionError } from "@/features/field/action-error";
import { useTaskAction } from "@/features/field/use-task-action";
import { approveReport, returnReport } from "./actions";
import { noteMax, noteMin } from "./limits";

type DecisionProps = {
  taskId: string;
  version: number;
  reportId: string;
  reportVersion: number;
};

export function ApproveReportDialog({ taskId, version, reportId, reportVersion }: DecisionProps) {
  const [open, setOpen] = useState(false);
  const { run, pending, error, clearError } = useTaskAction();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) clearError();
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">
          <CheckCircle2 aria-hidden className="size-4" />
          Принять результат
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Принять результат?"
        description={`Отчёт, версия ${reportVersion}, будет принят, задание перейдёт в статус «Завершено». Изменить решение потом нельзя.`}
      >
        <ActionError error={error} className="mb-3" />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="secondary">Отмена</Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              run(
                (clientKey) => approveReport({ taskId, version, reportId, clientKey }),
                () => setOpen(false),
              )
            }
          >
            {pending ? <Spinner label="Сохраняем" /> : null}
            Принять результат
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReturnReportDialog({ taskId, version, reportId, reportVersion }: DecisionProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const { run, pending, error, clearError } = useTaskAction();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const length = note.trim().length;
    if (length < noteMin || length > noteMax) {
      setProblem(`Напишите замечание: от ${noteMin} до ${noteMax} символов.`);
      return;
    }
    setProblem(null);
    run(
      (clientKey) => returnReport({ taskId, version, reportId, note, clientKey }),
      () => {
        setOpen(false);
        setNote("");
      },
    );
  }

  const noteError = problem ?? (error?.kind === "validation" && error.field === "note" ? error.message : null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          clearError();
          setProblem(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" className="w-full sm:w-auto">
          <RotateCcw aria-hidden className="size-4" />
          Вернуть на доработку
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Вернуть на доработку"
        description={`Задание вернётся в работу. Замечание к отчёту, версия ${reportVersion}, увидят бригадир и все участники.`}
      >
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field
            id="return-note"
            label="Что нужно исправить"
            required
            error={noteError}
            hint="Например: нет фото маркировки, не закончен 4 этаж."
          >
            <Textarea
              id="return-note"
              rows={4}
              maxLength={noteMax}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setProblem(null);
                if (error?.kind === "validation" && error.field === "note") clearError();
              }}
              aria-invalid={Boolean(noteError)}
              aria-describedby={describedBy("return-note", noteError, true)}
            />
          </Field>
          <ActionError error={error?.kind === "validation" && error.field === "note" ? null : error} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">Отмена</Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner label="Сохраняем" /> : null}
              Вернуть на доработку
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
