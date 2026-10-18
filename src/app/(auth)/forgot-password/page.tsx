import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Восстановление пароля" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Восстановление пароля</h1>
      <p className="mt-1 mb-6 text-ink-muted">Укажите рабочий email, и мы пришлём ссылку для смены пароля.</p>
      <ForgotPasswordForm />
      <Link
        href="/login"
        className="mt-4 flex min-h-11 items-center justify-center text-sm text-ink-muted underline-offset-4 hover:underline"
      >
        Вернуться ко входу
      </Link>
    </>
  );
}
