"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { RefreshStatus } from "@/components/app/refresh-status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { describedBy, Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { useClientKey } from "@/hooks/use-client-key";
import { usePolling } from "@/hooks/use-polling";
import { cn } from "@/lib/cn";
import type { TaskStatus, UserRole } from "@/lib/database.types";
import type { AppError } from "@/lib/errors";
import { roleLabels } from "@/lib/labels";
import type { Snapshot } from "@/lib/snapshot";
import { formatDateTime, timeZoneLabel } from "@/lib/time";
import { loadDiscussion, postMessage } from "./actions";
import { messageLimit, type Discussion, type Message } from "./types";

type Author = { id: string; name: string; role: UserRole };

type DiscussionThreadProps = {
  taskId: string;
  initial: Snapshot<Discussion>;
  author: Author;
};

const bodyId = "message-body";

function closedReason(role: UserRole, status: TaskStatus) {
  if (status === "Completed") return "Задание завершено, обсуждение закрыто и доступно только для чтения.";
  if (status === "Cancelled") return "Задание отменено, обсуждение закрыто и доступно только для чтения.";
  if (role === "manager") {
    return "Руководитель читает обсуждение, но не пишет в нём. Сообщения отправляют диспетчер и бригадир назначенной бригады.";
  }
  return null;
}

function textLength(value: string) {
  return Array.from(value.trim()).length;
}

export function DiscussionThread({ taskId, initial, author }: DiscussionThreadProps) {
  const { data, loadedAt, error, refreshing, refresh } = usePolling(() => loadDiscussion(taskId), initial);
  const [sent, setSent] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const known = new Set(data.messages.map((message) => message.id));
  const messages = [...data.messages, ...sent.filter((message) => !known.has(message.id))];
  const closed = closedReason(author.role, data.status);

  return (
    <Card>
      <CardHeader className="flex-wrap items-center">
        <div>
          <CardTitle>
            Обсуждение <span className="tabular font-normal text-ink-muted">· {messages.length}</span>
          </CardTitle>
          <p className="text-sm text-ink-muted">Время указано в поясе компании: {timeZoneLabel()}</p>
        </div>
        <RefreshStatus loadedAt={loadedAt} error={error} refreshing={refreshing} onRefresh={refresh} />
      </CardHeader>

      {messages.length ? (
        <ol aria-label="Сообщения" className="divide-y divide-line">
          {messages.map((message) => (
            <MessageItem key={message.id} message={message} own={message.authorId === author.id} />
          ))}
        </ol>
      ) : (
        <EmptyState
          title={closed ? "Сообщений нет" : "Сообщений пока нет"}
          description={
            closed
              ? "В этом задании не было переписки."
              : "Если нужно что-то уточнить по заданию, напишите здесь — сообщение увидят диспетчер и бригадир."
          }
        />
      )}

      <div className="border-t border-line px-4 py-4 sm:px-5">
        {closed ? (
          <ClosedNotice reason={closed} draft={draft} />
        ) : (
          <Composer
            taskId={taskId}
            author={author}
            draft={draft}
            onDraft={setDraft}
            onSent={(message) => setSent((current) => [...current, message])}
          />
        )}
      </div>
    </Card>
  );
}

function MessageItem({ message, own }: { message: Message; own: boolean }) {
  return (
    <li className={cn("px-4 py-3 sm:px-5", own && "bg-canvas/70")}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-medium">{message.authorName ?? "Пользователь"}</span>
        <span className="text-sm text-ink-muted">
          {roleLabels[message.authorRole]}
          {own ? " · вы" : null}
        </span>
        <time dateTime={message.createdAt} className="tabular text-sm text-ink-muted sm:ml-auto">
          {formatDateTime(message.createdAt)}
        </time>
      </div>
      <p className="mt-1 break-words whitespace-pre-wrap">{message.body}</p>
    </li>
  );
}

function ClosedNotice({ reason, draft }: { reason: string; draft: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Alert variant="info">{reason}</Alert>
      {draft.trim() ? (
        <Field id={bodyId} label="Неотправленный текст" hint="Скопируйте его, если он ещё нужен.">
          <Textarea id={bodyId} value={draft} readOnly rows={3} aria-describedby={`${bodyId}-hint`} />
        </Field>
      ) : null}
    </div>
  );
}

type ComposerProps = {
  taskId: string;
  author: Author;
  draft: string;
  onDraft: (value: string) => void;
  onSent: (message: Message) => void;
};

function Composer({ taskId, author, draft, onDraft, onSent }: ComposerProps) {
  const router = useRouter();
  const key = useClientKey();
  const [error, setError] = useState<AppError | null>(null);
  const [pending, setPending] = useState(false);
  const length = textLength(draft);
  const fieldError = error?.kind === "validation" ? error.message : null;

  function change(value: string) {
    key.reset();
    onDraft(value);
    if (fieldError) setError(null);
  }

  async function send() {
    if (pending) return;
    const body = draft.trim();
    const problem = !body
      ? "Введите текст сообщения."
      : textLength(body) > messageLimit
        ? `Сообщение: не больше ${messageLimit} символов.`
        : null;
    if (problem) {
      setError({ kind: "validation", field: "body", message: problem });
      document.getElementById(bodyId)?.focus();
      return;
    }

    setPending(true);
    setError(null);
    try {
      const result = await postMessage({ taskId, body, clientKey: key.current() });
      if (!result.ok) {
        setError(result.error);
        if (result.error.kind !== "validation" && result.error.kind !== "temporary") router.refresh();
        return;
      }
      key.reset();
      onSent({
        id: result.data.id,
        authorId: author.id,
        authorName: author.name,
        authorRole: author.role,
        body,
        createdAt: result.data.createdAt,
      });
      onDraft("");
      router.refresh();
    } catch {
      setError({ kind: "temporary", message: "Нет связи с сервером. Текст сохранён, попробуйте отправить ещё раз." });
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  function shortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <Field id={bodyId} label="Новое сообщение" error={fieldError}>
        <Textarea
          id={bodyId}
          value={draft}
          onChange={(event) => change(event.target.value)}
          onKeyDown={shortcut}
          readOnly={pending}
          rows={3}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={describedBy(bodyId, fieldError) ?? `${bodyId}-counter`}
        />
      </Field>
      {error && !fieldError ? <Alert variant="danger">{error.message}</Alert> : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p id={`${bodyId}-counter`} className="text-sm text-ink-muted">
          <span className={cn("tabular", length > messageLimit && "font-medium text-danger")}>
            {length} из {messageLimit}
          </span>
          <span className="hidden sm:inline"> · Ctrl+Enter — отправить</span>
        </p>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          <Send aria-hidden className="size-4" />
          {pending ? "Отправляем…" : "Отправить"}
        </Button>
      </div>
    </form>
  );
}
