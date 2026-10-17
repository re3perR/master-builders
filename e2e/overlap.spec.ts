import { expect } from "@playwright/test";
import {
  accounts,
  createTask,
  crews,
  expectTaskCard,
  farDay,
  fillTaskForm,
  signIn,
  test,
  uniqueTitle,
} from "./support";

const crew = crews.lebedev;
const overlapHeading = "Бригада уже занята в это время";

test.beforeEach(async ({ page }) => {
  await signIn(page, accounts.dispatcher);
});

test("пересечение с заданием той же бригады предупреждает, но позволяет сохранить", async ({ page, createdTasks }) => {
  const first = uniqueTitle("Шпаклёвка стен");
  const second = uniqueTitle("Покраска потолка");
  const day = farDay(first);

  createdTasks.push(await createTask(page, { title: first, crew, day, start: "10:00", end: "12:00" }));

  await fillTaskForm(page, { title: second, crew, day, start: "11:00", end: "13:00" });
  await page.getByRole("button", { name: "Создать задание" }).click();
  await expect(page.getByRole("heading", { name: overlapHeading })).toBeVisible();
  await expect(
    page.getByText(`У бригады «${crew}» есть задание, срок которого пересекается с указанным.`),
  ).toBeVisible();
  const overlap = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: first }) });
  await expect(overlap).toContainText("Назначено");
  await expect(overlap).toContainText("10:00–12:00");
  await expect(page).toHaveURL(/\/tasks\/new$/);
  await expect(page.getByRole("button", { name: "Создать задание" })).toHaveCount(0);

  await page.getByRole("button", { name: "Сохранить, несмотря на пересечение" }).click();
  createdTasks.push(await expectTaskCard(page, second));
  await expect(page.getByText(/11:00–13:00/).first()).toBeVisible();
});

test("соседние интервалы не считаются пересечением", async ({ page, createdTasks }) => {
  const middle = uniqueTitle("Грунтовка пола");
  const after = uniqueTitle("Укладка плитки");
  const before = uniqueTitle("Демонтаж плинтуса");
  const day = farDay(middle);

  createdTasks.push(await createTask(page, { title: middle, crew, day, start: "10:00", end: "12:00" }));

  for (const draft of [
    { title: after, start: "12:00", end: "14:00" },
    { title: before, start: "08:00", end: "10:00" },
  ]) {
    await fillTaskForm(page, { ...draft, crew, day });
    await page.getByRole("button", { name: "Создать задание" }).click();
    createdTasks.push(await expectTaskCard(page, draft.title));
    await expect(page.getByText(`${draft.start}–${draft.end}`).first()).toBeVisible();
  }
});

test("начало не может быть позже или равно окончанию", async ({ page }) => {
  const title = uniqueTitle("Неверный срок");
  const day = farDay(title);
  const endError = page.getByText("Окончание должно быть позже начала.");

  await fillTaskForm(page, { title, crew, day, start: "12:00", end: "12:00" });
  await page.getByRole("button", { name: "Создать задание" }).click();
  await expect(endError).toBeVisible();
  await expect(page.getByLabel("Окончание")).toBeFocused();
  await expect(page.getByLabel("Окончание")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Окончание").fill(`${day}T09:00`);
  await page.getByRole("button", { name: "Создать задание" }).click();
  await expect(endError).toBeVisible();
  await expect(page).toHaveURL(/\/tasks\/new$/);
  await expect(page.getByLabel("Название")).toHaveValue(title);

  await page.goto(`/tasks?q=${encodeURIComponent(title)}`);
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
});
