import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import type { AppError } from "@/lib/errors";

export function ActionError({ error, className }: { error: AppError | null; className?: string }) {
  if (!error) return null;
  return (
    <Alert variant={error.kind === "conflict" || error.kind === "state" ? "warning" : "danger"} className={className}>
      {error.message}
      {error.kind === "auth" ? (
        <>
          {" "}
          <Link href="/login?expired=1" target="_blank" rel="noreferrer" className="font-medium underline">
            Войти в новой вкладке
          </Link>
          , затем вернитесь сюда и повторите действие.
        </>
      ) : null}
    </Alert>
  );
}
