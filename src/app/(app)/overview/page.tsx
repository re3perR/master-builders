import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DispatcherOverview } from "@/features/overview/components/dispatcher-overview";
import { ManagerOverview } from "@/features/overview/components/manager-overview";
import { parsePeriod } from "@/features/overview/period";
import { loadDispatcherOverview, loadManagerOverview } from "@/features/overview/queries";
import { requireViewer } from "@/lib/auth";
import type { AppError } from "@/lib/errors";
import { snapshot } from "@/lib/snapshot";

export const metadata: Metadata = { title: "Обзор" };

function fail(error: AppError): never {
  if (error.kind === "auth") redirect("/login?expired=1");
  throw new Error(error.message);
}

export default async function OverviewPage({ searchParams }: PageProps<"/overview">) {
  const viewer = await requireViewer();
  if (viewer.profile.role === "foreman") redirect("/my");

  if (viewer.profile.role === "manager") {
    const days = parsePeriod((await searchParams).days);
    const result = await loadManagerOverview(days);
    if (!result.ok) fail(result.error);
    return <ManagerOverview key={days} divisionName={viewer.division.name} initial={snapshot(result.data)} />;
  }

  const result = await loadDispatcherOverview();
  if (!result.ok) fail(result.error);
  return <DispatcherOverview divisionName={viewer.division.name} initial={snapshot(result.data)} />;
}
