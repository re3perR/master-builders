import type { Json, UserRole } from "@/lib/database.types";

export type HistoryEvent = {
  id: number;
  kind: string;
  data: Json;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: UserRole | null;
};
