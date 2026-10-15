import Link from "next/link";
import { BottomNav, SidebarNav } from "@/components/app/app-nav";
import { BrandMark } from "@/components/app/brand";
import { navigationFor } from "@/components/app/navigation";
import { UserMenu } from "@/components/app/user-menu";
import { requireViewer } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const items = navigationFor(viewer.profile.role);
  const home = viewer.profile.role === "foreman" ? "/my" : "/overview";

  return (
    <div className="min-h-dvh lg:pl-64">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        Перейти к содержимому
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-nav px-3 py-4 lg:flex">
        <Link href={home} className="mb-6 inline-flex min-h-10 items-center px-3 text-white">
          <BrandMark />
        </Link>
        <div className="flex-1">
          <SidebarNav items={items} />
        </div>
        <div className="px-1">
          <p className="mb-3 px-2 text-xs text-white/60">{viewer.company.name}</p>
          <UserMenu viewer={viewer} />
        </div>
      </aside>
      <header className="sticky top-0 z-30 bg-nav text-white lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Link href={home} className="inline-flex min-h-11 items-center">
            <BrandMark />
          </Link>
          <UserMenu viewer={viewer} compact />
        </div>
      </header>
      <main id="content" className="mx-auto w-full max-w-7xl px-4 pt-5 pb-24 sm:px-6 lg:px-8 lg:pt-8 lg:pb-10">
        {children}
      </main>
      <BottomNav items={items} />
    </div>
  );
}
