import { Skeleton } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64 max-w-full" />
      <Skeleton className="h-11 w-full max-w-md" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    </div>
  );
}
