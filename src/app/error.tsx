"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PublicShell } from "@/app/(auth)/public-shell";
import { Button } from "@/components/ui/button";

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <PublicShell>
      <h1 className="text-2xl font-semibold">Не удалось загрузить страницу</h1>
      <p className="mt-1 mb-6 text-ink-muted">Возможно, сервер временно недоступен. Попробуйте ещё раз через минуту.</p>
      <Button className="w-full" onClick={retry} disabled={pending}>
        {pending ? "Загружаем…" : "Попробовать снова"}
      </Button>
      <Link href="/" className="mt-6 block text-center text-sm text-ink-muted underline-offset-4 hover:underline">
        На главную
      </Link>
    </PublicShell>
  );
}
