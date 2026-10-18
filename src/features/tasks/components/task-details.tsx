import { History } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { isRescheduled, priorityLabels, taskCode } from "@/lib/labels";
import { formatDateTime, formatInterval } from "@/lib/time";
import type { TaskCard } from "../types";

const linkClass =
  "inline-flex min-h-11 items-center font-medium underline decoration-line underline-offset-4 hover:decoration-ink sm:min-h-0";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
      <dt className="text-sm text-ink-muted sm:w-52 sm:shrink-0 sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Stamp({ at, by }: { at: string; by?: string | null }) {
  return (
    <>
      <span className="tabular">{formatDateTime(at)}</span>
      {by ? ` · ${by}` : null}
    </>
  );
}

function TaskLink({ task }: { task: { id: string; number: number; title: string } }) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="inline-flex min-h-11 items-center gap-1 underline decoration-line underline-offset-4 hover:decoration-ink sm:min-h-0"
    >
      <span className="tabular font-medium">{taskCode(task.number)}</span>
      <span>{task.title}</span>
    </Link>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-ink-muted">{children}</span>;
}

export function TaskDetails({ card }: { card: TaskCard }) {
  const moved = isRescheduled(card);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Описание работ</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="whitespace-pre-line break-words">{card.description}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Объект и бригада</CardTitle>
        </CardHeader>
        <CardBody className="py-1.5">
          <dl className="divide-y divide-line">
            <Row label="Объект">
              <Link href={`/sites/${card.site.id}`} className={linkClass}>
                {card.site.name}
              </Link>
              {card.site.archived_at ? <Muted> (в архиве)</Muted> : null}
            </Row>
            <Row label="Адрес">{card.address_snapshot}</Row>
            <Row label="Доступ на объект">
              {card.access_note_snapshot ? (
                <span className="whitespace-pre-line">{card.access_note_snapshot}</span>
              ) : (
                <Muted>Не указано</Muted>
              )}
            </Row>
            <Row label="Бригада">
              <Link href={`/crews/${card.crew.id}`} className={linkClass}>
                {card.crew.name}
              </Link>
              {card.crew.archived_at ? <Muted> (в архиве)</Muted> : null}
            </Row>
            <Row label="Бригадир">{card.crew.foreman_name ?? <Muted>Не указан</Muted>}</Row>
          </dl>
          <p className="border-t border-line py-2.5 text-sm text-ink-muted">
            Адрес и инструкция по доступу сохранены в задании при создании, правка карточки объекта их не меняет.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Сроки и выполнение</CardTitle>
        </CardHeader>
        <CardBody className="py-1.5">
          <dl className="divide-y divide-line">
            <Row label="Плановые сроки">
              <span className="tabular">{formatInterval(card.planned_start, card.planned_end)}</span>
              {moved ? (
                <span className="ml-2 inline-flex items-center gap-1 text-sm whitespace-nowrap text-ink-muted">
                  <History aria-hidden className="size-3.5" />
                  Перенесено
                </span>
              ) : null}
            </Row>
            {moved ? (
              <Row label="Исходные сроки">
                <span className="tabular">
                  {formatInterval(card.planned_start_original, card.planned_end_original)}
                </span>
              </Row>
            ) : null}
            <Row label="Приоритет">{priorityLabels[card.priority]}</Row>
            <Row label="Создано">
              <Stamp at={card.created_at} by={card.creator_name} />
            </Row>
            {card.accepted_at ? (
              <Row label="Принято бригадой">
                <Stamp at={card.accepted_at} />
              </Row>
            ) : null}
            {card.started_at ? (
              <Row label="Работа начата">
                <Stamp at={card.started_at} />
              </Row>
            ) : null}
            {card.submitted_at ? (
              <Row label="Последний отчёт отправлен">
                <Stamp at={card.submitted_at} />
              </Row>
            ) : null}
            {card.completed_at ? (
              <Row label="Результат принят">
                <Stamp at={card.completed_at} />
              </Row>
            ) : null}
            {card.terms_changed_at ? (
              <Row label="Условия изменены после принятия">
                <Stamp at={card.terms_changed_at} />
              </Row>
            ) : null}
            {card.cancelled_at ? (
              <Row label="Отменено">
                <Stamp at={card.cancelled_at} by={card.canceller_name} />
              </Row>
            ) : null}
            {card.cancel_reason ? (
              <Row label="Причина отмены">
                <span className="whitespace-pre-line">{card.cancel_reason}</span>
              </Row>
            ) : null}
          </dl>
        </CardBody>
      </Card>

      {card.source_task || card.follow_ups.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Связанные задания</CardTitle>
          </CardHeader>
          <CardBody className="py-1.5">
            <dl className="divide-y divide-line">
              {card.source_task ? (
                <Row label="Создано на основе">
                  <TaskLink task={card.source_task} />
                </Row>
              ) : null}
              {card.follow_ups.length ? (
                <Row label="Созданы на основе этого">
                  <ul className="flex flex-col gap-1">
                    {card.follow_ups.map((task) => (
                      <li key={task.id}>
                        <TaskLink task={task} />
                      </li>
                    ))}
                  </ul>
                </Row>
              ) : null}
            </dl>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
