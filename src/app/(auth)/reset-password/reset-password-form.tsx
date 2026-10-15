"use client";

import { useActionState } from "react";
import { updatePassword, type AuthFormState } from "@/app/(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(updatePassword, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
      <Field id="password" label="Новый пароль">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field id="confirm" label="Повторите пароль">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Сохраняем…" : "Сохранить пароль"}
      </Button>
    </form>
  );
}
