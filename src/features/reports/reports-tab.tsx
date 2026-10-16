import { EmptyState } from "@/components/ui/empty-state";
import type { TaskCard } from "@/features/tasks/types";
import type { Viewer } from "@/lib/auth";

export function ReportsTab(_: { card: TaskCard; viewer: Viewer }) {
  return <EmptyState title="Отчётов пока нет" description="Бригадир отправит фотоотчёт, когда закончит работу." />;
}
