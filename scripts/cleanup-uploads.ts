import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env.local.");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const hoursArg = args.find((arg) => arg.startsWith("--hours="))?.slice("--hours=".length);
const hours = hoursArg === undefined ? 24 : Number(hoursArg);

if (!Number.isInteger(hours) || hours < 1) {
  console.error("Параметр --hours задаёт возраст загрузок в целых часах, не меньше 1. Например: --hours=48.");
  process.exit(1);
}

const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = admin.storage.from("task-photos");

function chunks<T>(items: T[], size = 100) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function main() {
  const { data, error } = await admin.rpc("stale_uploads", { p_older_than: `${hours} hours` });
  if (error) throw error;

  const staged = data.filter((row): row is { upload_id: string; storage_path: string } => row.upload_id !== null);
  const orphans = data.filter((row) => row.upload_id === null).map((row) => row.storage_path);

  console.log(`Временных загрузок старше ${hours} ч: ${staged.length}. Файлов без записи в базе: ${orphans.length}.`);

  if (dryRun) {
    for (const row of data) console.log(`  ${row.upload_id ? "временная" : "без записи"}  ${row.storage_path}`);
    console.log("Пробный запуск, ничего не удалено.");
    return;
  }

  for (const row of staged) {
    const { error: forgetError } = await admin.rpc("forget_stale_upload", { p_upload_id: row.upload_id });
    if (forgetError) throw forgetError;
  }

  const kept = new Set<string>();
  for (const part of chunks(staged.map((row) => row.upload_id))) {
    const { data: left, error: leftError } = await admin.from("uploads").select("id").in("id", part);
    if (leftError) throw leftError;
    for (const row of left) kept.add(row.id);
  }

  const removable = [...orphans, ...staged.filter((row) => !kept.has(row.upload_id)).map((row) => row.storage_path)];
  let removed = 0;
  for (const part of chunks(removable)) {
    const { data: deleted, error: removeError } = await bucket.remove(part);
    if (removeError) throw removeError;
    removed += deleted.length;
  }

  console.log(
    `Удалено записей: ${staged.length - kept.size}, файлов из хранилища: ${removed}. Оставлено, потому что фото уже в отчёте: ${kept.size}.`,
  );
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
