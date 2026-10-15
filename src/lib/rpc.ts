import "server-only";
import type { Database } from "@/lib/database.types";
import { toAppError, type AppError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

type Functions = Database["public"]["Functions"];

type RawRpc = (
  name: string,
  args: unknown,
) => PromiseLike<{ data: unknown; error: { code?: string; message?: string; details?: string | null } | null }>;

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: AppError };

export async function callRpc<Name extends keyof Functions & string>(
  name: Name,
  args: Functions[Name]["Args"],
): Promise<ActionResult<Functions[Name]["Returns"]>> {
  try {
    const supabase = await createClient();
    const rpc = supabase.rpc.bind(supabase) as unknown as RawRpc;
    const { data, error } = await rpc(name, args);
    if (error) return { ok: false, error: toAppError(error) };
    return { ok: true, data: data as Functions[Name]["Returns"] };
  } catch {
    return { ok: false, error: toAppError(null) };
  }
}
