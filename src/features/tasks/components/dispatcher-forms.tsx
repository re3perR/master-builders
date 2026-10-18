"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { ActionError } from "@/components/ui/action-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { describedBy, Field, focusFirst } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useClientKey } from "@/hooks/use-client-key";
import type { OverlapItem } from "@/lib/database.types";
import { connectionLost, type AppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/rpc";
import { statusLabels, taskCode } from "@/lib/labels";
import { timeZoneLabel, toLocalInput } from "@/lib/time";
import { cancelTask, reassignTask, rescheduleTask, updateTaskDetails } from "../actions";
import { limits } from "../limits";
import type { CrewChoice, SaveResult, TaskCard } from "../types";
import {
  checkDetails,
  checkReason,
  checkReassign,
  checkReschedule,
  lengthHint,
  type DetailsInput,
  type FieldErrors,
  type ReassignInput,
  type RescheduleInput,
} from "../validation";
import { OverlapNotice } from "./overlap-notice";
import { PriorityField } from "./priority-field";

type FormProps = {
  card: TaskCard;
  available: boolean;
  onDone: (message: string) => void;
};

function useMutation(fieldIds: Record<string, string>) {
  const router = useRouter();
  const clientKey = useClientKey();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<AppError | null>(null);

  function invalid(next: FieldErrors) {
    setErrors(next);
    setFailure(null);
    focusFirst(fieldIds, next);
  }

  function clear(field: string) {
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  function run<T>(request: (key: string) => Promise<ActionResult<T>>, onSuccess: (data: T) => void) {
    setErrors({});
    setFailure(null);
    startTransition(async () => {
      let result: ActionResult<T>;
      try {
        result = await request(clientKey.current());
      } catch {
        startTransition(() => setFailure(connectionLost));
        return;
      }
      startTransition(() => {
        if (result.ok) return onSuccess(result.data);
        const { kind, field, message } = result.error;
        if (kind === "validation" && field && fieldIds[field]) invalid({ [field]: message });
        else setFailure(result.error);
        if (kind === "conflict" || kind === "state" || kind === "not_found") router.refresh();
      });
    });
  }

  function saved() {
    clientKey.reset();
    router.refresh();
  }

  return { pending, errors, failure, invalid, clear, run, saved };
}

function Unavailable({ card, children }: { card: TaskCard; children: ReactNode }) {
  return (
    <Alert variant="warning" title={`Задание сейчас в статусе «${statusLabels[card.status]}»`}>
      {children}
    </Alert>
  );
}

function Footer({
  pending,
  available,
  label,
  pendingLabel,
  danger,
  cancelLabel = "Отмена",
}: {
  pending: boolean;
  available: boolean;
  label: string;
  pendingLabel: string;
  danger?: boolean;
  cancelLabel?: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <DialogClose asChild>
        <Button variant="secondary">{cancelLabel}</Button>
      </DialogClose>
      <Button type="submit" variant={danger ? "danger" : "primary"} disabled={pending || !available}>
        {pending ? pendingLabel : label}
      </Button>
    </div>
  );
}

const editFields = {
  title: "edit-title",
  description: "edit-description",
  priority: "edit-priority-normal",
  address_snapshot: "edit-address",
  access_note_snapshot: "edit-access",
};

export function EditForm({ card, available, onDone }: FormProps) {
  const mutation = useMutation(editFields);
  const [values, setValues] = useState<DetailsInput>({
    title: card.title,
    description: card.description,
    priority: card.priority,
    address_snapshot: card.address_snapshot,
    access_note_snapshot: card.access_note_snapshot ?? "",
  });
  const [unchanged, setUnchanged] = useState(false);

  function update(field: keyof DetailsInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setUnchanged(false);
    mutation.clear(field);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = checkDetails(values);
    if (!checked.ok) return mutation.invalid(checked.errors);
    const next = checked.data;
    if (
      next.title === card.title &&
      next.description === card.description &&
      next.priority === card.priority &&
      next.address_snapshot === card.address_snapshot &&
      next.access_note_snapshot === card.access_note_snapshot
    ) {
      setUnchanged(true);
      return;
    }
    mutation.run(
      (key) => updateTaskDetails(card.id, card.version, values, key),
      (data) => {
        mutation.saved();
        onDone(data.changed ? "Изменения сохранены." : "Изменений нет: данные совпадают с сохранёнными.");
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {!available ? <Unavailable card={card}>Изменять условия можно только до отправки отчёта.</Unavailable> : null}
      {available && card.status !== "Assigned" ? (
        <Alert>Бригада уже приняла задание: изменения будут отмечены в карточке и истории.</Alert>
      ) : null}
      <ActionError error={mutation.failure} />
      <Field
        id="edit-title"
        label="Название"
        required
        error={mutation.errors.title}
        hint={lengthHint(values.title, limits.title)}
      >
        <Input
          id="edit-title"
          value={values.title}
          autoComplete="off"
          aria-invalid={Boolean(mutation.errors.title)}
          aria-describedby={describedBy("edit-title", mutation.errors.title, true)}
          onChange={(event) => update("title", event.target.value)}
        />
      </Field>
      <Field
        id="edit-description"
        label="Описание работ"
        required
        error={mutation.errors.description}
        hint={lengthHint(values.description, limits.description)}
      >
        <Textarea
          id="edit-description"
          rows={5}
          value={values.description}
          aria-invalid={Boolean(mutation.errors.description)}
          aria-describedby={describedBy("edit-description", mutation.errors.description, true)}
          onChange={(event) => update("description", event.target.value)}
        />
      </Field>
      <PriorityField name="edit-priority" value={values.priority} onChange={(value) => update("priority", value)} />
      <Field
        id="edit-address"
        label="Адрес в задании"
        required
        error={mutation.errors.address_snapshot}
        hint="Меняется только в этом задании, карточка объекта остаётся прежней."
      >
        <Input
          id="edit-address"
          value={values.address_snapshot}
          autoComplete="off"
          aria-invalid={Boolean(mutation.errors.address_snapshot)}
          aria-describedby={describedBy("edit-address", mutation.errors.address_snapshot, true)}
          onChange={(event) => update("address_snapshot", event.target.value)}
        />
      </Field>
      <Field id="edit-access" label="Инструкция по доступу" error={mutation.errors.access_note_snapshot}>
        <Textarea
          id="edit-access"
          rows={3}
          value={values.access_note_snapshot}
          aria-invalid={Boolean(mutation.errors.access_note_snapshot)}
          aria-describedby={describedBy("edit-access", mutation.errors.access_note_snapshot)}
          onChange={(event) => update("access_note_snapshot", event.target.value)}
        />
      </Field>
      {unchanged ? <Alert>Изменений нет: данные совпадают с сохранёнными.</Alert> : null}
      <Footer pending={mutation.pending} available={available} label="Сохранить изменения" pendingLabel="Сохраняем…" />
    </form>
  );
}

const rescheduleFields = {
  planned_start: "reschedule-start",
  planned_end: "reschedule-end",
  reason: "reschedule-reason",
};

export function RescheduleForm({ card, available, onDone }: FormProps) {
  const mutation = useMutation(rescheduleFields);
  const [values, setValues] = useState<RescheduleInput>({
    planned_start: toLocalInput(card.planned_start),
    planned_end: toLocalInput(card.planned_end),
    reason: "",
  });
  const [overlaps, setOverlaps] = useState<OverlapItem[] | null>(null);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);

  function update(field: keyof RescheduleInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    mutation.clear(field);
    if (overlaps && field !== "reason") {
      setOverlaps(null);
      setAcknowledged([]);
    }
  }

  function save(acknowledge: string[]) {
    const checked = checkReschedule(values);
    if (!checked.ok) return mutation.invalid(checked.errors);
    if (
      checked.data.planned_start.getTime() === new Date(card.planned_start).getTime() &&
      checked.data.planned_end.getTime() === new Date(card.planned_end).getTime()
    ) {
      return mutation.invalid({ planned_start: "Новые сроки совпадают с текущими." });
    }
    mutation.run(
      (key) => rescheduleTask(card.id, card.version, values, key, acknowledge),
      (data: SaveResult) => {
        if (data.status === "overlaps") {
          setAcknowledged(acknowledge);
          setOverlaps(data.overlaps);
          return;
        }
        mutation.saved();
        onDone("Сроки перенесены.");
      },
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save([]);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {!available ? <Unavailable card={card}>Переносить сроки можно только до отправки отчёта.</Unavailable> : null}
      {available && card.status !== "Assigned" ? (
        <Alert>Бригада уже приняла задание: перенос будет отмечен как изменение условий.</Alert>
      ) : null}
      <ActionError error={mutation.failure} />
      <fieldset>
        <legend className="text-sm font-medium">Новые плановые сроки</legend>
        <p id="reschedule-zone" className="mb-2 text-sm text-ink-muted">
          По поясу компании: {timeZoneLabel()}. Исходные сроки сохранятся в карточке.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="reschedule-start" label="Начало" required error={mutation.errors.planned_start}>
            <Input
              id="reschedule-start"
              type="datetime-local"
              value={values.planned_start}
              min="2000-01-01T00:00"
              max="2100-12-31T23:59"
              aria-invalid={Boolean(mutation.errors.planned_start)}
              aria-describedby={mutation.errors.planned_start ? "reschedule-start-error" : "reschedule-zone"}
              onChange={(event) => update("planned_start", event.target.value)}
            />
          </Field>
          <Field id="reschedule-end" label="Окончание" required error={mutation.errors.planned_end}>
            <Input
              id="reschedule-end"
              type="datetime-local"
              value={values.planned_end}
              min="2000-01-01T00:00"
              max="2100-12-31T23:59"
              aria-invalid={Boolean(mutation.errors.planned_end)}
              aria-describedby={mutation.errors.planned_end ? "reschedule-end-error" : "reschedule-zone"}
              onChange={(event) => update("planned_end", event.target.value)}
            />
          </Field>
        </div>
      </fieldset>
      <Field
        id="reschedule-reason"
        label="Причина переноса"
        required
        error={mutation.errors.reason}
        hint="Причина попадёт в историю задания."
      >
        <Textarea
          id="reschedule-reason"
          rows={3}
          value={values.reason}
          aria-invalid={Boolean(mutation.errors.reason)}
          aria-describedby={describedBy("reschedule-reason", mutation.errors.reason, true)}
          onChange={(event) => update("reason", event.target.value)}
        />
      </Field>
      {overlaps ? (
        <OverlapNotice
          crewName={card.crew.name}
          overlaps={overlaps}
          acknowledged={acknowledged}
          pending={mutation.pending}
          headingLevel="h3"
          onConfirm={() => save(overlaps.map((item) => item.id))}
          onEdit={() => document.getElementById("reschedule-start")?.focus()}
        />
      ) : (
        <Footer pending={mutation.pending} available={available} label="Перенести" pendingLabel="Переносим…" />
      )}
    </form>
  );
}

const reassignFields = { crew_id: "reassign-crew", reason: "reassign-reason" };

export function ReassignForm({ card, available, crews, onDone }: FormProps & { crews: CrewChoice[] }) {
  const mutation = useMutation(reassignFields);
  const [values, setValues] = useState<ReassignInput>({ crew_id: "", reason: "" });
  const [overlaps, setOverlaps] = useState<OverlapItem[] | null>(null);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const options = crews.filter((crew) => crew.id !== card.crew_id);
  const crew = options.find((item) => item.id === values.crew_id);
  const blocked = Boolean(card.open_obstacle);

  function update(field: keyof ReassignInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    mutation.clear(field);
    if (overlaps && field === "crew_id") {
      setOverlaps(null);
      setAcknowledged([]);
    }
  }

  function save(acknowledge: string[]) {
    const checked = checkReassign(values);
    if (!checked.ok) return mutation.invalid(checked.errors);
    mutation.run(
      (key) => reassignTask(card.id, card.version, values, key, acknowledge),
      (data: SaveResult) => {
        if (data.status === "overlaps") {
          setAcknowledged(acknowledge);
          setOverlaps(data.overlaps);
          return;
        }
        mutation.saved();
        onDone(
          crew
            ? `Задание передано бригаде «${crew.name}» и ждёт принятия.`
            : "Задание передано другой бригаде и ждёт принятия.",
        );
      },
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save([]);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {!available ? (
        <Unavailable card={card}>Сменить бригаду можно, пока задание не начато.</Unavailable>
      ) : blocked ? (
        <Alert variant="warning" title="Открыто препятствие">
          Переназначить задание можно после закрытия препятствия. Закройте его с комментарием и повторите.
        </Alert>
      ) : (
        <Alert>
          Задание вернётся в статус «Назначено», новой бригаде нужно будет принять его. Прежний бригадир потеряет к нему
          доступ.
        </Alert>
      )}
      <ActionError error={mutation.failure} />
      {options.length ? (
        <Field
          id="reassign-crew"
          label="Новая бригада"
          required
          error={mutation.errors.crew_id}
          hint={crew?.foreman_name ? `Бригадир: ${crew.foreman_name}` : undefined}
        >
          <Select
            id="reassign-crew"
            value={values.crew_id}
            aria-invalid={Boolean(mutation.errors.crew_id)}
            aria-describedby={describedBy("reassign-crew", mutation.errors.crew_id, crew?.foreman_name)}
            onChange={(event) => update("crew_id", event.target.value)}
          >
            <option value="">Выберите бригаду</option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Alert variant="warning">В подразделении нет других активных бригад.</Alert>
      )}
      <Field
        id="reassign-reason"
        label="Причина переназначения"
        required
        error={mutation.errors.reason}
        hint="Причина попадёт в историю задания."
      >
        <Textarea
          id="reassign-reason"
          rows={3}
          value={values.reason}
          aria-invalid={Boolean(mutation.errors.reason)}
          aria-describedby={describedBy("reassign-reason", mutation.errors.reason, true)}
          onChange={(event) => update("reason", event.target.value)}
        />
      </Field>
      {overlaps ? (
        <OverlapNotice
          crewName={crew?.name ?? null}
          overlaps={overlaps}
          acknowledged={acknowledged}
          pending={mutation.pending}
          editLabel="Выбрать другую бригаду"
          headingLevel="h3"
          onConfirm={() => save(overlaps.map((item) => item.id))}
          onEdit={() => document.getElementById("reassign-crew")?.focus()}
        />
      ) : (
        <Footer
          pending={mutation.pending}
          available={available && !blocked && options.length > 0}
          label="Переназначить"
          pendingLabel="Переназначаем…"
        />
      )}
    </form>
  );
}

export function CancelForm({ card, available, onDone }: FormProps) {
  const mutation = useMutation({ reason: "cancel-reason" });
  const [reason, setReason] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = checkReason({ reason });
    if (!checked.ok) return mutation.invalid(checked.errors);
    mutation.run(
      (key) => cancelTask(card.id, card.version, reason, key),
      () => {
        mutation.saved();
        onDone("Задание отменено.");
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {available ? (
        <Alert variant="warning" title="Отмена необратима">
          <ul className="flex list-disc flex-col gap-0.5 pl-4">
            <li>
              {taskCode(card.number)} получит статус «Отменено» без приёмки результата, вернуть его в работу будет
              нельзя.
            </li>
            {card.open_obstacle ? <li>Открытое препятствие закроется с указанной причиной.</li> : null}
            {card.pending_report ? <li>Отчёт на проверке получит отметку «Отменён вместе с заданием».</li> : null}
            <li>Для повторной работы можно будет создать новое задание на основе этого.</li>
          </ul>
        </Alert>
      ) : (
        <Unavailable card={card}>Отменить можно только незавершённое задание.</Unavailable>
      )}
      <ActionError error={mutation.failure} />
      <Field
        id="cancel-reason"
        label="Причина отмены"
        required
        error={mutation.errors.reason}
        hint="Причину увидят бригадир и руководитель."
      >
        <Textarea
          id="cancel-reason"
          rows={3}
          value={reason}
          aria-invalid={Boolean(mutation.errors.reason)}
          aria-describedby={describedBy("cancel-reason", mutation.errors.reason, true)}
          onChange={(event) => {
            setReason(event.target.value);
            mutation.clear("reason");
          }}
        />
      </Field>
      <Footer
        pending={mutation.pending}
        available={available}
        label="Отменить задание"
        pendingLabel="Отменяем…"
        cancelLabel="Не отменять"
        danger
      />
    </form>
  );
}
