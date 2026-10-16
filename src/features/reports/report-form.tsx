"use client";

import { Camera, Check, ImageIcon, ImagePlus, RefreshCw, Send, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { describedBy, Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ActionError } from "@/features/field/action-error";
import { useClientKey } from "@/hooks/use-client-key";
import type { TaskMutationResult } from "@/lib/database.types";
import type { AppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/rpc";
import { discardUpload, submitReport } from "./actions";
import { commentMax, commentMin, maxPhotoBytes, maxPhotos, photoTypes } from "./limits";
import type { StagedPhoto } from "./queries";
import { sendPhoto } from "./send-photo";

type ItemState = "uploading" | "processing" | "done" | "failed" | "removing";

type Item = {
  key: string;
  name: string;
  size: number;
  preview: string | null;
  file: File | null;
  state: ItemState;
  progress: number;
  uploadId: string | null;
  error: string | null;
  retryable: boolean;
};

type ReportFormProps = {
  taskId: string;
  taskVersion: number;
  staged: StagedPhoto[];
};

const unreachable: AppError = {
  kind: "temporary",
  message: "Не удалось связаться с сервером. Текст и фото сохранены в форме, повторите отправку.",
};

const ignoreChanges = () => () => {};

function readDraft(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeDraft(key: string, value: string | null) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {}
}

function fileProblem(file: File) {
  const type = file.type.toLowerCase();
  if (type === "image/heic" || type === "image/heif" || /\.(heic|heif)$/i.test(file.name)) {
    return "Формат HEIC не поддерживается. Загрузите фото в формате JPEG, PNG или WebP.";
  }
  if (type && !photoTypes.includes(type)) return "Можно загрузить только фото в формате JPEG, PNG или WebP.";
  if (file.size === 0) return "Файл пустой.";
  if (file.size > maxPhotoBytes) return "Файл больше 10 МБ. Выберите фото меньшего размера.";
  return null;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}

export function ReportForm({ taskId, taskVersion, staged }: ReportFormProps) {
  const router = useRouter();
  const clientKey = useClientKey();
  const draftKey = `report-draft:${taskId}`;
  const savedDraft = useSyncExternalStore(
    ignoreChanges,
    () => readDraft(draftKey),
    () => null,
  );
  const [typed, setTyped] = useState<string | null>(null);
  const comment = typed ?? savedDraft ?? "";
  const [items, setItems] = useState<Item[]>(() =>
    staged.map((photo, index) => ({
      key: photo.id,
      name: `Загружено ранее, фото ${index + 1}`,
      size: photo.size,
      preview: photo.url,
      file: null,
      state: "done",
      progress: 1,
      uploadId: photo.id,
      error: null,
      retryable: false,
    })),
  );
  const [commentError, setCommentError] = useState<string | null>(null);
  const [photosError, setPhotosError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [submitting, startSubmit] = useTransition();
  const aborts = useRef(new Map<string, () => void>());
  const previews = useRef(new Set<string>());
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const photosRef = useRef<HTMLFieldSetElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const uploaded = items.flatMap((item) => (item.state === "done" && item.uploadId ? [item.uploadId] : []));
  const busy = items.some(
    (item) => item.state === "uploading" || item.state === "processing" || item.state === "removing",
  );
  const attached = items.filter((item) => item.state !== "failed").length;
  const full = attached >= maxPhotos;

  useEffect(() => {
    const created = previews.current;
    return () => {
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  function update(key: string, patch: Partial<Item>) {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function drop(item: Item) {
    if (item.preview && previews.current.has(item.preview)) {
      URL.revokeObjectURL(item.preview);
      previews.current.delete(item.preview);
    }
    setItems((list) => list.filter((entry) => entry.key !== item.key));
  }

  function upload(key: string, file: File) {
    const { result, abort } = sendPhoto(taskId, file, (share) =>
      update(key, share >= 1 ? { state: "processing", progress: 1 } : { state: "uploading", progress: share }),
    );
    aborts.current.set(key, abort);
    void result.then((outcome) => {
      aborts.current.delete(key);
      if (outcome.ok) {
        update(key, {
          state: "done",
          progress: 1,
          uploadId: outcome.upload.id,
          size: outcome.upload.size,
          error: null,
        });
      } else if (!outcome.aborted) {
        update(key, { state: "failed", error: outcome.message, retryable: outcome.retryable });
      }
    });
  }

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setPhotosError(null);
    const room = Math.max(0, maxPhotos - attached);
    const accepted = files.slice(0, room);
    setNotice(
      files.length > accepted.length
        ? `В отчёте не больше ${maxPhotos} фото. Не добавлено файлов: ${files.length - accepted.length}.`
        : null,
    );
    const created = accepted.map((file): Item => {
      const problem = fileProblem(file);
      const preview = problem ? null : URL.createObjectURL(file);
      if (preview) previews.current.add(preview);
      return {
        key: crypto.randomUUID(),
        name: file.name || "Фото",
        size: file.size,
        preview,
        file,
        state: problem ? "failed" : "uploading",
        progress: 0,
        uploadId: null,
        error: problem,
        retryable: false,
      };
    });
    setItems((list) => [...list, ...created]);
    for (const item of created) {
      if (item.state === "uploading" && item.file) upload(item.key, item.file);
    }
  }

  function retry(item: Item) {
    if (!item.file) return;
    setPhotosError(null);
    update(item.key, { state: "uploading", progress: 0, error: null, retryable: false });
    upload(item.key, item.file);
  }

  async function remove(item: Item) {
    setPhotosError(null);
    if (item.state === "uploading") {
      aborts.current.get(item.key)?.();
      aborts.current.delete(item.key);
      drop(item);
      return;
    }
    if (item.state === "failed" || !item.uploadId) {
      drop(item);
      return;
    }
    update(item.key, { state: "removing", error: null });
    const result = await discardUpload({ uploadId: item.uploadId }).catch(() => null);
    if (result?.ok) {
      drop(item);
      return;
    }
    update(item.key, {
      state: "done",
      error: result && !result.ok ? result.error.message : "Не удалось убрать фото. Повторите.",
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitting) return;
    setError(null);
    const length = comment.trim().length;
    const commentProblem =
      length < commentMin || length > commentMax
        ? `Напишите комментарий: от ${commentMin} до ${commentMax} символов.`
        : null;
    const photosProblem = items.some((item) => item.state === "failed")
      ? "Есть фото с ошибкой: загрузите их заново или уберите из отчёта."
      : uploaded.length === 0
        ? "Добавьте хотя бы одно фото."
        : null;
    setCommentError(commentProblem);
    setPhotosError(photosProblem);
    if (commentProblem) commentRef.current?.focus();
    else if (photosProblem) photosRef.current?.focus();
    if (commentProblem || photosProblem) return;

    startSubmit(async () => {
      let result: ActionResult<TaskMutationResult>;
      try {
        result = await submitReport({
          taskId,
          version: taskVersion,
          comment,
          uploadIds: uploaded,
          clientKey: clientKey.current(),
        });
      } catch {
        setError(unreachable);
        return;
      }
      if (result.ok) {
        clientKey.reset();
        writeDraft(draftKey, null);
        router.push(`/tasks/${taskId}?tab=reports`);
        return;
      }
      const failure = result.error;
      if (failure.kind === "validation" && failure.field === "comment") setCommentError(failure.message);
      else if (failure.kind === "validation" && failure.field === "photos") setPhotosError(failure.message);
      else setError(failure);
      if (failure.kind === "conflict" || failure.kind === "state" || failure.kind === "not_found") router.refresh();
    });
  }

  const doneCount = items.filter((item) => item.state === "done").length;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Card>
        <CardBody className="flex flex-col gap-6">
          <Field
            id="report-comment"
            label="Комментарий"
            required
            error={commentError}
            hint={`Что сделано, объём, на что обратить внимание. От ${commentMin} до ${commentMax} символов.`}
          >
            <Textarea
              ref={commentRef}
              id="report-comment"
              rows={5}
              maxLength={commentMax}
              value={comment}
              onChange={(event) => {
                setTyped(event.target.value);
                setCommentError(null);
                writeDraft(draftKey, event.target.value);
              }}
              aria-invalid={Boolean(commentError)}
              aria-describedby={describedBy("report-comment", commentError, true)}
            />
            <p aria-hidden className="tabular -mt-1 text-right text-xs text-ink-muted">
              {comment.trim().length} / {commentMax}
            </p>
          </Field>

          <fieldset
            ref={photosRef}
            tabIndex={-1}
            aria-describedby={photosError ? "report-photos-error" : "report-photos-hint"}
            className="flex flex-col gap-3 focus-visible:outline-none"
          >
            <legend className="text-sm font-medium">
              Фотографии<span className="text-ink-muted"> *</span>
            </legend>
            <p id="report-photos-hint" className="-mt-1 text-sm text-ink-muted">
              От 1 до {maxPhotos} фото в формате JPEG, PNG или WebP, до 10 МБ каждое. Геометки и другие метаданные
              удаляются при загрузке.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="hidden flex-1 pointer-coarse:inline-flex sm:flex-none"
                disabled={full}
                onClick={() => cameraInput.current?.click()}
              >
                <Camera aria-hidden className="size-4" />
                Снять фото
              </Button>
              <Button
                variant="secondary"
                className="flex-1 sm:flex-none"
                disabled={full}
                onClick={() => galleryInput.current?.click()}
              >
                <ImagePlus aria-hidden className="size-4" />
                <span className="pointer-coarse:hidden">Выбрать файлы</span>
                <span className="hidden pointer-coarse:inline">Из галереи</span>
              </Button>
            </div>
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              tabIndex={-1}
              aria-hidden
              className="sr-only"
              onChange={addFiles}
            />
            <input
              ref={galleryInput}
              type="file"
              accept="image/*"
              multiple
              tabIndex={-1}
              aria-hidden
              className="sr-only"
              onChange={addFiles}
            />
            {full ? <p className="text-sm text-ink-muted">Добавлено максимальное число фото.</p> : null}
            {notice ? (
              <p role="status" className="text-sm text-warning">
                {notice}
              </p>
            ) : null}
            {photosError ? (
              <p id="report-photos-error" role="alert" className="text-sm text-danger">
                {photosError}
              </p>
            ) : null}
            <p className="sr-only" aria-live="polite">
              {items.length ? `Загружено фото: ${doneCount} из ${items.length}` : ""}
            </p>

            {items.length ? (
              <ul className="flex flex-col gap-2">
                {items.map((item) => {
                  const percent = Math.round(item.progress * 100);
                  return (
                    <li
                      key={item.key}
                      className={
                        item.state === "failed"
                          ? "flex items-center gap-3 rounded-lg border border-[#fecaca] bg-danger-soft p-2"
                          : "flex items-center gap-3 rounded-lg border border-line p-2"
                      }
                    >
                      <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-canvas">
                        {item.preview ? (
                          <Image
                            unoptimized
                            fill
                            src={item.preview}
                            alt=""
                            sizes="56px"
                            className="object-cover"
                            onError={() => update(item.key, { preview: null })}
                          />
                        ) : (
                          <ImageIcon aria-hidden className="size-5 text-ink-muted" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        {item.state === "uploading" ? (
                          <>
                            <div
                              role="progressbar"
                              aria-label={`Загрузка ${item.name}`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={percent}
                              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"
                            >
                              <div className="h-full bg-status-assigned" style={{ width: `${percent}%` }} />
                            </div>
                            <p className="tabular mt-1 text-xs text-ink-muted">Загрузка {percent}%</p>
                          </>
                        ) : null}
                        {item.state === "processing" ? (
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                            <Spinner className="size-3" label="Обработка" />
                            Проверяем и сохраняем…
                          </p>
                        ) : null}
                        {item.state === "removing" ? <p className="mt-1 text-xs text-ink-muted">Убираем…</p> : null}
                        {item.state === "done" && !item.error ? (
                          <p className="mt-1 flex items-center gap-1 text-xs text-success">
                            <Check aria-hidden className="size-3.5" />
                            Загружено · {formatSize(item.size)}
                          </p>
                        ) : null}
                        {item.error ? <p className="mt-1 text-xs text-danger">{item.error}</p> : null}
                      </div>
                      {item.state === "failed" && item.retryable && item.file ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => retry(item)}
                          aria-label={`Повторить загрузку: ${item.name}`}
                        >
                          <RefreshCw aria-hidden className="size-4" />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={item.state === "processing" || item.state === "removing"}
                        onClick={() => void remove(item)}
                        aria-label={`Убрать из отчёта: ${item.name}`}
                      >
                        <X aria-hidden className="size-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </fieldset>
        </CardBody>
      </Card>

      <ActionError error={error} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" disabled={busy || submitting} aria-describedby="report-submit-hint">
          {submitting ? <Spinner label="Отправляем" /> : <Send aria-hidden className="size-4" />}
          {submitting ? "Отправляем…" : "Отправить отчёт"}
        </Button>
        <Link href={`/tasks/${taskId}`} className={buttonVariants({ variant: "ghost" })}>
          Вернуться к заданию
        </Link>
        <p id="report-submit-hint" className="text-sm text-ink-muted sm:ml-2">
          {busy
            ? "Дождитесь окончания загрузки фото."
            : `Фото в отчёте: ${uploaded.length} из ${maxPhotos}. После отправки отчёт уйдёт на проверку диспетчеру.`}
        </p>
      </div>
    </form>
  );
}
