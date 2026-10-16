import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CrewView } from "@/features/directory/components/crew-view";
import { getCrewCard } from "@/features/directory/queries";
import { requireViewer } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

const loadCrew = cache(getCrewCard);

export async function generateMetadata({ params }: PageProps<"/crews/[id]">): Promise<Metadata> {
  const { id } = await params;
  const result = await loadCrew(id);
  return { title: result.ok ? result.data.crew.name : "Бригада" };
}

export default async function CrewPage({ params }: PageProps<"/crews/[id]">) {
  const [{ id }, viewer] = await Promise.all([params, requireViewer()]);
  const result = await loadCrew(id);
  if (!result.ok) {
    if (result.error.kind === "not_found") notFound();
    throw new Error(result.error.message);
  }

  return <CrewView initial={snapshot(result.data)} role={viewer.profile.role} />;
}
