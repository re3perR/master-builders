"use client";

import { Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useClientKey } from "@/hooks/use-client-key";
import type { AppError } from "@/lib/errors";
import { updateCrew } from "../actions";
import { memberLimit, type CrewCard } from "../types";
import { validateCrewName, validateMember, validateMemberCount } from "../validation";

type CrewFormProps = {
  crew: CrewCard["crew"];
  members: CrewCard["members"];
  onSaved: (changed: boolean) => void;
};

type Row = { key: string; value: string };

const nameId = "crew-name";
const addId = "crew-member-add";
const hintId = "crew-members-hint";
const memberId = (row: Row) => `crew-member-${row.key}`;

export function CrewFormDialog({ crew, members, onSaved }: CrewFormProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Pencil aria-hidden className="size-4" />
          Изменить
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent
          title="Изменить бригаду"
          description="Название и состав видят диспетчер, руководитель и бригадир. Задания бригады не меняются."
        >
          <CrewForm
            crew={crew}
            members={members}
            onSaved={(changed) => {
              setOpen(false);
              onSaved(changed);
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function CrewForm({ crew, members, onSaved }: CrewFormProps) {
  const router = useRouter();
  const key = useClientKey();
  const [name, setName] = useState(crew.name);
  const [rows, setRows] = useState<Row[]>(() => members.map((member) => ({ key: member.id, value: member.name })));
  const [nameError, setNameError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [membersError, setMembersError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [base, setBase] = useState(crew.updated_at);
  const [conflict, setConflict] = useState(false);

  if (conflict && crew.updated_at !== base) {
    setBase(crew.updated_at);
  }

  const full = rows.length >= memberLimit;

  function changeName(value: string) {
    key.reset();
    setName(value);
    setNameError(null);
  }

  function changeRow(row: Row, value: string) {
    key.reset();
    setRows((current) => current.map((item) => (item.key === row.key ? { ...item, value } : item)));
    if (rowErrors[row.key]) {
      setRowErrors((current) => {
        const next = { ...current };
        delete next[row.key];
        return next;
      });
    }
  }

  function addRow() {
    if (full) return;
    const row = { key: crypto.randomUUID(), value: "" };
    key.reset();
    setMembersError(null);
    flushSync(() => setRows((current) => [...current, row]));
    document.getElementById(memberId(row))?.focus();
  }

  function removeRow(index: number) {
    const next = rows.filter((_, position) => position !== index);
    key.reset();
    setMembersError(null);
    flushSync(() => setRows(next));
    const target = next[index] ?? next[index - 1];
    document.getElementById(target ? memberId(target) : addId)?.focus();
  }

  function showError(error: AppError) {
    if (error.kind === "validation" && error.field === "name") {
      setNameError(error.message);
      document.getElementById(nameId)?.focus();
      return;
    }
    if (error.kind === "validation" && error.field === "members") {
      setMembersError(error.message);
      return;
    }
    if (error.kind === "conflict") {
      setConflict(true);
      setFormError(
        "Пока вы редактировали, бригаду изменил другой пользователь. Данные на странице обновлены: проверьте их и сохраните ещё раз, если ваши правки всё ещё нужны.",
      );
      router.refresh();
      return;
    }
    setFormError(error.message);
    if (error.kind === "state" || error.kind === "not_found") router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nameProblem = validateCrewName(name);
    const problems: Record<string, string> = {};
    for (const row of rows) {
      const problem = validateMember(row.value);
      if (problem) problems[row.key] = problem;
    }
    const names = rows.map((row) => row.value.trim()).filter(Boolean);
    const countProblem = validateMemberCount(names.length);
    setNameError(nameProblem);
    setRowErrors(problems);
    setMembersError(countProblem);

    const invalidRow = rows.find((row) => problems[row.key]);
    if (nameProblem || invalidRow || countProblem) {
      document.getElementById(nameProblem ? nameId : invalidRow ? memberId(invalidRow) : addId)?.focus();
      return;
    }

    setPending(true);
    setFormError(null);
    try {
      const result = await updateCrew({
        crewId: crew.id,
        name: name.trim(),
        members: names,
        clientKey: key.current(),
        expectedUpdatedAt: base,
      });
      if (!result.ok) return showError(result.error);
      key.reset();
      setConflict(false);
      onSaved(result.data.changed);
      router.refresh();
    } catch {
      setFormError("Нет связи с сервером. Введённые данные сохранены в форме, попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError ? <Alert variant={conflict ? "warning" : "danger"}>{formError}</Alert> : null}
      <Field id={nameId} label="Название бригады" required error={nameError}>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => changeName(event.target.value)}
          autoComplete="off"
          aria-invalid={Boolean(nameError)}
          aria-describedby={describedBy(nameId, nameError)}
        />
      </Field>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="text-sm font-medium text-ink">Состав</legend>
        <p id={hintId} className="text-sm text-ink-muted">
          Имя или рабочее обозначение, например «Монтажник — А. Волков». Телефоны и другие личные данные не нужны.
        </p>
        {rows.length ? (
          <ol className="flex flex-col gap-2">
            {rows.map((row, index) => {
              const id = memberId(row);
              const problem = rowErrors[row.key];
              return (
                <li key={row.key} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <label htmlFor={id} className="tabular w-7 shrink-0 text-right text-sm text-ink-muted">
                      <span className="sr-only">Участник </span>
                      {index + 1}.
                    </label>
                    <Input
                      id={id}
                      value={row.value}
                      onChange={(event) => changeRow(row, event.target.value)}
                      autoComplete="off"
                      aria-invalid={Boolean(problem)}
                      aria-describedby={problem ? `${id}-error` : hintId}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(index)}
                      aria-label={`Убрать участника ${index + 1}`}
                      className="shrink-0 text-ink-muted"
                    >
                      <X aria-hidden className="size-5" />
                    </Button>
                  </div>
                  {problem ? (
                    <p id={`${id}-error`} role="alert" className="pl-9 text-sm text-danger">
                      {problem}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-ink-muted">В составе пока никого нет.</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button id={addId} variant="secondary" onClick={addRow} disabled={full}>
            <Plus aria-hidden className="size-4" />
            Добавить участника
          </Button>
          <span className="tabular text-sm text-ink-muted" aria-live="polite">
            {full ? `Достигнут предел: ${memberLimit} человек` : `${rows.length} из ${memberLimit}`}
          </span>
        </div>
        {membersError ? (
          <p role="alert" className="text-sm text-danger">
            {membersError}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="secondary" disabled={pending}>
            Отмена
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </Button>
      </div>
    </form>
  );
}
