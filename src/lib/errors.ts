export type ErrorKind = "auth" | "forbidden" | "validation" | "conflict" | "not_found" | "state" | "temporary";

export type AppError = {
  kind: ErrorKind;
  message: string;
  field?: string;
  code?: string;
};

type RawError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

const fieldNames: Record<string, string> = {
  title: "Название",
  description: "Описание",
  site_id: "Объект",
  crew_id: "Бригада",
  planned_start: "Начало",
  planned_end: "Окончание",
  reason: "Причина",
  comment: "Комментарий",
  note: "Замечание",
  body: "Сообщение",
  category: "Категория",
  photos: "Фотографии",
  address_snapshot: "Адрес",
  access_note_snapshot: "Инструкция по доступу",
  name: "Название",
  address: "Адрес",
  access_note: "Примечание о доступе",
  contact: "Контакт",
  members: "Состав",
  source_task_id: "Исходное задание",
};

const stateMessages: Record<string, string> = {
  invalid_status: "Действие недоступно в текущем статусе задания. Карточка обновлена.",
  obstacle_open: "Сначала закройте открытое препятствие.",
  obstacle_not_open: "Открытого препятствия уже нет.",
  report_already_decided: "По этому отчёту уже принято решение.",
  site_in_use: "Объект используется в заданиях, его можно только архивировать.",
  active_tasks: "Есть незавершённые задания, архивирование невозможно.",
  site_archived: "Объект в архиве, изменить его нельзя.",
  crew_archived: "Бригада в архиве, изменить её нельзя.",
};

const notFoundMessages: Record<string, string> = {
  task_not_found: "Задание не найдено или у вас нет к нему доступа.",
  report_not_found: "Отчёт не найден или у вас нет к нему доступа.",
  site_not_found: "Объект не найден или у вас нет к нему доступа.",
  crew_not_found: "Бригада не найдена или у вас нет к ней доступа.",
};

export const connectionLost: AppError = {
  kind: "temporary",
  message: "Нет связи с сервером. Проверьте подключение и повторите.",
};

function parseDetail(details: string | null | undefined): Record<string, unknown> {
  if (!details) return {};
  try {
    const parsed = JSON.parse(details);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function validationMessage(message: string, detail: Record<string, unknown>) {
  const field = typeof detail.field === "string" ? detail.field : undefined;
  const label = field ? (fieldNames[field] ?? field) : undefined;
  switch (message) {
    case "invalid_interval":
      return "Начало должно быть раньше окончания.";
    case "archived_reference":
      if (field === "site_id") return "Объект в архиве, выберите другой.";
      if (field === "crew_id") return "Бригада в архиве, выберите другую.";
      return "Выбранная запись в архиве.";
    case "too_many_members": {
      const max = detail.max_count ?? detail.max;
      return typeof max === "number"
        ? `В составе бригады может быть не больше ${max} человек.`
        : "В составе бригады слишком много человек.";
    }
    case "nothing_changed":
      return "Новые значения совпадают с текущими.";
    case "unsupported_file_type":
      return "Поддерживаются только фотографии JPEG, PNG и WebP.";
    case "file_too_large":
      return "Файл больше 10 МБ.";
    case "invalid_photo_count":
      return "Приложите от 1 до 10 фотографий.";
    case "uploads_not_ready":
      return "Не все фотографии загружены. Дождитесь окончания загрузки или удалите проблемные файлы.";
    case "too_many_staged_files":
      return "Слишком много незавершённых загрузок. Отправьте отчёт или повторите позже.";
    default: {
      if (field === "client_key") return "Не удалось обработать запрос. Обновите страницу и повторите.";
      if (label && typeof detail.min === "number" && typeof detail.max === "number") {
        return `${label}: от ${detail.min} до ${detail.max} символов.`;
      }
      if (label && typeof detail.max === "number") {
        return `${label}: не больше ${detail.max} символов.`;
      }
      return label ? `Проверьте поле «${label}».` : "Проверьте введённые данные.";
    }
  }
}

export function toAppError(error: RawError | null | undefined): AppError {
  if (!error) return { kind: "temporary", message: "Не удалось выполнить запрос. Попробуйте ещё раз." };
  const code = error.code ?? "";
  const detail = parseDetail(error.details);

  switch (code) {
    case "MB401":
    case "PGRST301":
    case "PGRST303":
      return { kind: "auth", code, message: "Сессия истекла. Войдите снова." };
    case "MB403":
    case "42501":
      return {
        kind: "forbidden",
        code,
        message:
          error.message === "profile_missing"
            ? "Профиль сотрудника не настроен. Обратитесь к руководителю подразделения."
            : "Недостаточно прав для этого действия.",
      };
    case "MB404":
    case "PGRST116":
      return {
        kind: "not_found",
        code,
        message: notFoundMessages[error.message ?? ""] ?? "Запись не найдена или у вас нет к ней доступа.",
      };
    case "MB409":
      return {
        kind: "conflict",
        code,
        message:
          "current_version" in detail
            ? "Задание изменилось, пока вы работали. Мы показали актуальные данные, проверьте их и повторите действие."
            : "Данные изменил другой пользователь. Мы показали актуальные данные, проверьте их и повторите действие.",
      };
    case "MB422":
      return {
        kind: "validation",
        code,
        field: typeof detail.field === "string" ? detail.field : undefined,
        message: validationMessage(error.message ?? "", detail),
      };
    case "MB423":
      return {
        kind: "state",
        code,
        message: stateMessages[error.message ?? ""] ?? "Действие сейчас недоступно. Карточка обновлена.",
      };
    case "23505":
      return { kind: "conflict", code, message: "Такая запись уже существует." };
    case "23503":
      return {
        kind: "conflict",
        code,
        message: "Связанная запись изменилась или удалена. Мы показали актуальные данные, повторите действие.",
      };
    default:
      return {
        kind: "temporary",
        code,
        message: "Сервис временно недоступен. Данные не изменены, попробуйте ещё раз.",
      };
  }
}
