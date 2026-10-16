import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MyTasksBoard } from "@/features/field/my-tasks-board";
import { getMyTasks } from "@/features/field/queries";
import { parseView } from "@/features/field/types";
import { requireViewer } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";
import { timeZoneLabel } from "@/lib/time";

export const metadata: Metadata = { title: "Мои задания" };

export default async function MyTasksPage({ searchParams }: PageProps<"/my">) {
  const [viewer, query] = await Promise.all([requireViewer(["foreman"]), searchParams]);

  if (!viewer.crew) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Мои задания" />
        <Card>
          <EmptyState
            title="Бригада не назначена"
            description="Ваш профиль не связан с бригадой, поэтому заданий нет. Обратитесь к диспетчеру подразделения."
          />
        </Card>
      </div>
    );
  }

  const initial = snapshot(await getMyTasks(viewer.crew.id));
  const view = parseView(query.view) ?? (initial.data.views.action.length ? "action" : "today");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Мои задания" description={`${viewer.crew.name} · время: ${timeZoneLabel()}`} />
      <MyTasksBoard initial={initial} initialView={view} />
    </div>
  );
}
