"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useClientKey } from "@/hooks/use-client-key";
import type { Site } from "@/lib/database.types";
import type { AppError } from "@/lib/errors";
import { createSite, updateSite } from "../actions";
import { limits } from "../types";
import { textLength, validateSite, type SiteErrors, type SiteValues } from "../validation";

type EditableSite = Pick<Site, "id" | "name" | "address" | "access_note" | "contact" | "updated_at">;

const fieldIds: Record<keyof SiteValues, string> = {
  name: "site-name",
  address: "site-address",
  accessNote: "site-access-note",
  contact: "site-contact",
};

const serverFields: Record<string, keyof SiteValues> = {
  name: "name",
  address: "address",
  access_note: "accessNote",
  contact: "contact",
};

export function SiteFormDialog({ site, onSaved }: { site?: EditableSite; onSaved?: (changed: boolean) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {site ? (
          <Button variant="secondary">
            <Pencil aria-hidden className="size-4" />
            Изменить
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden className="size-4" />
            Новый объект
          </Button>
        )}
      </DialogTrigger>
      {open ? (
        <DialogContent
          title={site ? "Изменить объект" : "Новый объект"}
          description={
            site
              ? "Правка объекта не меняет адреса и инструкции в уже созданных заданиях."
              : "Объект появится в выборе при создании заданий вашего подразделения."
          }
        >
          <SiteForm
            site={site}
            onSaved={(changed) => {
              setOpen(false);
              onSaved?.(changed);
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function SiteForm({ site, onSaved }: { site?: EditableSite; onSaved: (changed: boolean) => void }) {
  const router = useRouter();
  const key = useClientKey();
  const [navigating, startNavigation] = useTransition();
  const [values, setValues] = useState<SiteValues>({
    name: site?.name ?? "",
    address: site?.address ?? "",
    accessNote: site?.access_note ?? "",
    contact: site?.contact ?? "",
  });
  const [errors, setErrors] = useState<SiteErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [base, setBase] = useState(site?.updated_at ?? null);
  const [conflict, setConflict] = useState(false);

  if (conflict && site && site.updated_at !== base) {
    setBase(site.updated_at);
  }

  function change(field: keyof SiteValues, value: string) {
    key.reset();
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function showError(error: AppError) {
    const field = error.kind === "validation" && error.field ? serverFields[error.field] : undefined;
    if (field) {
      setErrors({ [field]: error.message });
      document.getElementById(fieldIds[field])?.focus();
      return;
    }
    if (error.kind === "conflict") {
      setConflict(true);
      setFormError(
        "Пока вы редактировали, объект изменил другой пользователь. Данные на странице обновлены: проверьте их и сохраните ещё раз, если ваши правки всё ещё нужны.",
      );
      router.refresh();
      return;
    }
    setFormError(error.message);
    if (error.kind === "state" || error.kind === "not_found") router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateSite(values);
    setErrors(found);
    const invalid = (Object.keys(fieldIds) as (keyof SiteValues)[]).find((field) => found[field]);
    if (invalid) {
      document.getElementById(fieldIds[invalid])?.focus();
      return;
    }

    setPending(true);
    setFormError(null);
    const payload = {
      name: values.name.trim(),
      address: values.address.trim(),
      accessNote: values.accessNote.trim(),
      contact: values.contact.trim(),
      clientKey: key.current(),
    };
    try {
      if (site) {
        const result = await updateSite({ ...payload, siteId: site.id, expectedUpdatedAt: base });
        if (!result.ok) return showError(result.error);
        key.reset();
        setConflict(false);
        onSaved(result.data.changed);
        router.refresh();
      } else {
        const result = await createSite(payload);
        if (!result.ok) return showError(result.error);
        key.reset();
        startNavigation(() => router.push(`/sites/${result.data.siteId}`));
      }
    } catch {
      setFormError("Нет связи с сервером. Введённые данные сохранены в форме, попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  const busy = pending || navigating;
  const noteHint = `Как попасть на объект: пропуск, ключи, часы работ. ${textLength(values.accessNote)} из ${limits.accessNote.max}.`;
  const contactHint = "Рабочий контакт на объекте, например «Прораб заказчика, +7 900 000-00-00».";
  const addressHint = site
    ? "Задания, созданные раньше, сохранят прежний адрес — его правят в самом задании."
    : undefined;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError ? <Alert variant={conflict ? "warning" : "danger"}>{formError}</Alert> : null}
      <Field id={fieldIds.name} label="Название" required error={errors.name}>
        <Input
          id={fieldIds.name}
          value={values.name}
          onChange={(event) => change("name", event.target.value)}
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={describedBy(fieldIds.name, errors.name)}
        />
      </Field>
      <Field id={fieldIds.address} label="Адрес" required error={errors.address} hint={addressHint}>
        <Input
          id={fieldIds.address}
          value={values.address}
          onChange={(event) => change("address", event.target.value)}
          autoComplete="off"
          aria-invalid={Boolean(errors.address)}
          aria-describedby={describedBy(fieldIds.address, errors.address, addressHint)}
        />
      </Field>
      <Field id={fieldIds.accessNote} label="Примечание о доступе" error={errors.accessNote} hint={noteHint}>
        <Textarea
          id={fieldIds.accessNote}
          value={values.accessNote}
          onChange={(event) => change("accessNote", event.target.value)}
          rows={4}
          aria-invalid={Boolean(errors.accessNote)}
          aria-describedby={describedBy(fieldIds.accessNote, errors.accessNote, noteHint)}
        />
      </Field>
      <Field id={fieldIds.contact} label="Рабочий контакт" error={errors.contact} hint={contactHint}>
        <Input
          id={fieldIds.contact}
          value={values.contact}
          onChange={(event) => change("contact", event.target.value)}
          autoComplete="off"
          aria-invalid={Boolean(errors.contact)}
          aria-describedby={describedBy(fieldIds.contact, errors.contact, contactHint)}
        />
      </Field>
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="secondary" disabled={busy}>
            Отмена
          </Button>
        </DialogClose>
        <Button type="submit" disabled={busy}>
          {busy ? "Сохраняем…" : site ? "Сохранить" : "Создать объект"}
        </Button>
      </div>
    </form>
  );
}
