"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { signIn, type AuthFormState } from "@/app/(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { DemoAccount } from "./demo-accounts";

type LoginFormProps = {
  next?: string;
  expired: boolean;
  demo?: { accounts: DemoAccount[]; password: string };
};

export function LoginForm({ next, expired, demo }: LoginFormProps) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signIn, {});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function fill(account: DemoAccount) {
    if (!emailRef.current || !passwordRef.current || !demo) return;
    emailRef.current.value = account.email;
    passwordRef.current.value = demo.password;
    passwordRef.current.form?.requestSubmit();
  }

  return (
    <>
      <form action={action} className="flex flex-col gap-4" noValidate>
        {expired && !state.error ? (
          <Alert variant="warning">Сессия истекла. Войдите снова, чтобы продолжить работу.</Alert>
        ) : null}
        {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
        <input type="hidden" name="next" value={next ?? ""} />
        <Field id="email" label="Email">
          <Input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            defaultValue={state.email}
            required
            aria-invalid={Boolean(state.error)}
          />
        </Field>
        <Field id="password" label="Пароль">
          <Input
            ref={passwordRef}
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? "Входим…" : "Войти"}
        </Button>
        <Link
          href="/forgot-password"
          className="flex min-h-11 items-center justify-center text-sm text-ink-muted underline-offset-4 hover:underline"
        >
          Забыли пароль?
        </Link>
      </form>
      {demo ? (
        <section
          aria-labelledby="demo-title"
          className="mt-8 rounded-[var(--radius-card)] border border-dashed border-field p-4"
        >
          <h2 id="demo-title" className="text-sm font-semibold">
            Локальная демонстрация
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Вход выполняется настоящими тестовыми аккаунтами. В рабочей среде этот блок отключён.
          </p>
          <ul className="mt-3 flex flex-col gap-1">
            {demo.accounts.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => fill(account)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 text-left hover:bg-canvas disabled:opacity-60"
                >
                  <span className="font-medium">{account.name}</span>
                  <span className="text-sm text-ink-muted">{account.role}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
