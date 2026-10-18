import { connectionLost, type AppError } from "@/lib/errors";

type UploadedPhoto = {
  id: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
};

type UploadOutcome =
  { ok: true; upload: UploadedPhoto } | { ok: false; message: string; retryable: boolean; aborted?: boolean };

export function sendPhoto(taskId: string, file: File, onProgress: (share: number) => void) {
  const request = new XMLHttpRequest();
  const result = new Promise<UploadOutcome>((resolve) => {
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      const body = request.response as { upload?: UploadedPhoto; error?: AppError } | null;
      if (request.status === 201 && body?.upload) {
        resolve({ ok: true, upload: body.upload });
        return;
      }
      resolve({
        ok: false,
        message: body?.error?.message ?? "Не удалось загрузить фото. Повторите попытку.",
        retryable: request.status >= 500 || request.status === 429,
      });
    };
    request.onerror = () => resolve({ ok: false, message: connectionLost.message, retryable: true });
    request.ontimeout = () =>
      resolve({ ok: false, message: "Загрузка заняла слишком много времени. Повторите попытку.", retryable: true });
    request.onabort = () => resolve({ ok: false, message: "Загрузка отменена.", retryable: true, aborted: true });
  });

  request.open("POST", `/api/tasks/${taskId}/uploads`);
  request.responseType = "json";
  request.timeout = 180_000;
  request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
  request.send(file);

  return { result, abort: () => request.abort() };
}
