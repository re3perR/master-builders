import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getViewer, homePath } from "@/lib/auth";

export default async function NotFound() {
  const viewer = await getViewer();

  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Запись не найдена</h1>
      <p className="mt-1 max-w-md text-ink-muted">Её могли удалить, или у вас нет к ней доступа.</p>
      <Link
        href={viewer ? homePath(viewer.profile.role) : "/"}
        className={buttonVariants({ variant: "secondary", className: "mt-4" })}
      >
        На главную
      </Link>
    </div>
  );
}
