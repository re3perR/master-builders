import { expect, type Page } from "@playwright/test";

export const password = process.env.E2E_PASSWORD ?? "demo-pass-2026";

export const accounts = {
  dispatcher: "dispatcher.north@demo.local",
  manager: "manager.north@demo.local",
  petrov: "foreman.petrov@demo.local",
  lebedev: "foreman.lebedev@demo.local",
  gusev: "foreman.gusev@demo.local",
  dispatcherSouth: "dispatcher.south@demo.local",
};

export async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Выйти" }).first().click();
  await expect(page).toHaveURL(/\/login/);
}

export function uniqueTitle(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}`;
}
