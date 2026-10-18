import { expect } from "@playwright/test";
import {
  accounts,
  createTask,
  crews,
  expectNoHorizontalScroll,
  expectPhotos,
  farDay,
  openFromMyTasks,
  reportVersion,
  sendReport,
  signIn,
  taskStatus,
  test,
  uniqueTitle,
} from "./support";

test("бригадир со смартфона проходит работу с препятствием и отправляет фотоотчёт", async ({ page, createdTasks }) => {
  test.slow();
  const title = uniqueTitle("Замена светильников");
  const reason = "Не привезли кабель ВВГ 3х2,5, продолжить монтаж нечем.";
  const resolution = "Кабель привезли, монтаж продолжен.";
  const comment = "Светильники заменены в коридоре и холле, всё работает.";

  await signIn(page, accounts.dispatcher);
  const url = await createTask(page, { title, crew: crews.petrov, day: farDay(title), start: "08:00", end: "10:00" });
  createdTasks.push(url);

  await signIn(page, accounts.petrov);
  await expectNoHorizontalScroll(page);
  await openFromMyTasks(page, title);
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "Принять задание" }).click();
  await expect(taskStatus(page, "Принято")).toBeVisible();
  await page.getByRole("button", { name: "Начать работу" }).click();
  await expect(taskStatus(page, "В работе")).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "Сообщить о препятствии" }).click();
  const openDialog = page.getByRole("dialog", { name: "Сообщить о препятствии" });
  await openDialog.getByRole("button", { name: "Сообщить" }).click();
  await expect(openDialog.getByText("Выберите категорию.")).toBeVisible();
  await expect(openDialog.getByText("Опишите причину: от 3 до 2000 символов.")).toBeVisible();
  await openDialog.getByRole("radio", { name: "Материалы" }).check();
  await openDialog.getByLabel("Причина").fill(reason);
  await expectNoHorizontalScroll(page);
  await openDialog.getByRole("button", { name: "Сообщить" }).click();
  await expect(openDialog).toBeHidden();

  await expect(page.getByRole("heading", { name: "Препятствие: материалы" })).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();
  await expect(taskStatus(page, "В работе")).toBeVisible();
  await expect(page.getByRole("button", { name: "Отправить отчёт" })).toBeDisabled();
  await expect(page.getByText("Отчёт можно отправить после того, как препятствие будет закрыто.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Отправить отчёт" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await page.goto(`${url}/report`);
  await expect(page.getByText("Пока открыто препятствие")).toBeVisible();
  await expect(page.getByLabel("Комментарий")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Отправить отчёт" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await page.getByRole("link", { name: "Открыть карточку задания" }).click();

  await page.getByRole("button", { name: "Закрыть препятствие" }).click();
  const closeDialog = page.getByRole("dialog", { name: "Закрыть препятствие" });
  await closeDialog.getByRole("button", { name: "Закрыть препятствие" }).click();
  await expect(closeDialog.getByText("Напишите комментарий: от 3 до 2000 символов.")).toBeVisible();
  await closeDialog.getByLabel("Как решили проблему").fill(resolution);
  await expectNoHorizontalScroll(page);
  await closeDialog.getByRole("button", { name: "Закрыть препятствие" }).click();
  await expect(closeDialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Препятствие: материалы" })).toHaveCount(0);
  await expect(taskStatus(page, "В работе")).toBeVisible();

  await page.getByRole("link", { name: "Отправить отчёт" }).click();
  await expectNoHorizontalScroll(page);
  await sendReport(page, comment, 2);
  const report = reportVersion(page, 1);
  await expect(report.getByText("Ожидает", { exact: true })).toBeVisible();
  await expect(report.getByText(comment)).toBeVisible();
  await expectPhotos(report, 2);
  await expectNoHorizontalScroll(page);

  await page.goto(`${url}?tab=history`);
  const opened = page.getByRole("listitem").filter({ hasText: "Открыто препятствие" });
  await expect(opened).toContainText("Материалы");
  await expect(opened).toContainText(reason);
  const closed = page.getByRole("listitem").filter({ hasText: "Препятствие закрыто" });
  await expect(closed).toContainText(resolution);
  await expectNoHorizontalScroll(page);
});
