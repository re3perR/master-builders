"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  message?: string;
  email?: string;
};

const credentials = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function signIn(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const email = typeof formData.get("email") === "string" ? String(formData.get("email")) : "";
  if (!parsed.success) {
    return { error: "Введите email и пароль.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.status === 400 || error.status === 422) {
      return { error: "Неверный email или пароль.", email };
    }
    if (error.status === 429) {
      return { error: "Слишком много попыток входа. Подождите минуту и попробуйте снова.", email };
    }
    return { error: "Сервис входа временно недоступен. Попробуйте позже.", email };
  }

  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: "Введите корректный email." };
  }

  const headerList = await headers();
  const origin = headerList.get("origin") ?? `http://${headerList.get("host") ?? "localhost:3000"}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error && error.status !== 400 && error.status !== 404) {
    if (error.status === 429) {
      return { error: "Письмо уже отправлялось недавно. Подождите минуту и попробуйте снова." };
    }
    return { error: "Не удалось отправить письмо. Попробуйте позже." };
  }

  return {
    message: "Если такой аккаунт существует, мы отправили на него письмо со ссылкой для смены пароля.",
  };
}

const newPassword = z
  .object({
    password: z.string().min(8, "Пароль должен быть не короче 8 символов."),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, { message: "Пароли не совпадают.", path: ["confirm"] });

export async function updatePassword(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = newPassword.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте пароль." };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    return { error: "Ссылка устарела. Запросите восстановление пароля ещё раз." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: "Не удалось сменить пароль. Попробуйте другой пароль или повторите позже." };
  }

  redirect("/overview");
}
