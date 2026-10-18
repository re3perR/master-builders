import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiscussionTab } from "@/features/discussion/discussion-tab";
import { FieldActions } from "@/features/field/field-actions";
import { HistoryTab } from "@/features/history/history-tab";
import { ReportsTab } from "@/features/reports/reports-tab";
import { ReviewActions } from "@/features/reports/review-actions";
import { DispatcherActions } from "@/features/tasks/components/dispatcher-actions";
import { TaskDetails } from "@/features/tasks/components/task-details";
import { TaskHeader } from "@/features/tasks/components/task-header";
import { parseTab, TaskTabs } from "@/features/tasks/components/task-tabs";
import { getTaskCard } from "@/features/tasks/queries";
import { requireViewer } from "@/lib/auth";
import { taskCode } from "@/lib/labels";

export async function generateMetadata({ params }: PageProps<"/tasks/[id]">): Promise<Metadata> {
  const { id } = await params;
  const card = await getTaskCard(id);
  return { title: card ? `${taskCode(card.number)} ${card.title}` : "Задание" };
}

export default async function TaskPage({ params, searchParams }: PageProps<"/tasks/[id]">) {
  const [{ id }, query, viewer] = await Promise.all([params, searchParams, requireViewer()]);
  const card = await getTaskCard(id);
  if (!card) notFound();
  const tab = parseTab(query.tab);

  return (
    <div className="mx-auto max-w-4xl">
      <TaskHeader card={card} viewer={viewer} />
      <div className="mb-5 flex flex-col gap-3">
        <FieldActions card={card} viewer={viewer} tab={tab} />
        <ReviewActions card={card} viewer={viewer} tab={tab} />
        <DispatcherActions card={card} viewer={viewer} />
      </div>
      <TaskTabs taskId={card.id} active={tab} counts={{ discussion: card.message_count, reports: card.report_count }} />
      {tab === "details" ? <TaskDetails card={card} /> : null}
      {tab === "discussion" ? <DiscussionTab card={card} viewer={viewer} /> : null}
      {tab === "reports" ? <ReportsTab card={card} viewer={viewer} /> : null}
      {tab === "history" ? <HistoryTab card={card} viewer={viewer} /> : null}
    </div>
  );
}
