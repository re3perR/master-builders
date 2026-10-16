import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CrewsView } from "@/features/directory/components/crews-view";
import { listCrews } from "@/features/directory/queries";
import { requireViewer } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

export const metadata: Metadata = { title: "Бригады" };

export default async function CrewsPage() {
  const viewer = await requireViewer();

  if (viewer.profile.role === "foreman") {
    if (viewer.crew) redirect(`/crews/${viewer.crew.id}`);
    return (
      <>
        <PageHeader title="Бригада" />
        <Card>
          <EmptyState
            title="Вы пока не закреплены за бригадой"
            description="Бригаду закрепляют при настройке системы. Обратитесь к диспетчеру или администратору компании."
          />
        </Card>
      </>
    );
  }

  const result = await listCrews();
  if (!result.ok) throw new Error(result.error.message);

  return (
    <>
      <PageHeader title="Бригады" description={viewer.division.name} />
      <CrewsView initial={snapshot(result.data)} />
    </>
  );
}
