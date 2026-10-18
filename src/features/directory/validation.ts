import { textLength } from "@/lib/validation";
import { limits, memberLimit } from "./types";

export type SiteValues = {
  name: string;
  address: string;
  accessNote: string;
  contact: string;
};

export type SiteErrors = Partial<Record<keyof SiteValues, string>>;

export function validateSite(values: SiteValues): SiteErrors {
  const errors: SiteErrors = {};
  const name = textLength(values.name);
  const address = textLength(values.address);

  if (!name) errors.name = "Укажите название объекта.";
  else if (name < limits.siteName.min || name > limits.siteName.max)
    errors.name = `Название: от ${limits.siteName.min} до ${limits.siteName.max} символов.`;

  if (!address) errors.address = "Укажите адрес объекта.";
  else if (address < limits.address.min || address > limits.address.max)
    errors.address = `Адрес: от ${limits.address.min} до ${limits.address.max} символов.`;

  if (textLength(values.accessNote) > limits.accessNote.max)
    errors.accessNote = `Примечание о доступе: не больше ${limits.accessNote.max} символов.`;

  if (textLength(values.contact) > limits.contact.max)
    errors.contact = `Контакт: не больше ${limits.contact.max} символов.`;

  return errors;
}

export function validateCrewName(value: string) {
  const length = textLength(value);
  if (!length) return "Укажите название бригады.";
  if (length < limits.crewName.min || length > limits.crewName.max)
    return `Название: от ${limits.crewName.min} до ${limits.crewName.max} символов.`;
  return null;
}

export function validateMember(value: string) {
  return textLength(value) > limits.memberName.max ? `Не больше ${limits.memberName.max} символов.` : null;
}

export function validateMemberCount(count: number) {
  return count > memberLimit ? `В составе может быть не больше ${memberLimit} человек.` : null;
}
