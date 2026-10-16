import {
  AlertOctagon,
  BadgeCheck,
  CalendarClock,
  Camera,
  CheckCircle2,
  Circle,
  CircleDashed,
  Eye,
  FilePlus2,
  Hammer,
  Handshake,
  OctagonX,
  PencilLine,
  ShieldCheck,
  Undo2,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { StatusBadge } from "@/components/app/task-badges";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { TaskStatus } from "@/lib/database.types";
import { obstacleLabels, priorityLabels, roleLabels, statusLabels, taskCode } from "@/lib/labels";
import { formatDateTime, formatDuration, formatInterval, formatTime } from "@/lib/time";
import type { HistoryEvent } from "./types";

type Data = Record<string, unknown>;

type Tone = "neutral" | "info" | "accepted" | "progress" | "review" | "success" | "warning" | "cancelled";

type Row = { label: string; value: ReactNode };

type EventView = {
  Icon: LucideIcon;
  tone: Tone;
  title: string;
  system?: boolean;
  note?: ReactNode;
  rows: Row[];
  reports?: boolean;
};

export type HistoryContext = {
  taskId: string;
  title: string;
  sourceTask: { id: string; number: number } | null;
  obstacleOpenedAt: Map<string, string>;
  linkTasks: boolean;
};

const tones: Record<Tone, string> = {
  neutral: "border-line bg-canvas text-ink-muted",
  info: "border-[#bfdbfe] bg-status-assigned-soft text-status-assigned",
  accepted: "border-[#ddd6fe] bg-status-accepted-soft text-status-accepted",
  progress: "border-[#fed7aa] bg-status-progress-soft text-status-progress",
  review: "border-[#c7d2fe] bg-status-review-soft text-status-review",
  success: "border-[#bbf7d0] bg-status-done-soft text-status-done",
  warning: "border-[#fde68a] bg-warning-soft text-warning",
  cancelled: "border-[#e5e7eb] bg-status-cancelled-soft text-status-cancelled",
};

const statusLook: Record<TaskStatus, { Icon: LucideIcon; tone: Tone }> = {
  Assigned: { Icon: CircleDashed, tone: "info" },
  Accepted: { Icon: Handshake, tone: "accepted" },
  InProgress: { Icon: Hammer, tone: "progress" },
  InReview: { Icon: Eye, tone: "review" },
  Completed: { Icon: CheckCircle2, tone: "success" },
  Cancelled: { Icon: OctagonX, tone: "cancelled" },
};

const transitions: Record<string, string> = {
  "Assigned>Accepted": "Задание принято бригадой",
  "Accepted>InProgress": "Работа начата",
  "InProgress>InReview": "Задание передано на проверку",
  "InReview>Completed": "Задание завершено",
  "InReview>InProgress": "Задание снова в работе",
};

const fieldLabels: Record<string, string> = {
  title: "Название",
  description: "Описание",
  priority: "Приоритет",
  address_snapshot: "Адрес в задании",
  access_note_snapshot: "Инструкция по доступу",
};

const fieldOrder = ["title", "priority", "address_snapshot", "access_note_snapshot", "description"];
const longFields = new Set(["title", "description", "address_snapshot", "access_note_snapshot"]);

function record(value: unknown): Data {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Data) : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function moment(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function oneOf<T extends string>(value: unknown, labels: Record<T, string>) {
  return typeof value === "string" && Object.hasOwn(labels, value) ? (value as T) : null;
}

const missing = <span className="text-ink-muted">не указано</span>;

function plain(value: unknown): ReactNode {
  if (typeof value === "string") return value.trim() ? value : missing;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return value == null ? missing : "изменено";
}

function interval(value: unknown) {
  const data = record(value);
  const start = moment(data.planned_start);
  const end = moment(data.planned_end);
  return start && end ? formatInterval(start, end) : missing;
}

function status(value: unknown) {
  const known = oneOf(value, statusLabels);
  return known ? <StatusBadge status={known} /> : missing;
}

function Change({ from, to, stacked = false }: { from: ReactNode; to: ReactNode; stacked?: boolean }) {
  if (stacked) {
    return (
      <span className="flex flex-col gap-1">
        <span className="whitespace-pre-line">
          <span className="text-ink-muted">Было: </span>
          {from}
        </span>
        <span className="whitespace-pre-line">
          <span className="text-ink-muted">Стало: </span>
          {to}
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span className="sr-only">было</span>
      {from}
      <span aria-hidden className="text-ink-muted">
        →
      </span>
      <span className="sr-only">стало</span>
      {to}
    </span>
  );
}

function overlapRow(value: unknown, context: HistoryContext): Row[] {
  const items = (Array.isArray(value) ? value : [])
    .map((item) => ({ id: text(record(item).id), number: count(record(item).number) }))
    .filter((item): item is { id: string; number: number } => Boolean(item.id && item.number));
  if (!items.length) return [];
  return [
    {
      label: "Пересечение по срокам",
      value: (
        <>
          {items.map((item, index) => (
            <Fragment key={item.id}>
              {index ? ", " : null}
              {context.linkTasks ? (
                <Link href={`/tasks/${item.id}`} className="tabular text-status-assigned hover:underline">
                  {taskCode(item.number)}
                </Link>
              ) : (
                <span className="tabular">{taskCode(item.number)}</span>
              )}
            </Fragment>
          ))}{" "}
          <span className="text-ink-muted">— сохранено с подтверждением</span>
        </>
      ),
    },
  ];
}

function reasonRow(value: unknown, label = "Причина"): Row[] {
  const reason = text(value);
  return reason ? [{ label, value: <span className="whitespace-pre-line">{reason}</span> }] : [];
}

function created(data: Data, context: HistoryContext): EventView {
  const rows: Row[] = [];
  const title = text(data.title);
  const site = text(data.site_name);
  const crew = text(data.crew_name);
  const priority = oneOf(data.priority, priorityLabels);
  const source = data.source_task_id === undefined ? (context.sourceTask?.id ?? null) : text(data.source_task_id);
  if (title && title !== context.title) rows.push({ label: "Название", value: title });
  if (site) rows.push({ label: "Объект", value: site });
  if (crew) rows.push({ label: "Бригада", value: crew });
  if (priority) rows.push({ label: "Приоритет", value: priorityLabels[priority] });
  if (moment(data.planned_start) && moment(data.planned_end)) rows.push({ label: "Срок", value: interval(data) });
  if (source) {
    rows.push({
      label: "На основе",
      value:
        context.sourceTask?.id === source ? (
          <Link href={`/tasks/${source}`} className="tabular text-status-assigned hover:underline">
            {taskCode(context.sourceTask.number)}
          </Link>
        ) : (
          "другого задания"
        ),
    });
  }
  return {
    Icon: FilePlus2,
    tone: "info",
    title: "Задание создано",
    rows: [...rows, ...overlapRow(data.overlaps_acknowledged, context)],
  };
}

function fieldValue(key: string, value: unknown) {
  const priority = key === "priority" ? oneOf(value, priorityLabels) : null;
  return priority ? priorityLabels[priority] : plain(value);
}

function detailsChanged(data: Data): EventView {
  const changes = record(data.changes);
  const keys = [
    ...fieldOrder.filter((key) => Object.hasOwn(changes, key)),
    ...Object.keys(changes).filter((key) => !fieldOrder.includes(key)),
  ];
  const rows = keys.map((key) => {
    const change = record(changes[key]);
    return {
      label: fieldLabels[key] ?? "Другое поле",
      value: (
        <Change from={fieldValue(key, change.old)} to={fieldValue(key, change.new)} stacked={longFields.has(key)} />
      ),
    };
  });
  return {
    Icon: PencilLine,
    tone: "neutral",
    title: "Изменены условия задания",
    note: data.after_acceptance === true ? <Badge tone="warning">Изменено после принятия бригадой</Badge> : null,
    rows,
  };
}

function rescheduled(data: Data, context: HistoryContext): EventView {
  return {
    Icon: CalendarClock,
    tone: "neutral",
    title: "Перенесён срок",
    rows: [
      { label: "Срок", value: <Change from={interval(data.old)} to={interval(data.new)} stacked /> },
      ...reasonRow(data.reason),
      ...overlapRow(data.overlaps_acknowledged, context),
    ],
  };
}

function reassigned(data: Data, context: HistoryContext): EventView {
  const before = record(data.old);
  const after = record(data.new);
  const rows: Row[] = [
    {
      label: "Бригада",
      value: <Change from={text(before.crew_name) ?? missing} to={text(after.crew_name) ?? missing} />,
    },
  ];
  if (before.status !== after.status) {
    rows.push({ label: "Статус", value: <Change from={status(before.status)} to={status(after.status)} /> });
  }
  return {
    Icon: Users,
    tone: "info",
    title: "Задание передано другой бригаде",
    rows: [...rows, ...reasonRow(data.reason), ...overlapRow(data.overlaps_acknowledged, context)],
  };
}

function cancelled(data: Data): EventView {
  const rows: Row[] = [];
  if (data.old_status !== undefined) {
    rows.push({ label: "Статус", value: <Change from={status(data.old_status)} to={status("Cancelled")} /> });
  }
  rows.push(...reasonRow(data.reason));
  if (text(data.pending_report_id)) {
    rows.push({ label: "Отчёт", value: "Ожидавший проверки отчёт закрыт вместе с заданием, без приёмки" });
  }
  return { Icon: OctagonX, tone: "cancelled", title: "Задание отменено", rows };
}

function statusChanged(data: Data): EventView {
  const from = oneOf(data.old, statusLabels);
  const to = oneOf(data.new, statusLabels);
  const look = to ? statusLook[to] : { Icon: Circle, tone: "neutral" as Tone };
  return {
    ...look,
    title: (from && to && transitions[`${from}>${to}`]) || "Изменён статус",
    rows: [{ label: "Статус", value: <Change from={status(data.old)} to={status(data.new)} /> }],
  };
}

function obstacleOpened(data: Data): EventView {
  const category = oneOf(data.category, obstacleLabels);
  return {
    Icon: AlertOctagon,
    tone: "warning",
    title: "Открыто препятствие",
    rows: [...(category ? [{ label: "Категория", value: obstacleLabels[category] }] : []), ...reasonRow(data.reason)],
  };
}

function obstacleClosed(data: Data, event: HistoryEvent, context: HistoryContext): EventView {
  const category = oneOf(data.category, obstacleLabels);
  const seconds = count(data.duration_seconds);
  const openedAt = context.obstacleOpenedAt.get(text(data.obstacle_id) ?? "");
  const duration =
    seconds !== null
      ? seconds < 60
        ? "меньше минуты"
        : formatDuration(new Date(0), new Date(seconds * 1000))
      : openedAt
        ? formatDuration(openedAt, event.createdAt)
        : null;
  const system = data.system === true;
  return {
    Icon: ShieldCheck,
    tone: "success",
    title: system ? "Препятствие закрыто автоматически" : "Препятствие закрыто",
    system,
    rows: [
      ...(category ? [{ label: "Категория", value: obstacleLabels[category] }] : []),
      ...reasonRow(data.comment, "Комментарий"),
      ...(duration ? [{ label: "Длительность", value: duration }] : []),
    ],
  };
}

function versionTitle(data: Data, withVersion: (version: number) => string, fallback: string) {
  const version = count(data.version);
  return version !== null ? withVersion(version) : fallback;
}

function reportSubmitted(data: Data): EventView {
  const photos = count(data.photos);
  return {
    Icon: Camera,
    tone: "review",
    title: versionTitle(data, (version) => `Отправлен отчёт, версия ${version}`, "Отправлен отчёт"),
    rows: photos !== null ? [{ label: "Фотографии", value: <span className="tabular">{photos}</span> }] : [],
    reports: true,
  };
}

function reportAccepted(data: Data): EventView {
  const submittedAt = moment(data.submitted_at);
  return {
    Icon: BadgeCheck,
    tone: "success",
    title: versionTitle(data, (version) => `Отчёт версии ${version} принят`, "Отчёт принят"),
    rows: submittedAt ? [{ label: "Отчёт отправлен", value: formatDateTime(submittedAt) }] : [],
    reports: true,
  };
}

function reportReturned(data: Data): EventView {
  return {
    Icon: Undo2,
    tone: "warning",
    title: versionTitle(data, (version) => `Отчёт версии ${version} возвращён на доработку`, "Отчёт возвращён"),
    rows: reasonRow(data.note, "Замечание"),
    reports: true,
  };
}

function describe(event: HistoryEvent, context: HistoryContext): EventView {
  const data = record(event.data);
  switch (event.kind) {
    case "created":
      return created(data, context);
    case "details_changed":
      return detailsChanged(data);
    case "rescheduled":
      return rescheduled(data, context);
    case "reassigned":
      return reassigned(data, context);
    case "cancelled":
      return cancelled(data);
    case "status_changed":
      return statusChanged(data);
    case "obstacle_opened":
      return obstacleOpened(data);
    case "obstacle_closed":
      return obstacleClosed(data, event, context);
    case "report_submitted":
      return reportSubmitted(data);
    case "report_accepted":
      return reportAccepted(data);
    case "report_returned":
      return reportReturned(data);
    default:
      return { Icon: Circle, tone: "neutral", title: "Изменение в задании", rows: [] };
  }
}

export function openedObstacles(events: HistoryEvent[]) {
  const opened = new Map<string, string>();
  for (const event of events) {
    const id = event.kind === "obstacle_opened" ? text(record(event.data).obstacle_id) : null;
    if (id) opened.set(id, event.createdAt);
  }
  return opened;
}

export function EventItem({ event, context }: { event: HistoryEvent; context: HistoryContext }) {
  const view = describe(event, context);
  const actor =
    view.system || !event.actorId
      ? "Система"
      : [event.actorName ?? "Пользователь", event.actorRole ? roleLabels[event.actorRole] : null]
          .filter(Boolean)
          .join(" · ");

  return (
    <li className="flex gap-3 px-4 py-3.5 sm:px-5">
      <span
        aria-hidden
        className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border", tones[view.tone])}
      >
        <view.Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="font-medium">{view.title}</p>
          <time
            dateTime={event.createdAt}
            title={formatDateTime(event.createdAt)}
            className="tabular text-sm text-ink-muted"
          >
            {formatTime(event.createdAt)}
          </time>
        </div>
        <p className="text-sm text-ink-muted">{actor}</p>
        {view.note ? <div className="mt-1.5">{view.note}</div> : null}
        {view.rows.length ? (
          <dl className="mt-2 flex flex-col gap-1.5 text-[15px]">
            {view.rows.map((row, index) => (
              <div key={index} className="sm:grid sm:grid-cols-[10.5rem_minmax(0,1fr)] sm:gap-3">
                <dt className="text-sm text-ink-muted sm:pt-0.5">{row.label}</dt>
                <dd className="break-words">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {view.reports ? (
          <Link
            href={`/tasks/${context.taskId}?tab=reports`}
            scroll={false}
            className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-status-assigned hover:underline sm:min-h-8"
          >
            Открыть отчёты
          </Link>
        ) : null}
      </div>
    </li>
  );
}
