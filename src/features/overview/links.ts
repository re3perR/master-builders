import type { TaskStatus } from "@/lib/database.types";
import { activeStatuses } from "@/lib/labels";

export const taskListLinks = {
  active: `/tasks?status=${activeStatuses.join(",")}`,
  overdue: "/tasks?overdue=1",
  obstacles: "/tasks?obstacle=1",
  review: "/tasks?review=1",
};

export function statusListLink(status: TaskStatus) {
  return `/tasks?status=${status}`;
}

export function taskLink(id: string, tab?: "reports") {
  return tab ? `/tasks/${id}?tab=${tab}` : `/tasks/${id}`;
}

export function scheduleLink(date: string) {
  return `/schedule?date=${date}`;
}

export function newTaskLink(options: { crew?: string; date?: string } = {}) {
  const params = new URLSearchParams();
  if (options.crew) params.set("crew", options.crew);
  if (options.date) params.set("date", options.date);
  const query = params.toString();
  return query ? `/tasks/new?${query}` : "/tasks/new";
}
