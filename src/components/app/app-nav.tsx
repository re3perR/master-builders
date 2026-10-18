"use client";

import { Building2, CalendarDays, ClipboardList, HardHat, LayoutDashboard, ListChecks } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { NavIcon, NavItem } from "./navigation";

const icons: Record<NavIcon, typeof ClipboardList> = {
  overview: LayoutDashboard,
  tasks: ClipboardList,
  schedule: CalendarDays,
  sites: Building2,
  crews: HardHat,
  my: ListChecks,
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Основная навигация" className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = icons[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-lg px-3 text-[15px] text-white/80 hover:bg-white/10 hover:text-white",
              active && "bg-white/10 font-medium text-white",
            )}
          >
            <Icon aria-hidden className={cn("size-5", active && "text-nav-accent")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-nav pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="flex">
        {items.map((item) => {
          const Icon = icons[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight text-white/75",
                  active && "font-medium text-white",
                )}
              >
                <Icon aria-hidden className={cn("size-5", active && "text-nav-accent")} />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
