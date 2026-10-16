import { Skeleton } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка заданий" className="mx-auto flex max-w-5xl flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64 max-w-full" />
      <Skeleton className="h-24 sm:h-12" />
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
      </div>
    </div>
  );
}
