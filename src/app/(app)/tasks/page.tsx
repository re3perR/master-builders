import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { TaskListView } from "@/features/tasks/components/task-list-view";
import { parseTaskFilters, taskListHref } from "@/features/tasks/filters";
import { getFilterOptions, getTaskList } from "@/features/tasks/queries";
import { requireViewer } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";
import { dayKey } from "@/lib/time";

export const metadata: Metadata = { title: "Задания" };

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const viewer = await requireViewer(["dispatcher", "manager"]);
  const filters = parseTaskFilters(await searchParams);
  const [list, options] = await Promise.all([getTaskList(filters), getFilterOptions()]);

  if (!list.ok) {
    if (list.error.kind === "auth") redirect("/login?expired=1");
    throw new Error(list.error.message);
  }

  const lastPage = Math.max(1, Math.ceil(list.data.total / list.data.pageSize));
  if (!list.data.rows.length && filters.page > lastPage) redirect(taskListHref({ ...filters, page: lastPage }));

  const canCreate = viewer.profile.role === "dispatcher";

  return (
    <>
      <PageHeader
        title="Задания"
        description={viewer.division.name}
        actions={
          canCreate ? (
            <Link href="/tasks/new" className={buttonVariants()}>
              <Plus aria-hidden className="size-4" />
              Создать задание
            </Link>
          ) : null
        }
      />
      <TaskListView
        initial={snapshot(list.data)}
        filters={filters}
        options={options}
        today={dayKey()}
        canCreate={canCreate}
      />
    </>
  );
}
