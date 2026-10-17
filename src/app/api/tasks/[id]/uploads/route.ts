import { NextResponse, type NextRequest } from "next/server";
import { maxPhotoBytes } from "@/features/reports/limits";
import { PhotoRejected, processPhoto, type PhotoProblem } from "@/features/reports/photo";
import { getViewer } from "@/lib/auth";
import type { AppError, ErrorKind } from "@/lib/errors";
import { callRpc } from "@/lib/rpc";
import { storeTaskPhoto } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const statusByKind: Record<ErrorKind, number> = {
  auth: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  state: 409,
  validation: 422,
  temporary: 503,
};

const problems: Record<PhotoProblem, { status: number; message: string }> = {
  heic: { status: 415, message: "Формат HEIC не поддерживается. Загрузите фото в формате JPEG, PNG или WebP." },
  unsupported: {
    status: 415,
    message: "Файл не является фотографией JPEG, PNG или WebP. Загрузите файл одного из этих форматов.",
  },
  damaged: { status: 422, message: "Файл повреждён и не открывается как изображение. Выберите другой файл." },
  too_small: { status: 422, message: "Изображение слишком маленькое: нужно не меньше 100 пикселей по каждой стороне." },
  too_big: { status: 422, message: "Слишком большое разрешение: не больше 100 мегапикселей." },
  too_large: { status: 413, message: "Файл больше 10 МБ. Выберите фото меньшего размера." },
};

function failure(error: AppError, status = statusByKind[error.kind]) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

function tooLarge() {
  return failure({ kind: "validation", field: "photos", message: problems.too_large.message }, 413);
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function readBody(request: NextRequest) {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxPhotoBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

export async function POST(request: NextRequest, context: RouteContext<"/api/tasks/[id]/uploads">) {
  const { id } = await context.params;

  if (!sameOrigin(request)) {
    return failure({ kind: "forbidden", message: "Запрос отклонён." });
  }

  const viewer = await getViewer();
  if (!viewer) return failure({ kind: "auth", message: "Сессия истекла. Войдите снова." });
  if (viewer.profile.role !== "foreman") {
    return failure({ kind: "forbidden", message: "Фото к отчёту загружает бригадир задания." });
  }
  if (!uuidPattern.test(id)) {
    return failure({ kind: "not_found", message: "Задание не найдено или у вас нет к нему доступа." });
  }
  if (Number(request.headers.get("content-length") ?? 0) > maxPhotoBytes) return tooLarge();

  const supabase = await createClient();
  const { data: task, error: taskError } = await supabase.from("tasks").select("id, status").eq("id", id).maybeSingle();
  if (taskError) {
    return failure({ kind: "temporary", message: "Сервис временно недоступен. Повторите загрузку." });
  }
  if (!task) return failure({ kind: "not_found", message: "Задание не найдено или у вас нет к нему доступа." });
  if (task.status !== "InProgress") {
    return failure({
      kind: "state",
      message: "Фото можно загрузить, только пока задание в работе. Обновите страницу.",
    });
  }

  let body: Buffer | null;
  try {
    body = await readBody(request);
  } catch {
    return failure({ kind: "temporary", message: "Загрузка прервалась. Повторите попытку." }, 400);
  }
  if (!body) return tooLarge();
  if (body.length === 0) return failure({ kind: "validation", field: "photos", message: "Файл пустой." });

  let photo: Awaited<ReturnType<typeof processPhoto>>;
  try {
    photo = await processPhoto(body);
  } catch (error) {
    if (error instanceof PhotoRejected) {
      const { status, message } = problems[error.problem];
      return failure({ kind: "validation", field: "photos", code: error.problem, message }, status);
    }
    return failure({ kind: "temporary", message: "Не удалось обработать фото. Повторите загрузку." });
  }

  const registered = await callRpc("register_upload", {
    p_task_id: task.id,
    p_mime_type: photo.mimeType,
    p_size_bytes: photo.data.length,
    p_width: photo.width,
    p_height: photo.height,
  });
  if (!registered.ok) return failure(registered.error);

  const { error: storageError } = await storeTaskPhoto(registered.data.storage_path, photo.data, photo.mimeType);
  if (storageError) {
    await callRpc("discard_upload", { p_upload_id: registered.data.upload_id });
    return failure({ kind: "temporary", message: "Не удалось сохранить фото. Повторите загрузку." });
  }

  return NextResponse.json(
    {
      upload: {
        id: registered.data.upload_id,
        mimeType: photo.mimeType,
        width: photo.width,
        height: photo.height,
        size: photo.data.length,
      },
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
