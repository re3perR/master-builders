import { createHash, randomUUID } from "node:crypto";
import { Client, type PoolClient } from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/master_builders_test";

export function seedId(key: string) {
  const hex = createHash("md5").update(`master-builders:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const users = {
  dispatcherNorth: seedId("user:dispatcher.north"),
  managerNorth: seedId("user:manager.north"),
  petrov: seedId("user:foreman.petrov"),
  lebedev: seedId("user:foreman.lebedev"),
  dispatcherSouth: seedId("user:dispatcher.south"),
  managerSouth: seedId("user:manager.south"),
  gusev: seedId("user:foreman.gusev"),
};

export const crews = {
  petrov: seedId("crew:petrov"),
  lebedev: seedId("crew:lebedev"),
  gusev: seedId("crew:gusev"),
};

export const sites = {
  park: seedId("site:park"),
  warehouse: seedId("site:warehouse"),
  school: seedId("site:school"),
  office: seedId("site:office"),
  cafe: seedId("site:cafe"),
};

export const task = (number: number) => seedId(`task:${number}`);

export type Db = Client | PoolClient;

export async function connect() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

export async function inRollback<T>(fn: (db: Client) => Promise<T>) {
  const db = await connect();
  try {
    await db.query("begin");
    return await fn(db);
  } finally {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  }
}

export async function as<T>(db: Db, userId: string | null, fn: () => Promise<T>) {
  await db.query("savepoint as_user");
  try {
    if (userId) {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
    } else {
      await db.query("set local role anon");
      await db.query("select set_config('request.jwt.claims', '', true)");
    }
    const result = await fn();
    await db.query("reset role");
    await db.query("release savepoint as_user");
    return result;
  } catch (error) {
    await db.query("rollback to savepoint as_user");
    await db.query("reset role");
    throw error;
  }
}

export async function rpc<T = Record<string, unknown>>(
  db: Db,
  userId: string | null,
  name: string,
  args: Record<string, unknown>,
) {
  const keys = Object.keys(args);
  const params = keys.map((key, index) => `${key} => $${index + 1}`).join(", ");
  return as(db, userId, async () => {
    const { rows } = await db.query(
      `select public.${name}(${params}) as result`,
      keys.map((key) => args[key]),
    );
    return rows[0].result as T;
  });
}

export async function select<T = Record<string, unknown>>(
  db: Db,
  userId: string | null,
  sql: string,
  values: unknown[] = [],
) {
  return as(db, userId, async () => {
    const { rows } = await db.query(sql, values);
    return rows as T[];
  });
}

export async function version(db: Db, taskId: string) {
  const { rows } = await db.query("select version from public.tasks where id = $1", [taskId]);
  return rows[0].version as number;
}

export async function stagePhoto(db: Db, userId: string, taskId: string) {
  const staged = await rpc<{ upload_id: string; storage_path: string }>(db, userId, "register_upload", {
    p_task_id: taskId,
    p_mime_type: "image/jpeg",
    p_size_bytes: 120000,
    p_width: 1600,
    p_height: 1200,
  });
  await db.query("insert into storage.objects (bucket_id, name, metadata) values ('task-photos', $1, $2)", [
    staged.storage_path,
    { size: 120000, mimetype: "image/jpeg" },
  ]);
  return staged.upload_id;
}

export const key = () => randomUUID();

export function errorCode(error: unknown) {
  return (error as { code?: string }).code;
}
