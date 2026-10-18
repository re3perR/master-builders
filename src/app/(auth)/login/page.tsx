import type { Metadata } from "next";
import Image from "next/image";
import { demoAccounts, demoLoginEnabled } from "./demo-accounts";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const demo = demoLoginEnabled() ? { accounts: demoAccounts, password: process.env.DEMO_PASSWORD ?? "" } : undefined;

  return (
    <>
      <Image
        src="/logo.svg"
        alt="Master Builders"
        width={583}
        height={590}
        priority
        className="mx-auto mb-8 h-32 w-auto"
      />
      <h1 className="text-2xl font-semibold">Вход</h1>
      <p className="mt-1 mb-6 text-ink-muted">Аккаунты выдаёт администратор компании.</p>
      <LoginForm next={next} expired={params.expired === "1"} demo={demo} />
    </>
  );
}
