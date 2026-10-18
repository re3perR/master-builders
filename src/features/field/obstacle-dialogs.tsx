"use client";

import { AlertOctagon, CircleCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ActionError } from "@/components/ui/action-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ObstacleCategory } from "@/lib/database.types";
import type { AppError } from "@/lib/errors";
import { obstacleLabels } from "@/lib/labels";
import { textLength } from "@/lib/validation";
import { closeObstacle, openObstacle } from "./actions";
import { useTaskAction } from "./use-task-action";

const categories: ObstacleCategory[] = ["access", "materials", "equipment", "other"];

function fieldError(error: AppError | null, field: string) {
  return error?.kind === "validation" && error.field === field ? error.message : null;
}

function generalError(error: AppError | null, fields: string[]) {
  return error?.kind === "validation" && error.field && fields.includes(error.field) ? null : error;
}

function lengthOk(value: string) {
  const length = textLength(value);
  return length >= 3 && length <= 2000;
}

export function OpenObstacleDialog({ taskId, version }: { taskId: string; version: number }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ObstacleCategory | null>(null);
  const [reason, setReason] = useState("");
  const [problems, setProblems] = useState<{ category?: string; reason?: string }>({});
  const { run, pending, error, clearError } = useTaskAction();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = {
      category: category ? undefined : "Выберите категорию.",
      reason: lengthOk(reason) ? undefined : "Опишите причину: от 3 до 2000 символов.",
    };
    setProblems(next);
    if (!category || next.reason) return;
    run(
      (clientKey) => openObstacle({ taskId, version, category, reason, clientKey }),
      () => {
        setOpen(false);
        setCategory(null);
        setReason("");
      },
    );
  }

  const categoryError = problems.category ?? fieldError(error, "category");
  const reasonError = problems.reason ?? fieldError(error, "reason");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          clearError();
          setProblems({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" className="w-full sm:w-auto">
          <AlertOctagon aria-hidden className="size-4" />
          Сообщить о препятствии
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Сообщить о препятствии"
        description="Статус и срок задания не меняются. Пока препятствие открыто, отчёт отправить нельзя."
      >
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <fieldset aria-describedby={categoryError ? "obstacle-category-error" : undefined}>
            <legend className="mb-1.5 text-sm font-medium">
              Категория<span className="text-ink-muted"> *</span>
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((value) => (
                <label
                  key={value}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-field px-3 text-[15px] has-checked:border-ink has-checked:bg-canvas has-checked:font-medium"
                >
                  <input
                    type="radio"
                    name="category"
                    value={value}
                    checked={category === value}
                    onChange={() => {
                      setCategory(value);
                      setProblems((current) => ({ ...current, category: undefined }));
                      if (fieldError(error, "category")) clearError();
                    }}
                    className="size-4 accent-ink"
                  />
                  {obstacleLabels[value]}
                </label>
              ))}
            </div>
            {categoryError ? (
              <p id="obstacle-category-error" role="alert" className="mt-1.5 text-sm text-danger">
                {categoryError}
              </p>
            ) : null}
          </fieldset>
          <Field
            id="obstacle-reason"
            label="Причина"
            required
            error={reasonError}
            hint="Что мешает работе и что нужно, чтобы продолжить."
          >
            <Textarea
              id="obstacle-reason"
              rows={4}
              maxLength={2000}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setProblems((current) => ({ ...current, reason: undefined }));
                if (fieldError(error, "reason")) clearError();
              }}
              aria-invalid={Boolean(reasonError)}
              aria-describedby={describedBy("obstacle-reason", reasonError, true)}
            />
          </Field>
          <ActionError error={generalError(error, ["category", "reason"])} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">Отмена</Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner label="Сохраняем" /> : null}
              Сообщить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CloseObstacleDialog({ taskId, version }: { taskId: string; version: number }) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const { run, pending, error, clearError } = useTaskAction();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lengthOk(comment)) {
      setProblem("Напишите комментарий: от 3 до 2000 символов.");
      return;
    }
    setProblem(null);
    run(
      (clientKey) => closeObstacle({ taskId, version, comment, clientKey }),
      () => {
        setOpen(false);
        setComment("");
      },
    );
  }

  const commentError = problem ?? fieldError(error, "comment");

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
          <CircleCheck aria-hidden className="size-4" />
          Закрыть препятствие
        </Button>
      </DialogTrigger>
      <DialogContent title="Закрыть препятствие" description="Комментарий попадёт в историю задания.">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field
            id="obstacle-comment"
            label="Как решили проблему"
            required
            error={commentError}
            hint="Например: материалы привезли, доступ открыт."
          >
            <Textarea
              id="obstacle-comment"
              rows={3}
              maxLength={2000}
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
                setProblem(null);
                if (fieldError(error, "comment")) clearError();
              }}
              aria-invalid={Boolean(commentError)}
              aria-describedby={describedBy("obstacle-comment", commentError, true)}
            />
          </Field>
          <ActionError error={generalError(error, ["comment"])} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">Отмена</Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner label="Сохраняем" /> : null}
              Закрыть препятствие
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
