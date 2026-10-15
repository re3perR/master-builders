import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { requireViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Бригады" };

export default async function CrewsPage() {
  await requireViewer();
  return <PageHeader title="Бригады" />;
}
