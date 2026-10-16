import "server-only";
import type { ReportDecision } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { photoLinkSeconds } from "./limits";

type Client = Awaited<ReturnType<typeof createClient>>;

export type ReportPhoto = {
  id: string;
  url: string | null;
  width: number | null;
  height: number | null;
};

export type ReportVersion = {
  id: string;
  version: number;
  comment: string;
  submitted_at: string;
  submitted_by_name: string | null;
  decision: ReportDecision;
  decided_at: string | null;
  decided_by_name: string | null;
  decision_note: string | null;
  photos: ReportPhoto[];
};

export type StagedPhoto = {
  id: string;
  url: string;
  size: number;
};

async function signLinks(supabase: Client, paths: string[]) {
  const links = new Map<string, string>();
  if (!paths.length) return links;
  const { data } = await supabase.storage.from("task-photos").createSignedUrls(paths, photoLinkSeconds);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) links.set(item.path, item.signedUrl);
  }
  return links;
}

export async function getReportVersions(taskId: string): Promise<ReportVersion[]> {
  const supabase = await createClient();
  const [reports, uploads] = await Promise.all([
    supabase
      .from("task_reports")
      .select("id, version, comment, submitted_at, submitted_by, decision, decided_at, decided_by, decision_note")
      .eq("task_id", taskId)
      .order("version", { ascending: false }),
    supabase
      .from("uploads")
      .select("id, report_id, storage_path, width, height, position")
      .eq("task_id", taskId)
      .not("report_id", "is", null)
      .order("position", { ascending: true }),
  ]);
  if (reports.error) throw reports.error;
  if (uploads.error) throw uploads.error;
  if (!reports.data.length) return [];

  const people = [
    ...new Set(
      reports.data.flatMap((report) =>
        report.decided_by ? [report.submitted_by, report.decided_by] : [report.submitted_by],
      ),
    ),
  ];
  const [profiles, links] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", people),
    signLinks(
      supabase,
      uploads.data.map((upload) => upload.storage_path),
    ),
  ]);
  const nameOf = (id: string | null) => profiles.data?.find((person) => person.id === id)?.full_name ?? null;

  return reports.data.map((report) => ({
    id: report.id,
    version: report.version,
    comment: report.comment,
    submitted_at: report.submitted_at,
    submitted_by_name: nameOf(report.submitted_by),
    decision: report.decision,
    decided_at: report.decided_at,
    decided_by_name: nameOf(report.decided_by),
    decision_note: report.decision_note,
    photos: uploads.data
      .filter((upload) => upload.report_id === report.id)
      .map((upload) => ({
        id: upload.id,
        url: links.get(upload.storage_path) ?? null,
        width: upload.width,
        height: upload.height,
      })),
  }));
}

export async function getReportPhotoLinks(taskId: string, reportId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("uploads")
    .select("id, storage_path")
    .eq("task_id", taskId)
    .eq("report_id", reportId);
  if (error) throw error;
  const links = await signLinks(
    supabase,
    data.map((upload) => upload.storage_path),
  );
  return Object.fromEntries(data.map((upload) => [upload.id, links.get(upload.storage_path) ?? null]));
}

export async function getReportDraft(taskId: string, userId: string) {
  const supabase = await createClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [staged, latest] = await Promise.all([
    supabase
      .from("uploads")
      .select("id, storage_path, size_bytes")
      .eq("task_id", taskId)
      .eq("uploaded_by", userId)
      .is("report_id", null)
      .gte("created_at", since)
      .order("created_at", { ascending: true }),
    supabase
      .from("task_reports")
      .select("version")
      .eq("task_id", taskId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (staged.error) throw staged.error;
  if (latest.error) throw latest.error;

  const links = await signLinks(
    supabase,
    staged.data.map((upload) => upload.storage_path),
  );
  const photos: StagedPhoto[] = staged.data.flatMap((upload) => {
    const url = links.get(upload.storage_path);
    return url ? [{ id: upload.id, url, size: upload.size_bytes }] : [];
  });

  return { photos, nextVersion: (latest.data?.version ?? 0) + 1 };
}
