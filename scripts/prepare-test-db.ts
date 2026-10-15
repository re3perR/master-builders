import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const adminUrl = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const dbName = process.env.TEST_DATABASE_NAME ?? "master_builders_test";

async function main() {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force)`);
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  const db = new Client({ connectionString: url.toString() });
  await db.connect();

  const root = process.cwd();
  const files = [
    join(root, "tests/db/supabase-shim.sql"),
    ...readdirSync(join(root, "supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => join(root, "supabase/migrations", name)),
    join(root, "supabase/seed.sql"),
  ];

  for (const file of files) {
    await db.query(readFileSync(file, "utf8"));
  }
  await db.end();
  console.log(`Тестовая база ${dbName} готова: ${url.toString().replace(/:[^:@/]+@/, ":***@")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
