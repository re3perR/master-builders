import { Alert } from "@/components/ui/alert";
import type { TaskCard } from "@/features/tasks/types";
import type { Viewer } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";
import { HistoryFeed } from "./history-feed";
import { getHistory } from "./queries";

export async function HistoryTab({ card, viewer }: { card: TaskCard; viewer: Viewer }) {
  const result = await getHistory(card.id);
  if (!result.ok) {
    return (
      <Alert variant="danger" title="Не удалось загрузить историю">
        {result.error.message}
      </Alert>
    );
  }

  return (
    <HistoryFeed
      taskId={card.id}
      initial={snapshot(result.data)}
      context={{
        title: card.title,
        sourceTask: card.source_task ? { id: card.source_task.id, number: card.source_task.number } : null,
        linkTasks: viewer.profile.role !== "foreman",
      }}
    />
  );
}
