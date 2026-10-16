import type { Viewer } from "@/lib/auth";
import { getCrewChoices } from "../queries";
import type { TaskCard } from "../types";
import { DispatcherPanel } from "./dispatcher-panel";

export async function DispatcherActions({ card, viewer }: { card: TaskCard; viewer: Viewer }) {
  if (viewer.profile.role !== "dispatcher") return null;
  const crews = card.status === "Assigned" || card.status === "Accepted" ? await getCrewChoices() : [];
  return <DispatcherPanel card={card} crews={crews} />;
}
