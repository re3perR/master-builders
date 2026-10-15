import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { requireViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Мои задания" };

export default async function MyTasksPage() {
  const viewer = await requireViewer(["foreman"]);
  return <PageHeader title="Мои задания" description={viewer.crew?.name} />;
}
