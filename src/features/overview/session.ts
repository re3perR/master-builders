import "server-only";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/database.types";
import { toAppError, type AppError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function sessionRole(
  allowed: UserRole[],
): Promise<{ ok: true; role: UserRole } | { ok: false; error: AppError }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error && isAuthRetryableFetchError(error)) return { ok: false, error: toAppError(null) };
    const userId = data?.claims?.sub;
    if (!userId) return { ok: false, error: toAppError({ code: "MB401" }) };

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) return { ok: false, error: toAppError(profileError) };
    if (!profile) return { ok: false, error: toAppError({ code: "MB401" }) };
    if (!allowed.includes(profile.role)) return { ok: false, error: toAppError({ code: "MB403" }) };
    return { ok: true, role: profile.role };
  } catch {
    return { ok: false, error: toAppError(null) };
  }
}
