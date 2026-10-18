import type { Fn } from "@/lib/database.types";

type SiteMutationResult = {
  result: "ok";
  site_id: string;
  changed: boolean;
  updated_at?: string;
  archived_at?: string | null;
};

type CrewMutationResult = {
  result: "ok";
  crew_id: string;
  changed: boolean;
  updated_at: string;
  archived_at?: string | null;
};

export type SiteSummary = {
  id: string;
  name: string;
  address: string;
  contact: string | null;
  archived_at: string | null;
  active_tasks: number;
  total_tasks: number;
};

export type CrewSummary = {
  id: string;
  name: string;
  foreman_id: string;
  foreman_name: string | null;
  archived_at: string | null;
  members: number;
  assigned: number;
  accepted: number;
  in_progress: number;
  in_review: number;
  overdue: number;
  open_obstacles: number;
};

type SiteFields = {
  p_name: string;
  p_address: string;
  p_access_note: string | null;
  p_contact: string | null;
  p_client_key: string;
};

type SiteReference = { p_site_id: string; p_client_key: string };

export type FeatureFunctions = {
  create_site: Fn<SiteFields, SiteMutationResult>;
  update_site: Fn<SiteFields & { p_site_id: string; p_expected_updated_at?: string | null }, SiteMutationResult>;
  archive_site: Fn<SiteReference, SiteMutationResult>;
  restore_site: Fn<SiteReference, SiteMutationResult>;
  delete_site: Fn<SiteReference, SiteMutationResult>;
  update_crew: Fn<
    {
      p_crew_id: string;
      p_name: string;
      p_members: string[];
      p_client_key: string;
      p_expected_updated_at?: string | null;
    },
    CrewMutationResult
  >;
  archive_crew: Fn<{ p_crew_id: string }, CrewMutationResult>;
  restore_crew: Fn<{ p_crew_id: string }, CrewMutationResult>;
  site_summaries: Fn<{ p_query?: string | null; p_include_archived?: boolean }, SiteSummary[]>;
  crew_summaries: Fn<Record<string, never>, CrewSummary[]>;
};
