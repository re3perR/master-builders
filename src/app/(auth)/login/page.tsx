import type { Metadata } from "next";
import { demoAccounts, demoLoginEnabled } from "./demo-accounts";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const demo = demoLoginEnabled() ? { accounts: demoAccounts, password: process.env.DEMO_PASSWORD ?? "" } : undefined;

  return (
    <>
      <h1 className="text-2xl font-semibold">Вход</h1>
      <p className="mt-1 mb-6 text-ink-muted">Аккаунты выдаёт администратор компании.</p>
      <LoginForm next={next} expired={params.expired === "1"} demo={demo} />
    </>
  );
}
