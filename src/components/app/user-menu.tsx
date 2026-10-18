import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { roleLabels } from "@/lib/labels";
import type { Viewer } from "@/lib/auth";
import { cn } from "@/lib/cn";

export function UserMenu({ viewer, compact }: { viewer: Viewer; compact?: boolean }) {
  return (
    <div className={cn("flex gap-3", compact ? "items-center" : "items-start border-t border-white/10 pt-4")}>
      <div className={cn("min-w-0 flex-1", compact && "hidden sm:block")}>
        <p className={cn("text-sm font-medium text-white", compact ? "truncate" : "break-words")}>
          {viewer.profile.full_name}
        </p>
        {compact ? (
          <p className="truncate text-xs text-white/70">
            {roleLabels[viewer.profile.role]} · {viewer.division.name}
          </p>
        ) : (
          <>
            <p className="text-xs text-white/70">{roleLabels[viewer.profile.role]}</p>
            <p className="text-xs break-words text-white/70">{viewer.division.name}</p>
          </>
        )}
      </div>
      <form action={signOut}>
        <button
          type="submit"
          title="Выйти"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
        >
          <LogOut aria-hidden className="size-5" />
          <span className="sr-only">Выйти</span>
        </button>
      </form>
    </div>
  );
}
