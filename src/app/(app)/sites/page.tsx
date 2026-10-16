import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { SiteFormDialog } from "@/features/directory/components/site-form-dialog";
import { SitesView } from "@/features/directory/components/sites-view";
import { parseSiteFilters } from "@/features/directory/filters";
import { listSites } from "@/features/directory/queries";
import { requireViewer } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

export const metadata: Metadata = { title: "Объекты" };

export default async function SitesPage({ searchParams }: PageProps<"/sites">) {
  const [viewer, params] = await Promise.all([requireViewer(["dispatcher", "manager"]), searchParams]);
  const filters = parseSiteFilters(params);
  const result = await listSites(filters);
  if (!result.ok) throw new Error(result.error.message);
  const canManage = viewer.profile.role === "dispatcher";

  return (
    <>
      <PageHeader title="Объекты" description={viewer.division.name} actions={canManage ? <SiteFormDialog /> : null} />
      <SitesView initial={snapshot(result.data)} filters={filters} canManage={canManage} />
    </>
  );
}
