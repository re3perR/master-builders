import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Новый пароль" };

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return (
    <>
      <h1 className="text-2xl font-semibold">Новый пароль</h1>
      {data?.claims?.sub ? (
        <>
          <p className="mt-1 mb-6 text-ink-muted">Придумайте пароль не короче 8 символов.</p>
          <ResetPasswordForm />
        </>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <Alert variant="warning">Ссылка для смены пароля устарела или уже использована.</Alert>
          <Link
            href="/forgot-password"
            className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            Запросить новую ссылку
          </Link>
        </div>
      )}
    </>
  );
}
