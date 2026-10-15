import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { requireViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Обзор" };

export default async function OverviewPage() {
  const viewer = await requireViewer();
  if (viewer.profile.role === "foreman") redirect("/my");

  return <PageHeader title="Обзор" description={viewer.division.name} />;
}
