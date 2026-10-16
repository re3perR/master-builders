import { Alert } from "@/components/ui/alert";
import type { TaskCard } from "@/features/tasks/types";
import type { Viewer } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";
import { DiscussionThread } from "./discussion-thread";
import { getDiscussion } from "./queries";

export async function DiscussionTab({ card, viewer }: { card: TaskCard; viewer: Viewer }) {
  const result = await getDiscussion(card.id);
  if (!result.ok) {
    return (
      <Alert variant="danger" title="Не удалось загрузить обсуждение">
        {result.error.message}
      </Alert>
    );
  }

  return (
    <DiscussionThread
      taskId={card.id}
      initial={snapshot(result.data)}
      author={{ id: viewer.profile.id, name: viewer.profile.full_name, role: viewer.profile.role }}
    />
  );
}
