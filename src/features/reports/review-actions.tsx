import type { TaskCard } from "@/features/tasks/types";
import type { Viewer } from "@/lib/auth";

export function ReviewActions(_: { card: TaskCard; viewer: Viewer }) {
  return null;
}
