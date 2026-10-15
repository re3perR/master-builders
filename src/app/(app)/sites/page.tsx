import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { requireViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Объекты" };

export default async function SitesPage() {
  await requireViewer(["dispatcher", "manager"]);
  return <PageHeader title="Объекты" />;
}
