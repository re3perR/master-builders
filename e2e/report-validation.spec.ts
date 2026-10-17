import { expect, type Page } from "@playwright/test";
import {
  accounts,
  attachPhotos,
  createTask,
  crews,
  farDay,
  openReports,
  photo,
  photos,
  signIn,
  startAsForeman,
  taskIdOf,
  taskStatus,
  test,
  uniqueTitle,
  uploadPhoto,
} from "./support";

const comment = "Работы выполнены полностью, замечаний нет.";
const oversizeMessage = "Файл больше 10 МБ. Выберите фото меньшего размера.";
const unsupportedMessage = "Файл не является фотографией JPEG, PNG или WebP. Загрузите файл одного из этих форматов.";

async function openReportForm(page: Page, createdTasks: string[], prefix: string) {
  const title = uniqueTitle(prefix);
  await signIn(page, accounts.dispatcher);
  const url = await createTask(page, { title, crew: crews.petrov, day: farDay(title), start: "13:00", end: "15:00" });
  createdTasks.push(url);
  await startAsForeman(page, accounts.petrov, url);
  await page.getByRole("link", { name: "Отправить отчёт" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Фотоотчёт" })).toBeVisible();
  return url;
}

async function expectNothingPublished(page: Page, url: string) {
  await page.goto(url);
  await expect(taskStatus(page, "В работе")).toBeVisible();
  await openReports(page);
  await expect(page.getByText("Отчётов пока нет")).toBeVisible();
}

test("отчёт без комментария или без фото не отправляется", async ({ page, createdTasks }) => {
  test.slow();
  const url = await openReportForm(page, createdTasks, "Отчёт без данных");
  const send = page.getByRole("button", { name: "Отправить отчёт" });

  await send.click();
  await expect(page.getByText("Напишите комментарий: от 10 до 3000 символов.")).toBeVisible();
  await expect(page.getByText("Добавьте хотя бы одно фото.")).toBeVisible();

  await page.getByLabel("Комментарий").fill(comment);
  await send.click();
  await expect(page.getByText("Добавьте хотя бы одно фото.")).toBeVisible();
  await expect(page).toHaveURL(/\/report$/);

  await attachPhotos(page, [await photo("facade.jpg")]);
  await expect(page.getByText("Фото в отчёте: 1 из 10.")).toBeVisible();
  await page.getByLabel("Комментарий").fill("коротко");
  await send.click();
  await expect(page.getByText("Напишите комментарий: от 10 до 3000 символов.")).toBeVisible();
  await expect(page).toHaveURL(/\/report$/);

  await expectNothingPublished(page, url);
});

test("в отчёт нельзя добавить 11 фото", async ({ page, createdTasks }) => {
  test.slow();
  const url = await openReportForm(page, createdTasks, "Отчёт с 11 фото");

  await page.getByLabel("Комментарий").fill(comment);
  await attachPhotos(page, await photos(11));
  await expect(page.getByText("В отчёте не больше 10 фото. Не добавлено файлов: 1.")).toBeVisible();
  await expect(page.getByText("Фото в отчёте: 10 из 10.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Добавлено максимальное число фото.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Выбрать файлы|Из галереи/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Убрать из отчёта/ })).toHaveCount(10);

  await expectNothingPublished(page, url);
});

test("файл больше 10 МБ и файл не с фото отклоняются", async ({ page, createdTasks }) => {
  test.slow();
  const url = await openReportForm(page, createdTasks, "Отчёт с плохими файлами");
  const taskId = taskIdOf(url);
  const valid = await photo("wall.jpg");
  const oversize = {
    ...valid,
    name: "huge.jpg",
    buffer: Buffer.concat([valid.buffer, Buffer.alloc(11 * 1024 * 1024)]),
  };
  const fake = { name: "notes.jpg", mimeType: "image/jpeg", buffer: Buffer.from("Список материалов на завтра") };

  await page.getByLabel("Комментарий").fill(comment);
  await attachPhotos(page, [valid, oversize, fake]);
  await expect(page.getByText(oversizeMessage)).toBeVisible();
  await expect(page.getByText(unsupportedMessage)).toBeVisible();
  await expect(page.getByText("Фото в отчёте: 1 из 10.")).toBeVisible();

  await page.getByRole("button", { name: "Отправить отчёт" }).click();
  await expect(page.getByText("Есть фото с ошибкой: загрузите их заново или уберите из отчёта.")).toBeVisible();
  await expect(page).toHaveURL(/\/report$/);

  const tooLarge = await uploadPhoto(page, taskId, oversize.buffer);
  expect(tooLarge.status()).toBe(413);
  expect((await tooLarge.json()).error.message).toBe(oversizeMessage);
  const notPhoto = await uploadPhoto(page, taskId, fake.buffer);
  expect(notPhoto.status()).toBe(415);
  expect((await notPhoto.json()).error.message).toBe(unsupportedMessage);

  await expectNothingPublished(page, url);
});
