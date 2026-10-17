import { expect, type Page } from "@playwright/test";
import {
  accounts,
  createTask,
  crews,
  expectNotFound,
  farDay,
  findTask,
  openReports,
  photo,
  reportVersion,
  sendReport,
  signIn,
  signOut,
  siteName,
  startAsForeman,
  taskIdOf,
  taskStatus,
  test,
  uniqueTitle,
  uploadPhoto,
} from "./support";

const taskControls = ["Изменить", "Перенести", "Переназначить", "Отменить"];
const reviewControls = ["Принять результат", "Вернуть на доработку"];
const fieldControls = ["Принять задание", "Начать работу", "Сообщить о препятствии"];
const siteControls = ["Изменить", "Архивировать"];

async function createNorthTask(page: Page, createdTasks: string[], prefix: string) {
  const title = uniqueTitle(prefix);
  await signIn(page, accounts.dispatcher);
  const url = await createTask(page, { title, crew: crews.petrov, day: farDay(title), start: "15:00", end: "17:00" });
  createdTasks.push(url);
  return { title, url };
}

async function expectButtons(page: Page, names: string[]) {
  for (const name of names) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
}

async function expectForbidden(page: Page, role: string, home: string) {
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(page.getByRole("heading", { level: 1, name: "Нет доступа" })).toBeVisible();
  await expect(page.getByText(`недоступен для роли «${role}»`)).toBeVisible();
  await expect(page.getByRole("link", { name: "На главную" })).toHaveAttribute("href", home);
}

async function expectNoButtons(page: Page, names: string[]) {
  for (const name of names) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
}

test("после выхода защищённые страницы ведут на вход", async ({ page, createdTasks }) => {
  const { title, url } = await createNorthTask(page, createdTasks, "Проверка выхода");
  const taskId = taskIdOf(url);

  await signOut(page);
  await page.goBack();
  await expect(page).toHaveURL((current) => current.pathname === "/login" && current.searchParams.get("next") === url);
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);

  for (const path of [url, `${url}?tab=reports`, "/tasks", "/tasks/new", "/overview", "/schedule", "/sites", "/my"]) {
    await page.goto(path);
    await expect(page).toHaveURL(
      (current) => current.pathname === "/login" && current.searchParams.get("next") === path,
    );
    await expect(page.getByRole("button", { name: "Войти", exact: true })).toBeVisible();
  }

  const upload = await uploadPhoto(page, taskId, (await photo("after-sign-out.jpg")).buffer);
  expect(upload.status()).toBe(401);
});

test("руководитель видит задание только для чтения", async ({ page, createdTasks }) => {
  test.slow();
  const { title, url } = await createNorthTask(page, createdTasks, "Просмотр руководителем");
  const taskId = taskIdOf(url);
  await expect(page.getByRole("heading", { name: "Управление заданием" })).toBeVisible();
  await expectButtons(page, taskControls);

  await signIn(page, accounts.manager);
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { level: 1, name: "Задания" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Создать задание" })).toHaveCount(0);
  await findTask(page, title);
  await expect(taskStatus(page, "Назначено")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Управление заданием" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Создать на основе" })).toHaveCount(0);
  await expectNoButtons(page, [...taskControls, ...fieldControls]);

  await startAsForeman(page, accounts.petrov, url);
  await page.getByRole("link", { name: "Отправить отчёт" }).click();
  await sendReport(page, "Кабель проложен, маркировка нанесена.", 1);

  await signIn(page, accounts.manager);
  await page.goto(url);
  await expect(taskStatus(page, "На проверке")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Отчёт, версия 1, ждёт проверки" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Управление заданием" })).toHaveCount(0);
  await expectNoButtons(page, [...reviewControls, ...taskControls, ...fieldControls]);

  await openReports(page);
  await expect(reportVersion(page, 1).getByText("Ожидает", { exact: true })).toBeVisible();
  await expect(reportVersion(page, 1).getByRole("listitem")).toHaveCount(1);
  await expectNoButtons(page, reviewControls);

  await page.goto(`${url}?tab=discussion`);
  await expect(page.getByText("Руководитель читает обсуждение, но не пишет в нём.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Новое сообщение" })).toHaveCount(0);
  await expectNoButtons(page, ["Отправить"]);

  const upload = await uploadPhoto(page, taskId, (await photo("manager.jpg")).buffer);
  expect(upload.status()).toBe(403);

  await page.goto("/tasks/new");
  await expectForbidden(page, "Руководитель", "/overview");
  await expect(page.getByLabel("Название")).toHaveCount(0);

  await page.goto("/sites");
  await expect(page.getByRole("heading", { level: 1, name: "Объекты" })).toBeVisible();
  await expectNoButtons(page, ["Новый объект"]);
});

test("бригадир не открывает страницы и действия диспетчера", async ({ page, createdTasks }) => {
  const { title, url } = await createNorthTask(page, createdTasks, "Права бригадира");
  await page.getByRole("link", { name: siteName }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: siteName })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Архив и удаление" })).toBeVisible();
  await expectButtons(page, siteControls);
  const siteUrl = new URL(page.url()).pathname;

  await signIn(page, accounts.petrov);
  for (const path of ["/tasks/new", "/tasks", "/sites"]) {
    await page.goto(path);
    await expectForbidden(page, "Бригадир", "/my");
  }
  await expect(page.getByLabel("Название")).toHaveCount(0);
  await page.getByRole("link", { name: "На главную" }).click();
  await expect(page).toHaveURL(/\/my$/);
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/my$/);
  await expect(page.getByRole("heading", { level: 1, name: "Мои задания" })).toBeVisible();

  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole("button", { name: "Принять задание" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Управление заданием" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Создать на основе" })).toHaveCount(0);
  await expectNoButtons(page, taskControls);

  await page.getByRole("link", { name: siteName }).first().click();
  await expect(page).toHaveURL(siteUrl);
  await expect(page.getByRole("heading", { level: 1, name: siteName })).toBeVisible();
  await expect(page.getByText("Показаны только задания вашей бригады.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Архив и удаление" })).toHaveCount(0);
  await expectNoButtons(page, [...siteControls, "Удалить объект", "Новый объект"]);
});

test("задание «Севера» не открывается из другого подразделения", async ({ page, createdTasks }) => {
  const { title, url } = await createNorthTask(page, createdTasks, "Чужое подразделение");

  await signIn(page, accounts.dispatcherSouth);
  await expectNotFound(page, url, title);
  await expectNotFound(page, `${url}?tab=reports`, title);
  await expectNotFound(page, `${url}/report`, title);
  await page.goto(`/tasks?q=${encodeURIComponent(title)}`);
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);

  await signIn(page, accounts.managerSouth);
  await expectNotFound(page, url, title);

  await signIn(page, accounts.gusev);
  await expectNotFound(page, url, title);
});
