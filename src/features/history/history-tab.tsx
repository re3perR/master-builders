import { EmptyState } from "@/components/ui/empty-state";
import type { TaskCard } from "@/features/tasks/types";
import type { Viewer } from "@/lib/auth";

export function HistoryTab(_: { card: TaskCard; viewer: Viewer }) {
  return <EmptyState title="История пуста" />;
}
