import type { PostgrestError } from "@supabase/supabase-js";
import { countLabel } from "../src/lib/plural";
import { isGuid } from "../src/lib/validation";
import { createAdminClient } from "./admin";

const args = process.argv.slice(2);
const restore = args.includes("--restore");
const ids = args.filter((arg) => arg !== "--restore");

if (ids.length !== 1 || !isGuid(ids[0])) {
  console.error("Использование: npm run crew:archive -- <id бригады> [--restore]");
  process.exit(1);
}

const crewId = ids[0];
const admin = createAdminClient();

function activeTasks(details: string) {
  try {
    return Number(JSON.parse(details).active_tasks) || 0;
  } catch {
    return 0;
  }
}

function explain(error: PostgrestError) {
  if (error.code === "MB404") return `Бригада ${crewId} не найдена.`;
  if (error.code === "MB423") {
    const active = countLabel(activeTasks(error.details), ["активное задание", "активных задания", "активных заданий"]);
    return `Архивировать нельзя: у бригады ${active}, включая ожидающие проверки. Завершите, отмените или передайте их другой бригаде.`;
  }
  return error.message;
}

async function main() {
  const { data, error } = restore
    ? await admin.rpc("restore_crew", { p_crew_id: crewId })
    : await admin.rpc("archive_crew", { p_crew_id: crewId });

  if (error) {
    console.error(explain(error));
    process.exit(1);
  }

  if (restore) {
    console.log(
      data.changed ? `Бригада ${crewId} возвращена из архива.` : `Бригада ${crewId} не в архиве, ничего не изменилось.`,
    );
  } else {
    console.log(
      data.changed ? `Бригада ${crewId} перенесена в архив.` : `Бригада ${crewId} уже в архиве, ничего не изменилось.`,
    );
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
