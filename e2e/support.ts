import { test as base, expect, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";

export const password = process.env.E2E_PASSWORD ?? "demo-pass-2026";

export const accounts = {
  dispatcher: "dispatcher.north@demo.local",
  manager: "manager.north@demo.local",
  petrov: "foreman.petrov@demo.local",
  lebedev: "foreman.lebedev@demo.local",
  gusev: "foreman.gusev@demo.local",
  dispatcherSouth: "dispatcher.south@demo.local",
  managerSouth: "manager.south@demo.local",
};

export const crews = {
  petrov: "Бригада монтажа №1",
  lebedev: "Бригада отделки №2",
};

export const siteName = "ЖК «Северный парк», корпус 2";

export const taskDescription = "Монтаж кабельных лотков на третьем этаже, проверка креплений.";

export const test = base.extend<{ createdTasks: string[] }>({
  createdTasks: async ({ page }, provide) => {
    const urls: string[] = [];
    await provide(urls);
    if (urls.length) await cancelOpenTasks(page, urls);
  },
});

export async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Выйти" }).first().click();
  await expect(page).toHaveURL(/\/login/);
}

export function uniqueTitle(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function hash(text: string) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  }
  return value >>> 0;
}

export function farDay(seed: string) {
  const offset = 300 + (hash(seed) % 400);
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

export type TaskDraft = {
  title: string;
  crew: string;
  day: string;
  start: string;
  end: string;
  priority?: "Низкий" | "Обычный" | "Высокий";
};

export async function fillTaskForm(page: Page, draft: TaskDraft) {
  await page.goto("/tasks/new");
  await page.getByLabel("Название").fill(draft.title);
  await page.getByLabel("Описание работ").fill(taskDescription);
  await page.getByLabel("Объект").selectOption({ label: siteName });
  await page.getByLabel("Бригада").selectOption({ label: draft.crew });
  const priority = page.getByRole("group", { name: "Приоритет" });
  await priority.getByText(draft.priority ?? "Обычный", { exact: true }).click();
  await expect(priority.getByRole("radio", { name: draft.priority ?? "Обычный" })).toBeChecked();
  await page.getByLabel("Начало").fill(`${draft.day}T${draft.start}`);
  await page.getByLabel("Окончание").fill(`${draft.day}T${draft.end}`);
}

export async function expectTaskCard(page: Page, title: string) {
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return new URL(page.url()).pathname;
}

export async function createTask(page: Page, draft: TaskDraft) {
  await fillTaskForm(page, draft);
  await page.getByRole("button", { name: "Создать задание" }).click();
  return expectTaskCard(page, draft.title);
}

export function taskIdOf(url: string) {
  return url.replace("/tasks/", "");
}

export function taskStatus(page: Page, label: string) {
  return page.getByRole("main").getByText(label, { exact: true }).first();
}

export async function acceptAndStart(page: Page) {
  await page.getByRole("button", { name: "Принять задание" }).click();
  await expect(taskStatus(page, "Принято")).toBeVisible();
  await page.getByRole("button", { name: "Начать работу" }).click();
  await expect(taskStatus(page, "В работе")).toBeVisible();
}

export async function openFromMyTasks(page: Page, title: string) {
  await expect(page.getByRole("heading", { level: 1, name: "Мои задания" })).toBeVisible();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

export async function startAsForeman(page: Page, email: string, url: string) {
  await signIn(page, email);
  await page.goto(url);
  await acceptAndStart(page);
}

export async function findTask(page: Page, title: string) {
  await page.goto("/tasks");
  await page.getByRole("searchbox", { name: "Поиск по номеру, названию, объекту или адресу" }).fill(title);
  await page.getByRole("button", { name: "Найти" }).click();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

export async function photo(name: string, shade = 120) {
  const buffer = await sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: shade, g: 160, b: 255 - shade } },
  })
    .jpeg()
    .toBuffer();
  return { name, mimeType: "image/jpeg", buffer };
}

export function photos(count: number) {
  return Promise.all(Array.from({ length: count }, (_, index) => photo(`photo-${index + 1}.jpg`, 20 + index * 20)));
}

export async function attachPhotos(page: Page, files: Awaited<ReturnType<typeof photos>>) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Выбрать файлы|Из галереи/ }).click();
  await (await chooser).setFiles(files);
}

export function uploadPhoto(page: Page, taskId: string, data: Buffer) {
  return page.request.post(`/api/tasks/${taskId}/uploads`, { headers: { "Content-Type": "image/jpeg" }, data });
}

export async function sendReport(page: Page, comment: string, count = 2) {
  await expect(page.getByRole("heading", { level: 1, name: "Фотоотчёт" })).toBeVisible();
  await page.getByLabel("Комментарий").fill(comment);
  await attachPhotos(page, await photos(count));
  await expect(page.getByText(`Фото в отчёте: ${count} из 10.`)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Отправить отчёт" }).click();
  await expect(page).toHaveURL(/tab=reports/);
  await expect(taskStatus(page, "На проверке")).toBeVisible();
}

export async function openReports(page: Page) {
  await page
    .getByRole("navigation", { name: "Разделы задания" })
    .getByRole("link", { name: /Отчёты/ })
    .click();
  await expect(page).toHaveURL(/tab=reports/);
}

export function reportVersion(page: Page, version: number): Locator {
  return page
    .getByRole("main")
    .locator("div")
    .filter({ has: page.getByRole("heading", { level: 2, name: `Версия ${version}`, exact: true }) })
    .filter({ has: page.getByRole("list", { name: `Отчёт, версия ${version}: фото` }) })
    .last();
}

export async function expectPhotos(report: Locator, count: number) {
  const gallery = report.getByRole("list", { name: /: фото$/ });
  await expect(gallery.getByRole("listitem")).toHaveCount(count);
  await gallery.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      gallery
        .locator("img")
        .evaluateAll((images) => images.filter((image) => (image as HTMLImageElement).naturalWidth > 0).length),
    )
    .toBe(count);
}

export async function decide(page: Page, action: "Принять результат" | "Вернуть на доработку", note?: string) {
  await page.getByRole("button", { name: action }).click();
  const dialog = page.getByRole("dialog");
  if (note !== undefined) await dialog.getByLabel("Что нужно исправить").fill(note);
  await dialog.getByRole("button", { name: action }).click();
  await expect(dialog).toBeHidden();
}

export async function expectNotFound(page: Page, url: string, title: string) {
  await page.goto(url);
  await expect(page.getByText("Запись не найдена")).toBeVisible();
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
}

export async function expectNoHorizontalScroll(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(0);
}

async function cancelOpenTasks(page: Page, urls: string[]) {
  await signIn(page, accounts.dispatcher);
  for (const url of urls) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 2, name: "Управление заданием" })).toBeVisible();
    const cancel = page.getByRole("button", { name: "Отменить", exact: true });
    if (!(await cancel.count())) continue;
    await cancel.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Причина отмены").fill("Тестовые данные больше не нужны.");
    await dialog.getByRole("button", { name: "Отменить задание" }).click();
    await expect(taskStatus(page, "Отменено")).toBeVisible();
  }
}
