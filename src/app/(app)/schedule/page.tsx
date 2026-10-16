import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ScheduleView } from "@/features/schedule/components/schedule-view";
import { loadSchedule } from "@/features/schedule/queries";
import { requireViewer } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";
import { dayKey, isDayKey, timeZoneLabel } from "@/lib/time";

export const metadata: Metadata = { title: "Расписание" };

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const viewer = await requireViewer();
  const { date: param } = await searchParams;
  const date = param === undefined ? dayKey() : typeof param === "string" && isDayKey(param) ? param : null;
  if (!date) redirect("/schedule");

  const result = await loadSchedule(date);
  if (!result.ok) {
    if (result.error.kind === "auth") redirect("/login?expired=1");
    throw new Error(result.error.message);
  }

  return (
    <ScheduleView key={date} initial={snapshot(result.data)} role={viewer.profile.role} timeZone={timeZoneLabel()} />
  );
}
