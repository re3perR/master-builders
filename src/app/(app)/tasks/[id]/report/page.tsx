import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ReturnNote } from "@/features/field/return-note";
import { getReportDraft } from "@/features/reports/queries";
import { ReportForm } from "@/features/reports/report-form";
import { getTaskCard } from "@/features/tasks/queries";
import type { TaskCard } from "@/features/tasks/types";
import { requireViewer } from "@/lib/auth";
import { taskCode } from "@/lib/labels";

export async function generateMetadata({ params }: PageProps<"/tasks/[id]/report">): Promise<Metadata> {
  const { id } = await params;
  const card = await getTaskCard(id);
  return { title: card ? `Фотоотчёт ${taskCode(card.number)}` : "Фотоотчёт" };
}

function unavailable(card: TaskCard) {
  if (card.status === "InProgress" && card.open_obstacle) {
    return {
      title: "Пока открыто препятствие",
      description:
        "Отчёт можно отправить после того, как препятствие будет закрыто. Сделать это можно в карточке задания.",
    };
  }
  if (card.status === "Assigned" || card.status === "Accepted") {
    return {
      title: "Работа ещё не начата",
      description: "Отчёт отправляют после начала работы. Примите задание и нажмите «Начать работу» в карточке.",
    };
  }
  if (card.status === "InReview") {
    return {
      title: "Отчёт уже на проверке",
      description: "Диспетчер проверит отчёт и примет результат или вернёт его на доработку.",
    };
  }
  if (card.status === "Completed" || card.status === "Cancelled") {
    return { title: "Задание закрыто", description: "По завершённому или отменённому заданию отчёт отправить нельзя." };
  }
  return null;
}

export default async function ReportPage({ params }: PageProps<"/tasks/[id]/report">) {
  const [{ id }, viewer] = await Promise.all([params, requireViewer()]);
  const card = await getTaskCard(id);
  if (!card) notFound();
  if (viewer.profile.role !== "foreman" || viewer.crew?.id !== card.crew_id) redirect(`/tasks/${card.id}`);

  const back = (
    <Link
      href={`/tasks/${card.id}`}
      className="-ml-1 inline-flex min-h-11 max-w-full items-center gap-1 rounded-lg pr-2 text-sm text-ink-muted hover:text-ink sm:min-h-8"
    >
      <ChevronLeft aria-hidden className="size-4 shrink-0" />
      <span className="truncate">
        {taskCode(card.number)} · {card.title}
      </span>
    </Link>
  );

  const blocked = unavailable(card);
  if (blocked) {
    return (
      <div className="mx-auto max-w-2xl">
        {back}
        <PageHeader title="Фотоотчёт" className="mt-1" />
        <Card>
          <EmptyState
            title={blocked.title}
            description={blocked.description}
            action={
              <Link href={`/tasks/${card.id}`} className={buttonVariants({ variant: "secondary" })}>
                Открыть карточку задания
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const draft = await getReportDraft(card.id, viewer.userId);

  return (
    <div className="mx-auto max-w-2xl">
      {back}
      <PageHeader
        title="Фотоотчёт"
        description={`Версия ${draft.nextVersion} · ${card.site.name}, ${card.address_snapshot}`}
        className="mt-1"
      />
      {card.last_return ? <ReturnNote returned={card.last_return} className="mb-4" /> : null}
      <ReportForm taskId={card.id} taskVersion={card.version} staged={draft.photos} />
    </div>
  );
}
