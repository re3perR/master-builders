"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { ActionError } from "@/components/ui/action-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { describedBy, Field, focusFirst } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useClientKey } from "@/hooks/use-client-key";
import type { OverlapItem } from "@/lib/database.types";
import { connectionLost, type AppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/rpc";
import { createTask } from "../actions";
import type { CrewChoice, SaveResult, SiteChoice } from "../types";
import { checkTaskDraft, type FieldErrors, type TaskDraftInput } from "../validation";
import { OverlapNotice } from "./overlap-notice";
import { PriorityField } from "./priority-field";

const fieldIds: Record<string, string> = {
  title: "task-title",
  description: "task-description",
  site_id: "task-site",
  crew_id: "task-crew",
  priority: "task-priority-normal",
  planned_start: "task-start",
  planned_end: "task-end",
};

type TaskFormProps = {
  defaults: TaskDraftInput;
  sites: SiteChoice[];
  crews: CrewChoice[];
  sourceTaskId: string | null;
  cancelHref: string;
  timeZone: string;
};

export function TaskForm({ defaults, sites, crews, sourceTaskId, cancelHref, timeZone }: TaskFormProps) {
  const router = useRouter();
  const clientKey = useClientKey();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(defaults);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<AppError | null>(null);
  const [overlaps, setOverlaps] = useState<OverlapItem[] | null>(null);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);

  const site = sites.find((item) => item.id === values.site_id);
  const crew = crews.find((item) => item.id === values.crew_id);

  function update(field: keyof TaskDraftInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    if (overlaps && (field === "crew_id" || field === "planned_start" || field === "planned_end")) {
      setOverlaps(null);
      setAcknowledged([]);
    }
  }

  function save(acknowledge: string[]) {
    const checked = checkTaskDraft(values);
    if (!checked.ok) {
      setErrors(checked.errors);
      focusFirst(fieldIds, checked.errors);
      return;
    }
    setErrors({});
    setFailure(null);
    startTransition(async () => {
      let result: ActionResult<SaveResult>;
      try {
        result = await createTask(values, clientKey.current(), acknowledge, sourceTaskId);
      } catch {
        startTransition(() => setFailure(connectionLost));
        return;
      }
      startTransition(() => {
        if (!result.ok) {
          const field = result.error.field;
          if (result.error.kind === "validation" && field && fieldIds[field]) {
            setErrors({ [field]: result.error.message });
            focusFirst(fieldIds, { [field]: result.error.message });
          } else {
            setFailure(result.error);
          }
          return;
        }
        if (result.data.status === "overlaps") {
          setAcknowledged(acknowledge);
          setOverlaps(result.data.overlaps);
          return;
        }
        clientKey.reset();
        router.push(`/tasks/${result.data.taskId}`);
      });
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save([]);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <ActionError error={failure} />

      <Field
        id="task-title"
        label="Название"
        required
        error={errors.title}
        hint={`${values.title.trim().length} из 160 символов, минимум 3`}
      >
        <Input
          id="task-title"
          value={values.title}
          autoComplete="off"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={describedBy("task-title", errors.title, true)}
          onChange={(event) => update("title", event.target.value)}
        />
      </Field>

      <Field
        id="task-description"
        label="Описание работ"
        required
        error={errors.description}
        hint={`${values.description.trim().length} из 5000 символов, минимум 10`}
      >
        <Textarea
          id="task-description"
          rows={6}
          value={values.description}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={describedBy("task-description", errors.description, true)}
          onChange={(event) => update("description", event.target.value)}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="task-site"
          label="Объект"
          required
          error={errors.site_id}
          hint={site ? `Адрес: ${site.address}` : "Адрес и инструкция по доступу перенесутся в задание."}
        >
          <Select
            id="task-site"
            value={values.site_id}
            aria-invalid={Boolean(errors.site_id)}
            aria-describedby={describedBy("task-site", errors.site_id, true)}
            onChange={(event) => update("site_id", event.target.value)}
          >
            <option value="">Выберите объект</option>
            {sites.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          id="task-crew"
          label="Бригада"
          required
          error={errors.crew_id}
          hint={crew?.foreman_name ? `Бригадир: ${crew.foreman_name}` : "Задание сразу появится у бригадира."}
        >
          <Select
            id="task-crew"
            value={values.crew_id}
            aria-invalid={Boolean(errors.crew_id)}
            aria-describedby={describedBy("task-crew", errors.crew_id, true)}
            onChange={(event) => update("crew_id", event.target.value)}
          >
            <option value="">Выберите бригаду</option>
            {crews.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {site?.access_note ? (
        <p className="-mt-2 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink-muted">
          <span className="font-medium text-ink">Доступ на объект: </span>
          {site.access_note}
        </p>
      ) : null}

      <PriorityField name="task-priority" value={values.priority} onChange={(value) => update("priority", value)} />

      <fieldset>
        <legend className="text-sm font-medium">Плановые сроки</legend>
        <p id="task-time-zone" className="mb-2 text-sm text-ink-muted">
          Время указывается по поясу компании: {timeZone}. Начало должно быть раньше окончания.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="task-start" label="Начало" required error={errors.planned_start}>
            <Input
              id="task-start"
              type="datetime-local"
              value={values.planned_start}
              min="2000-01-01T00:00"
              max="2100-12-31T23:59"
              aria-invalid={Boolean(errors.planned_start)}
              aria-describedby={errors.planned_start ? "task-start-error" : "task-time-zone"}
              onChange={(event) => update("planned_start", event.target.value)}
            />
          </Field>
          <Field id="task-end" label="Окончание" required error={errors.planned_end}>
            <Input
              id="task-end"
              type="datetime-local"
              value={values.planned_end}
              min="2000-01-01T00:00"
              max="2100-12-31T23:59"
              aria-invalid={Boolean(errors.planned_end)}
              aria-describedby={errors.planned_end ? "task-end-error" : "task-time-zone"}
              onChange={(event) => update("planned_end", event.target.value)}
            />
          </Field>
        </div>
      </fieldset>

      {overlaps ? (
        <OverlapNotice
          crewName={crew?.name ?? null}
          overlaps={overlaps}
          acknowledged={acknowledged}
          pending={pending}
          onConfirm={() => save(overlaps.map((item) => item.id))}
          onEdit={() => document.getElementById("task-start")?.focus()}
        />
      ) : (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link href={cancelHref} className={buttonVariants({ variant: "secondary" })}>
            Отмена
          </Link>
          <Button type="submit" disabled={pending}>
            {pending ? "Создаём…" : "Создать задание"}
          </Button>
        </div>
      )}
    </form>
  );
}
