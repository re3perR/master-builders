"use client";

import { useActionState } from "react";
import { requestPasswordReset, type AuthFormState } from "@/app/(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(requestPasswordReset, {});

  if (state.message) {
    return <Alert variant="success">{state.message}</Alert>;
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
      <Field id="email" label="Email">
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Отправляем…" : "Отправить ссылку"}
      </Button>
    </form>
  );
}
