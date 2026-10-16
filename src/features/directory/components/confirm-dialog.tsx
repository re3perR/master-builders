"use client";

import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import type { AppError } from "@/lib/errors";

type ConfirmDialogProps = {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  tone?: "primary" | "danger";
  onConfirm: () => Promise<AppError | null>;
};

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  tone = "primary",
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeOpen(next: boolean) {
    if (pending) return;
    setOpen(next);
    setError(null);
  }

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const failure = await onConfirm();
      if (failure) setError(failure.message);
      else setOpen(false);
    } catch {
      setError("Нет связи с сервером. Ничего не изменилось, попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description}>
        {error ? (
          <Alert variant="danger" className="mb-4">
            {error}
          </Alert>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Отмена
            </Button>
          </DialogClose>
          <Button variant={tone} onClick={confirm} disabled={pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
