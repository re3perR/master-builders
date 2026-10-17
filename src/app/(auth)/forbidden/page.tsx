import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { buttonVariants } from "@/components/ui/button";
import { homePath, requireViewer } from "@/lib/auth";
import { roleLabels } from "@/lib/labels";

export const metadata: Metadata = { title: "Нет доступа" };

export default async function ForbiddenPage() {
  const viewer = await requireViewer();

  return (
    <>
      <h1 className="text-2xl font-semibold">Нет доступа</h1>
      <p className="mt-1 mb-6 text-ink-muted">
        Этот раздел недоступен для роли «{roleLabels[viewer.profile.role]}». Вы вошли как {viewer.profile.full_name}.
      </p>
      <Link href={homePath(viewer.profile.role)} className={buttonVariants({ className: "w-full" })}>
        На главную
      </Link>
      <form action={signOut} className="mt-4">
        <button
          type="submit"
          className="mx-auto flex min-h-11 items-center text-sm text-ink-muted underline-offset-4 hover:underline"
        >
          Войти под другим аккаунтом
        </button>
      </form>
    </>
  );
}
