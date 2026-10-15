"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-10">
      <Alert variant="danger" title="Не удалось загрузить страницу">
        Возможно, сервер временно недоступен. Введённые ранее данные не изменены.
      </Alert>
      <Button variant="secondary" className="mt-4" onClick={reset}>
        Попробовать снова
      </Button>
    </div>
  );
}
