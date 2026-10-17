import { expect } from "@playwright/test";
import {
  accounts,
  createTask,
  crews,
  decide,
  expectPhotos,
  farDay,
  openReports,
  reportVersion,
  sendReport,
  signIn,
  startAsForeman,
  taskStatus,
  test,
  uniqueTitle,
} from "./support";

test("возврат на доработку требует замечания, повторная отправка создаёт версию 2", async ({ page, createdTasks }) => {
  test.slow();
  const title = uniqueTitle("Отделка фасада");
  const firstComment = "Фасад отделан, швы заделаны, мусор вывезен.";
  const secondComment = "Добавлены фото узла примыкания к окну на втором этаже.";
  const note = "Нет фото узла примыкания к окну на втором этаже.";
  const noteRequired = "Напишите замечание: от 3 до 3000 символов.";

  await signIn(page, accounts.dispatcher);
  const url = await createTask(page, { title, crew: crews.petrov, day: farDay(title), start: "09:00", end: "11:00" });
  createdTasks.push(url);

  await startAsForeman(page, accounts.petrov, url);
  await page.getByRole("link", { name: "Отправить отчёт" }).click();
  await sendReport(page, firstComment, 1);

  await signIn(page, accounts.dispatcher);
  await page.goto(url);
  await page.getByRole("button", { name: "Вернуть на доработку" }).click();
  const dialog = page.getByRole("dialog", { name: "Вернуть на доработку" });
  const confirm = dialog.getByRole("button", { name: "Вернуть на доработку" });
  await confirm.click();
  await expect(dialog.getByText(noteRequired)).toBeVisible();
  await dialog.getByLabel("Что нужно исправить").fill("   ");
  await confirm.click();
  await expect(dialog.getByText(noteRequired)).toBeVisible();
  await expect(dialog.getByLabel("Что нужно исправить")).toHaveAttribute("aria-invalid", "true");
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(taskStatus(page, "На проверке")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Отчёт, версия 1, ждёт проверки" })).toBeVisible();

  await decide(page, "Вернуть на доработку", note);
  await expect(taskStatus(page, "В работе")).toBeVisible();
  await expect(page.getByText("Отчёт, версия 1, возвращён на доработку")).toBeVisible();
  await expect(page.getByText(note)).toBeVisible();

  await signIn(page, accounts.petrov);
  await page.getByRole("tab", { name: /Требуют действия/ }).click();
  const card = page.getByRole("article").filter({ has: page.getByRole("link", { name: title }) });
  await expect(card.getByText("Возвращено на доработку, версия 1")).toBeVisible();
  await expect(card.getByText(note)).toBeVisible();
  await card.getByRole("link", { name: title }).click();
  await expect(taskStatus(page, "В работе")).toBeVisible();
  await expect(page.getByText("Отчёт, версия 1, возвращён на доработку")).toBeVisible();
  await expect(page.getByText(note)).toBeVisible();
  await page.getByRole("link", { name: "Отправить исправленный отчёт" }).click();
  await expect(page.getByText(/^Версия 2 ·/)).toBeVisible();
  await expect(page.getByText(note)).toBeVisible();
  await sendReport(page, secondComment, 2);

  await signIn(page, accounts.dispatcher);
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Отчёт, версия 2, ждёт проверки" })).toBeVisible();
  await openReports(page);
  await expect(reportVersion(page, 2).getByText("Ожидает", { exact: true })).toBeVisible();
  await expect(reportVersion(page, 2).getByText(secondComment)).toBeVisible();
  await expect(reportVersion(page, 1).getByText("Возвращён", { exact: true })).toBeVisible();
  await expect(reportVersion(page, 1).getByText(firstComment)).toBeVisible();
  await expect(reportVersion(page, 1).getByText(`Замечание: ${note}`)).toBeVisible();

  await decide(page, "Принять результат");
  await expect(taskStatus(page, "Завершено")).toBeVisible();

  await page.reload();
  const second = reportVersion(page, 2);
  const first = reportVersion(page, 1);
  await expect(second.getByText("Принят", { exact: true })).toBeVisible();
  await expectPhotos(second, 2);
  await expect(first.getByText("Возвращён", { exact: true })).toBeVisible();
  await expect(first.getByText(`Замечание: ${note}`)).toBeVisible();
  await expectPhotos(first, 1);
  await expect(page.getByRole("heading", { level: 2, name: /^Версия \d+$/ })).toHaveCount(2);
});
