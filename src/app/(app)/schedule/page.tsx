import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { requireViewer } from "@/lib/auth";
import { timeZoneLabel } from "@/lib/time";

export const metadata: Metadata = { title: "Расписание" };

export default async function SchedulePage() {
  await requireViewer();
  return <PageHeader title="Расписание" description={`Время указано в поясе компании: ${timeZoneLabel()}`} />;
}
