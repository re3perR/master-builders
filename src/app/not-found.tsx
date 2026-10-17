import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/app/(auth)/public-shell";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Страница не найдена" };

export default function NotFound() {
  return (
    <PublicShell>
      <h1 className="text-2xl font-semibold">Страница не найдена</h1>
      <p className="mt-1 mb-6 text-ink-muted">Возможно, в адресе ошибка или страница больше не существует.</p>
      <Link href="/" className={buttonVariants({ className: "w-full" })}>
        На главную
      </Link>
    </PublicShell>
  );
}
