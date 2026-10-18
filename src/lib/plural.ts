const rules = new Intl.PluralRules("ru-RU");

export type PluralForms = [one: string, few: string, many: string];

export function pluralForm(count: number, [one, few, many]: PluralForms) {
  const form = rules.select(count);
  return form === "one" ? one : form === "few" ? few : many;
}

export function countLabel(count: number, forms: PluralForms) {
  return `${count} ${pluralForm(count, forms)}`;
}
