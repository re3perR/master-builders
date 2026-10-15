export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = "dispatcher" | "foreman" | "manager";
export type TaskStatus = "Assigned" | "Accepted" | "InProgress" | "InReview" | "Completed" | "Cancelled";
export type TaskPriority = "low" | "normal" | "high";
export type ObstacleCategory = "access" | "materials" | "equipment" | "other";
export type ReportDecision = "pending" | "accepted" | "returned" | "cancelled";

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Company = {
  id: string;
  name: string;
  timezone: string;
  next_task_number: number;
  created_at: string;
};

export type Division = {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
};

export type Profile = {
  id: string;
  company_id: string;
  division_id: string;
  role: UserRole;
  full_name: string;
  created_at: string;
};

export type Crew = {
  id: string;
  company_id: string;
  division_id: string;
  name: string;
  foreman_id: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CrewMember = {
  id: string;
  crew_id: string;
  name: string;
  position: number;
  created_at: string;
};

export type Site = {
  id: string;
  company_id: string;
  division_id: string;
  name: string;
  address: string;
  access_note: string | null;
  contact: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  company_id: string;
  division_id: string;
  number: number;
  title: string;
  description: string;
  site_id: string;
  crew_id: string;
  priority: TaskPriority;
  status: TaskStatus;
  address_snapshot: string;
  access_note_snapshot: string | null;
  planned_start_original: string;
  planned_end_original: string;
  planned_start: string;
  planned_end: string;
  accepted_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  source_task_id: string | null;
  terms_changed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  version: number;
};

export type TaskObstacle = {
  id: string;
  task_id: string;
  category: ObstacleCategory;
  reason: string;
  opened_by: string;
  opened_at: string;
  closed_by: string | null;
  closed_at: string | null;
  close_comment: string | null;
  closed_by_system: boolean;
};

export type TaskMessage = {
  id: string;
  task_id: string;
  author_id: string;
  author_role: UserRole;
  body: string;
  client_key: string;
  created_at: string;
};

export type TaskReport = {
  id: string;
  task_id: string;
  version: number;
  comment: string;
  submitted_by: string;
  submitted_at: string;
  decision: ReportDecision;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  client_key: string;
};

export type Upload = {
  id: string;
  task_id: string;
  uploaded_by: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  report_id: string | null;
  position: number | null;
  created_at: string;
};

export type TaskEvent = {
  id: number;
  task_id: string;
  actor_id: string | null;
  actor_role: UserRole | null;
  kind: string;
  data: Json;
  created_at: string;
};

export type OverlapItem = {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  planned_start: string;
  planned_end: string;
};

export type TaskMutationResult =
  | {
      result: "ok";
      task_id: string;
      number: number;
      status: TaskStatus;
      version: number;
      changed?: boolean;
      obstacle_id?: string;
      report_id?: string;
      report_version?: number;
    }
  | { result: "overlaps"; overlaps: OverlapItem[] };

type Fn<Args, Returns> = { Args: Args; Returns: Returns };

export type Database = {
  public: {
    Tables: {
      companies: Table<Company>;
      divisions: Table<Division>;
      profiles: Table<Profile>;
      crews: Table<Crew>;
      crew_members: Table<CrewMember>;
      sites: Table<Site>;
      tasks: Table<Task>;
      task_obstacles: Table<TaskObstacle>;
      task_messages: Table<TaskMessage>;
      task_reports: Table<TaskReport>;
      uploads: Table<Upload>;
      task_events: Table<TaskEvent>;
    };
    Views: Record<string, never>;
    Functions: {
      create_task: Fn<
        {
          p_title: string;
          p_description: string;
          p_site_id: string;
          p_crew_id: string;
          p_priority: TaskPriority;
          p_planned_start: string;
          p_planned_end: string;
          p_client_key: string;
          p_acknowledged_overlaps?: string[];
          p_source_task_id?: string | null;
        },
        TaskMutationResult
      >;
      update_task_details: Fn<
        {
          p_task_id: string;
          p_expected_version: number;
          p_title: string;
          p_description: string;
          p_priority: TaskPriority;
          p_address_snapshot: string;
          p_access_note_snapshot: string | null;
          p_client_key: string;
        },
        TaskMutationResult
      >;
      reschedule_task: Fn<
        {
          p_task_id: string;
          p_expected_version: number;
          p_planned_start: string;
          p_planned_end: string;
          p_reason: string;
          p_client_key: string;
          p_acknowledged_overlaps?: string[];
        },
        TaskMutationResult
      >;
      reassign_task: Fn<
        {
          p_task_id: string;
          p_expected_version: number;
          p_crew_id: string;
          p_reason: string;
          p_client_key: string;
          p_acknowledged_overlaps?: string[];
        },
        TaskMutationResult
      >;
      cancel_task: Fn<
        { p_task_id: string; p_expected_version: number; p_reason: string; p_client_key: string },
        TaskMutationResult
      >;
      accept_task: Fn<{ p_task_id: string; p_expected_version: number; p_client_key: string }, TaskMutationResult>;
      start_task: Fn<{ p_task_id: string; p_expected_version: number; p_client_key: string }, TaskMutationResult>;
      open_obstacle: Fn<
        {
          p_task_id: string;
          p_expected_version: number;
          p_category: ObstacleCategory;
          p_reason: string;
          p_client_key: string;
        },
        TaskMutationResult
      >;
      close_obstacle: Fn<
        { p_task_id: string; p_expected_version: number; p_comment: string; p_client_key: string },
        TaskMutationResult
      >;
      post_message: Fn<
        { p_task_id: string; p_body: string; p_client_key: string },
        { result: "ok"; message_id: string; created_at: string }
      >;
      register_upload: Fn<
        { p_task_id: string; p_mime_type: string; p_size_bytes: number; p_width: number; p_height: number },
        { result: "ok"; upload_id: string; storage_path: string }
      >;
      discard_upload: Fn<{ p_upload_id: string }, { result: "ok"; storage_path: string | null }>;
      submit_report: Fn<
        {
          p_task_id: string;
          p_expected_version: number;
          p_comment: string;
          p_upload_ids: string[];
          p_client_key: string;
        },
        TaskMutationResult
      >;
      approve_report: Fn<
        { p_task_id: string; p_expected_version: number; p_report_id: string; p_client_key: string },
        TaskMutationResult
      >;
      return_report: Fn<
        { p_task_id: string; p_expected_version: number; p_report_id: string; p_note: string; p_client_key: string },
        TaskMutationResult
      >;
      stale_uploads: Fn<{ p_older_than?: string }, { upload_id: string | null; storage_path: string }[]>;
      forget_stale_upload: Fn<{ p_upload_id: string }, undefined>;
    };
    Enums: {
      user_role: UserRole;
      task_status: TaskStatus;
      task_priority: TaskPriority;
      obstacle_category: ObstacleCategory;
      report_decision: ReportDecision;
    };
    CompositeTypes: Record<string, never>;
  };
};
