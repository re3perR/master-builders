import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AcceptedReportView } from "@/features/overview/components/accepted-report";
import { parsePeriod } from "@/features/overview/period";
import { loadAcceptedReport } from "@/features/overview/queries";
import { requireViewer } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

export const metadata: Metadata = { title: "Принятые задания" };

export default async function AcceptedTasksPage({ searchParams }: PageProps<"/overview/accepted">) {
  const viewer = await requireViewer(["dispatcher", "manager"]);
  const days = parsePeriod((await searchParams).days);
  const result = await loadAcceptedReport(days);
  if (!result.ok) {
    if (result.error.kind === "auth") redirect("/login?expired=1");
    throw new Error(result.error.message);
  }

  return <AcceptedReportView key={days} divisionName={viewer.division.name} initial={snapshot(result.data)} />;
}
