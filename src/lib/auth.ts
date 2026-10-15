import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Company, Crew, Division, Profile, UserRole } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  userId: string;
  email: string | null;
  profile: Profile;
  company: Company;
  division: Division;
  crew: Crew | null;
};

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile) return null;

  const [{ data: company }, { data: division }, { data: crew }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", profile.company_id).single(),
    supabase.from("divisions").select("*").eq("id", profile.division_id).single(),
    profile.role === "foreman"
      ? supabase.from("crews").select("*").eq("foreman_id", profile.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!company || !division) return null;

  return {
    userId,
    email: typeof claims.claims.email === "string" ? claims.claims.email : null,
    profile,
    company,
    division,
    crew: crew ?? null,
  };
});

export async function requireViewer(roles?: UserRole[]) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?expired=1");
  if (roles && !roles.includes(viewer.profile.role)) redirect("/overview");
  return viewer;
}
