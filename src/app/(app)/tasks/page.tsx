import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { requireViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Задания" };

export default async function TasksPage() {
  await requireViewer(["dispatcher", "manager"]);
  return <PageHeader title="Задания" />;
}
