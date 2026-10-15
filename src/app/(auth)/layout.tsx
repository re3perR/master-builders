import Link from "next/link";
import { BrandMark } from "@/components/app/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-nav text-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
          <Link href="/" className="inline-flex min-h-11 items-center">
            <BrandMark />
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
