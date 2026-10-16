import type { TaskStatus, UserRole } from "@/lib/database.types";

export const messageLimit = 3000;

export type Message = {
  id: string;
  authorId: string;
  authorName: string | null;
  authorRole: UserRole;
  body: string;
  createdAt: string;
};

export type Discussion = {
  status: TaskStatus;
  messages: Message[];
};
