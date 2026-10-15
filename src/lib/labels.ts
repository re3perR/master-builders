import type { ObstacleCategory, ReportDecision, TaskPriority, TaskStatus, UserRole } from "@/lib/database.types";

export const roleLabels: Record<UserRole, string> = {
  dispatcher: "Диспетчер",
  foreman: "Бригадир",
  manager: "Руководитель",
};

export const statusLabels: Record<TaskStatus, string> = {
  Assigned: "Назначено",
  Accepted: "Принято",
  InProgress: "В работе",
  InReview: "На проверке",
  Completed: "Завершено",
  Cancelled: "Отменено",
};

export const statusOrder: TaskStatus[] = ["Assigned", "Accepted", "InProgress", "InReview", "Completed", "Cancelled"];

export const activeStatuses: TaskStatus[] = ["Assigned", "Accepted", "InProgress", "InReview"];

export const executionStatuses: TaskStatus[] = ["Assigned", "Accepted", "InProgress"];

export const finalStatuses: TaskStatus[] = ["Completed", "Cancelled"];

export const priorityLabels: Record<TaskPriority, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
};

export const obstacleLabels: Record<ObstacleCategory, string> = {
  access: "Нет доступа",
  materials: "Материалы",
  equipment: "Техника",
  other: "Другое",
};

export const decisionLabels: Record<ReportDecision, string> = {
  pending: "Ожидает",
  accepted: "Принят",
  returned: "Возвращён",
  cancelled: "Отменён вместе с заданием",
};

export function isFinal(status: TaskStatus) {
  return finalStatuses.includes(status);
}

export function isOverdue(task: { status: TaskStatus; planned_end: string }, now = Date.now()) {
  return executionStatuses.includes(task.status) && new Date(task.planned_end).getTime() < now;
}

export function taskCode(number: number) {
  return `MB-${number}`;
}
