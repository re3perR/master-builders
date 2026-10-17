import { expect } from "@playwright/test";
import {
  accounts,
  acceptAndStart,
  createTask,
  crews,
  decide,
  expectNotFound,
  expectPhotos,
  farDay,
  findTask,
  openFromMyTasks,
  openReports,
  reportVersion,
  sendReport,
  signIn,
  siteName,
  taskDescription,
  taskStatus,
  test,
  uniqueTitle,
} from "./support";

test("задание проходит путь от назначения до приёмки результата", async ({ page, createdTasks }) => {
  test.slow();
  const title = uniqueTitle("Монтаж лотков");
  const comment = "Лотки смонтированы по всему этажу, крепления проверены.";

  await signIn(page, accounts.dispatcher);
  const url = await createTask(page, {
    title,
    crew: crews.petrov,
    day: farDay(title),
    start: "10:00",
    end: "12:00",
    priority: "Высокий",
  });
  createdTasks.push(url);
  await expect(taskStatus(page, "Назначено")).toBeVisible();
  await expect(page.getByText("Высокий приоритет")).toBeVisible();
  await expect(page.getByText(/10:00–12:00/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: siteName }).first()).toBeVisible();
  await expect(page.getByText(`${crews.petrov} · бригадир Игорь Петров`)).toBeVisible();
  await expect(page.getByText(taskDescription)).toBeVisible();

  await signIn(page, accounts.petrov);
  await openFromMyTasks(page, title);
  await expect(taskStatus(page, "Назначено")).toBeVisible();
  await expect(page.getByText(taskDescription)).toBeVisible();
  await acceptAndStart(page);
  await page.getByRole("link", { name: "Отправить отчёт" }).click();
  await sendReport(page, comment, 2);
  await expect(reportVersion(page, 1).getByText("Ожидает", { exact: true })).toBeVisible();

  await signIn(page, accounts.dispatcher);
  await findTask(page, title);
  await expect(taskStatus(page, "На проверке")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Отчёт, версия 1, ждёт проверки" })).toBeVisible();
  await decide(page, "Принять результат");
  await expect(taskStatus(page, "Завершено")).toBeVisible();
  await expect(page.getByRole("button", { name: "Принять результат" })).toHaveCount(0);

  await openReports(page);
  const accepted = reportVersion(page, 1);
  await expect(accepted.getByText("Принят", { exact: true })).toBeVisible();
  await expect(accepted.getByText(/^Принят: Ольга Смирнова/)).toBeVisible();
  await expect(accepted.getByText(comment)).toBeVisible();
  await expectPhotos(accepted, 2);

  await page.reload();
  await expect(taskStatus(page, "Завершено")).toBeVisible();
  await expect(reportVersion(page, 1).getByText("Принят", { exact: true })).toBeVisible();
  await expect(reportVersion(page, 1).getByText(comment)).toBeVisible();
  await expectPhotos(reportVersion(page, 1), 2);
  await expect(page.getByRole("heading", { name: "Версия 2" })).toHaveCount(0);

  await signIn(page, accounts.petrov);
  await page.goto(url);
  await expect(taskStatus(page, "Завершено")).toBeVisible();
  await expect(page.getByText(/^Результат принят .*\. Задание завершено\.$/)).toBeVisible();

  await signIn(page, accounts.lebedev);
  await expectNotFound(page, url, title);

  await signIn(page, accounts.dispatcherSouth);
  await expectNotFound(page, url, title);
});
