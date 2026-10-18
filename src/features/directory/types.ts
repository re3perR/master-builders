import type { ObstacleCategory, Site, TaskPriority, TaskStatus } from "@/lib/database.types";
import type { CrewSummary, SiteSummary } from "./db-types";

export type SiteFilters = {
  query: string;
  archived: boolean;
};

export type SiteList = {
  sites: SiteSummary[];
  archivedCount: number;
};

export type TaskItem = {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  planned_start: string;
  planned_end: string;
  overdue: boolean;
  obstacle: ObstacleCategory | null;
  site_name: string | null;
  crew_name: string | null;
};

export type TaskGroups = {
  active: TaskItem[];
  activeTotal: number;
  closed: TaskItem[];
  closedTotal: number;
};

export type SiteCard = {
  site: Site;
  tasks: TaskGroups;
};

export type CrewList = {
  crews: CrewSummary[];
};

export type CrewCard = {
  crew: {
    id: string;
    name: string;
    foreman_id: string;
    archived_at: string | null;
    updated_at: string;
  };
  foremanName: string | null;
  members: { id: string; name: string }[];
  tasks: TaskGroups;
};

export const memberLimit = 30;

export const limits = {
  siteName: { min: 2, max: 160 },
  address: { min: 5, max: 300 },
  accessNote: { max: 2000 },
  contact: { max: 200 },
  crewName: { min: 2, max: 120 },
  memberName: { max: 120 },
};
