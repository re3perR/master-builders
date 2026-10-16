import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import type { AppError } from "@/lib/errors";

const titles: Partial<Record<AppError["kind"], string>> = {
  conflict: "Данные устарели",
  state: "Действие недоступно",
  forbidden: "Нет прав",
  not_found: "Задание не найдено",
  temporary: "Не удалось сохранить",
  auth: "Сессия истекла",
};

export function FormError({ error }: { error: AppError | null }) {
  if (!error) return null;
  return (
    <Alert variant={error.kind === "conflict" ? "warning" : "danger"} title={titles[error.kind]}>
      {error.message}
      {error.kind === "auth" ? (
        <>
          {" "}
          <Link href="/login?expired=1" target="_blank" rel="noreferrer" className="font-medium underline">
            Войти в новой вкладке
          </Link>
          , затем вернитесь сюда и повторите: введённые данные сохранены.
        </>
      ) : null}
    </Alert>
  );
}
