import { z } from "zod";
import type { TaskPriority } from "@/lib/database.types";
import { fromLocalInput } from "@/lib/time";
import { textLength } from "@/lib/validation";
import { limits } from "./limits";

export type FieldErrors = Partial<Record<string, string>>;

type Checked<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

type Limit = { min: number; max: number };

function text({ min, max }: Limit, message: string) {
  return z
    .string(message)
    .trim()
    .refine((value) => {
      const length = textLength(value);
      return length >= min && length <= max;
    }, message);
}

export function lengthHint(value: string, { min, max }: Limit) {
  return `${textLength(value)} из ${max} символов, минимум ${min}`;
}

const title = text(limits.title, `Название: от ${limits.title.min} до ${limits.title.max} символов.`);
const description = text(
  limits.description,
  `Описание: от ${limits.description.min} до ${limits.description.max} символов.`,
);
const reason = text(limits.reason, `Укажите причину: от ${limits.reason.min} до ${limits.reason.max} символов.`);
const accessNoteMessage = `Инструкция по доступу: не больше ${limits.accessNote.max} символов.`;
const priority = z.enum(["low", "normal", "high"], "Выберите приоритет.");

const draftSchema = z.object({
  title,
  description,
  site_id: z.guid("Выберите объект."),
  crew_id: z.guid("Выберите бригаду."),
  priority,
});

const detailsSchema = z.object({
  title,
  description,
  priority,
  address_snapshot: text(limits.address, `Адрес: от ${limits.address.min} до ${limits.address.max} символов.`),
  access_note_snapshot: z
    .string(accessNoteMessage)
    .trim()
    .refine((value) => textLength(value) <= limits.accessNote.max, accessNoteMessage),
});

const reasonSchema = z.object({ reason });

const reassignSchema = z.object({ crew_id: z.guid("Выберите бригаду."), reason });

export type TaskDraftInput = {
  title: string;
  description: string;
  site_id: string;
  crew_id: string;
  priority: string;
  planned_start: string;
  planned_end: string;
};

export type DetailsInput = {
  title: string;
  description: string;
  priority: string;
  address_snapshot: string;
  access_note_snapshot: string;
};

export type RescheduleInput = { planned_start: string; planned_end: string; reason: string };

export type ReassignInput = { crew_id: string; reason: string };

function collect(error: z.ZodError | undefined, errors: FieldErrors = {}) {
  for (const issue of error?.issues ?? []) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

function sensible(date: Date | null): date is Date {
  return date !== null && date.getUTCFullYear() >= 2000 && date.getUTCFullYear() <= 2100;
}

function checkInterval(start: unknown, end: unknown, errors: FieldErrors) {
  const startDate = typeof start === "string" && start ? fromLocalInput(start) : null;
  const endDate = typeof end === "string" && end ? fromLocalInput(end) : null;
  if (!start) errors.planned_start ??= "Укажите дату и время начала.";
  else if (!sensible(startDate)) errors.planned_start ??= "Проверьте дату и время начала.";
  if (!end) errors.planned_end ??= "Укажите дату и время окончания.";
  else if (!sensible(endDate)) errors.planned_end ??= "Проверьте дату и время окончания.";
  if (!sensible(startDate) || !sensible(endDate)) return null;
  if (startDate.getTime() >= endDate.getTime()) {
    errors.planned_end ??= "Окончание должно быть позже начала.";
    return null;
  }
  return { start: startDate, end: endDate };
}

export function checkTaskDraft(input: TaskDraftInput): Checked<{
  title: string;
  description: string;
  site_id: string;
  crew_id: string;
  priority: TaskPriority;
  planned_start: Date;
  planned_end: Date;
}> {
  const parsed = draftSchema.safeParse(input);
  const errors = collect(parsed.error);
  const interval = checkInterval(input.planned_start, input.planned_end, errors);
  if (!parsed.success || !interval) return { ok: false, errors };
  return { ok: true, data: { ...parsed.data, planned_start: interval.start, planned_end: interval.end } };
}

export function checkDetails(input: DetailsInput): Checked<{
  title: string;
  description: string;
  priority: TaskPriority;
  address_snapshot: string;
  access_note_snapshot: string | null;
}> {
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: collect(parsed.error) };
  return { ok: true, data: { ...parsed.data, access_note_snapshot: parsed.data.access_note_snapshot || null } };
}

export function checkReschedule(input: RescheduleInput): Checked<{
  planned_start: Date;
  planned_end: Date;
  reason: string;
}> {
  const parsed = reasonSchema.safeParse(input);
  const errors = collect(parsed.error);
  const interval = checkInterval(input.planned_start, input.planned_end, errors);
  if (!parsed.success || !interval) return { ok: false, errors };
  return { ok: true, data: { reason: parsed.data.reason, planned_start: interval.start, planned_end: interval.end } };
}

export function checkReassign(input: ReassignInput): Checked<{ crew_id: string; reason: string }> {
  const parsed = reassignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: collect(parsed.error) };
  return { ok: true, data: parsed.data };
}

export function checkReason(input: { reason: string }): Checked<{ reason: string }> {
  const parsed = reasonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: collect(parsed.error) };
  return { ok: true, data: parsed.data };
}
