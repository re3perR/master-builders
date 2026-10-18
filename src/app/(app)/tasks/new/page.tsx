import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Alert } from "@/components/ui/alert";
import { TaskForm } from "@/features/tasks/components/task-form";
import { getSourceTask, getTaskChoices } from "@/features/tasks/queries";
import { requireViewer } from "@/lib/auth";
import { taskCode } from "@/lib/labels";
import { isDayKey, timeZoneLabel } from "@/lib/time";
import { isGuid } from "@/lib/validation";

export const metadata: Metadata = { title: "Новое задание" };

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

export default async function NewTaskPage({ searchParams }: PageProps<"/tasks/new">) {
  await requireViewer(["dispatcher"]);
  const params = await searchParams;
  const from = single(params.from);
  const date = single(params.date);
  const [choices, source] = await Promise.all([getTaskChoices(), getSourceTask(from)]);

  const siteId = source?.site_id ?? single(params.site);
  const crewId = source?.crew_id ?? single(params.crew);
  const site = choices.sites.find((item) => item.id === siteId);
  const crew = choices.crews.find((item) => item.id === crewId);
  const day = isDayKey(date) ? date : null;

  const notes: string[] = [];
  if (source && !site) notes.push("Объект исходного задания в архиве или недоступен, выберите другой.");
  if (source && !crew) notes.push("Бригада исходного задания в архиве или недоступна, выберите другую.");
  if (!source && isGuid(crewId) && !crew)
    notes.push("Бригада из ссылки недоступна для новых заданий, выберите другую.");

  const cancelHref = source ? `/tasks/${source.id}` : day ? `/schedule?date=${day}` : "/tasks";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={cancelHref}
        className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-ink-muted hover:underline sm:min-h-0"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {source ? `${taskCode(source.number)} ${source.title}` : day ? "Расписание" : "Задания"}
      </Link>
      <PageHeader
        title={source ? `Новое задание на основе ${taskCode(source.number)}` : "Новое задание"}
        description="Задание сразу получит статус «Назначено» и появится у бригадира выбранной бригады."
      />
      <div className="mb-5 flex flex-col gap-3">
        {source ? (
          <Alert>
            Объект, бригада, название, описание и приоритет перенесены. Сроки укажите заново, отчёты и обсуждение
            исходного задания не копируются.
          </Alert>
        ) : null}
        {from && !source ? (
          <Alert variant="warning" title="Исходное задание не найдено">
            Можно заполнить новое задание вручную.
          </Alert>
        ) : null}
        {notes.map((note) => (
          <Alert key={note} variant="warning">
            {note}
          </Alert>
        ))}
        {!choices.sites.length ? (
          <Alert variant="warning" title="Нет активных объектов">
            Добавьте объект в разделе{" "}
            <Link href="/sites" className="underline">
              «Объекты»
            </Link>
            .
          </Alert>
        ) : null}
        {!choices.crews.length ? (
          <Alert variant="warning" title="Нет активных бригад">
            Бригады заводят при настройке системы. Обратитесь к администратору компании.
          </Alert>
        ) : null}
      </div>
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-6">
        <TaskForm
          defaults={{
            title: source?.title ?? "",
            description: source?.description ?? "",
            site_id: site?.id ?? "",
            crew_id: crew?.id ?? "",
            priority: source?.priority ?? "normal",
            planned_start: day ? `${day}T09:00` : "",
            planned_end: day ? `${day}T18:00` : "",
          }}
          sites={choices.sites}
          crews={choices.crews}
          sourceTaskId={source?.id ?? null}
          cancelHref={cancelHref}
          timeZone={timeZoneLabel()}
        />
      </div>
    </div>
  );
}
