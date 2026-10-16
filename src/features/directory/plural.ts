const rules = new Intl.PluralRules("ru-RU");

export function plural(count: number, one: string, few: string, many: string) {
  const form = rules.select(count);
  return `${count} ${form === "one" ? one : form === "few" ? few : many}`;
}
