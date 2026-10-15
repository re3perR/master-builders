import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      title="Запись не найдена"
      description="Её могли удалить, или у вас нет к ней доступа."
      action={
        <Link href="/overview" className={buttonVariants({ variant: "secondary" })}>
          На главную
        </Link>
      }
    />
  );
}
