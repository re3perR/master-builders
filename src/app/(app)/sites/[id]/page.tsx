import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SiteView } from "@/features/directory/components/site-view";
import { getSiteCard } from "@/features/directory/queries";
import { requireViewer } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

const loadSite = cache(getSiteCard);

export async function generateMetadata({ params }: PageProps<"/sites/[id]">): Promise<Metadata> {
  const { id } = await params;
  const result = await loadSite(id);
  return { title: result.ok ? result.data.site.name : "Объект" };
}

export default async function SitePage({ params }: PageProps<"/sites/[id]">) {
  const [{ id }, viewer] = await Promise.all([params, requireViewer()]);
  const result = await loadSite(id);
  if (!result.ok) {
    if (result.error.kind === "not_found") notFound();
    throw new Error(result.error.message);
  }

  return <SiteView initial={snapshot(result.data)} role={viewer.profile.role} />;
}
