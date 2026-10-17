import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseUrl } from "@/lib/env";

function serviceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Не задана переменная окружения SUPABASE_SERVICE_ROLE_KEY. Скопируйте .env.example в .env.local и заполните значения.",
    );
  }
  return key;
}

export async function storeTaskPhoto(path: string, data: Buffer, contentType: string) {
  const admin = createClient<Database>(supabaseUrl(), serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin.storage.from("task-photos").upload(path, data, { contentType, upsert: false, cacheControl: "300" });
}
