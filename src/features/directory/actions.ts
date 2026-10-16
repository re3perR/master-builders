"use server";

import { z } from "zod";
import type { AppError } from "@/lib/errors";
import { callRpc, type ActionResult } from "@/lib/rpc";
import { snapshot, type Snapshot } from "@/lib/snapshot";
import { getCrewCard, getSiteCard, listCrews, listSites } from "./queries";
import type { CrewCard, CrewList, SiteCard, SiteFilters, SiteList } from "./types";

const invalidInput: { ok: false; error: AppError } = {
  ok: false,
  error: { kind: "validation", message: "Проверьте введённые данные." },
};

const reference = z.guid();

const siteFields = z.object({
  name: z.string(),
  address: z.string(),
  accessNote: z.string(),
  contact: z.string(),
  clientKey: z.guid(),
});

const siteUpdate = siteFields.extend({
  siteId: reference,
  expectedUpdatedAt: z.string().nullable(),
});

const siteAction = z.object({ siteId: reference, clientKey: z.guid() });

const crewUpdate = z.object({
  crewId: reference,
  name: z.string(),
  members: z.array(z.string()).max(100),
  clientKey: z.guid(),
  expectedUpdatedAt: z.string().nullable(),
});

const siteFilters = z.object({ query: z.string().max(200), archived: z.boolean() });

function withSnapshot<T>(result: ActionResult<T>): ActionResult<Snapshot<T>> {
  return result.ok ? { ok: true, data: snapshot(result.data) } : result;
}

export async function createSite(input: z.infer<typeof siteFields>): Promise<ActionResult<{ siteId: string }>> {
  const parsed = siteFields.safeParse(input);
  if (!parsed.success) return invalidInput;
  const { name, address, accessNote, contact, clientKey } = parsed.data;
  const result = await callRpc("create_site", {
    p_name: name,
    p_address: address,
    p_access_note: accessNote || null,
    p_contact: contact || null,
    p_client_key: clientKey,
  });
  return result.ok ? { ok: true, data: { siteId: result.data.site_id } } : result;
}

export async function updateSite(input: z.infer<typeof siteUpdate>): Promise<ActionResult<{ changed: boolean }>> {
  const parsed = siteUpdate.safeParse(input);
  if (!parsed.success) return invalidInput;
  const { siteId, name, address, accessNote, contact, clientKey, expectedUpdatedAt } = parsed.data;
  const result = await callRpc("update_site", {
    p_site_id: siteId,
    p_name: name,
    p_address: address,
    p_access_note: accessNote || null,
    p_contact: contact || null,
    p_client_key: clientKey,
    p_expected_updated_at: expectedUpdatedAt,
  });
  return result.ok ? { ok: true, data: { changed: result.data.changed } } : result;
}

export async function archiveSite(input: z.infer<typeof siteAction>): Promise<ActionResult<{ changed: boolean }>> {
  const parsed = siteAction.safeParse(input);
  if (!parsed.success) return invalidInput;
  const result = await callRpc("archive_site", { p_site_id: parsed.data.siteId, p_client_key: parsed.data.clientKey });
  return result.ok ? { ok: true, data: { changed: result.data.changed } } : result;
}

export async function restoreSite(input: z.infer<typeof siteAction>): Promise<ActionResult<{ changed: boolean }>> {
  const parsed = siteAction.safeParse(input);
  if (!parsed.success) return invalidInput;
  const result = await callRpc("restore_site", { p_site_id: parsed.data.siteId, p_client_key: parsed.data.clientKey });
  return result.ok ? { ok: true, data: { changed: result.data.changed } } : result;
}

export async function deleteSite(input: z.infer<typeof siteAction>): Promise<ActionResult<{ changed: boolean }>> {
  const parsed = siteAction.safeParse(input);
  if (!parsed.success) return invalidInput;
  const result = await callRpc("delete_site", { p_site_id: parsed.data.siteId, p_client_key: parsed.data.clientKey });
  return result.ok ? { ok: true, data: { changed: result.data.changed } } : result;
}

export async function updateCrew(input: z.infer<typeof crewUpdate>): Promise<ActionResult<{ changed: boolean }>> {
  const parsed = crewUpdate.safeParse(input);
  if (!parsed.success) return invalidInput;
  const { crewId, name, members, clientKey, expectedUpdatedAt } = parsed.data;
  const result = await callRpc("update_crew", {
    p_crew_id: crewId,
    p_name: name,
    p_members: members,
    p_client_key: clientKey,
    p_expected_updated_at: expectedUpdatedAt,
  });
  return result.ok ? { ok: true, data: { changed: result.data.changed } } : result;
}

export async function loadSites(filters: SiteFilters): Promise<ActionResult<Snapshot<SiteList>>> {
  const parsed = siteFilters.safeParse(filters);
  if (!parsed.success) return invalidInput;
  return withSnapshot(await listSites(parsed.data));
}

export async function loadSiteCard(siteId: string): Promise<ActionResult<Snapshot<SiteCard>>> {
  return withSnapshot(await getSiteCard(siteId));
}

export async function loadCrews(): Promise<ActionResult<Snapshot<CrewList>>> {
  return withSnapshot(await listCrews());
}

export async function loadCrewCard(crewId: string): Promise<ActionResult<Snapshot<CrewCard>>> {
  return withSnapshot(await getCrewCard(crewId));
}
