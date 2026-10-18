import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, describe, it } from "node:test";
import type { Client } from "pg";
import { connect, errorCode, key, seedId, sites, users } from "./helpers";

const company = seedId("company");
const division = seedId("division:north");
const foremanId = randomUUID();
const crewId = randomUUID();

let admin: Client;
let nextNumber: number;
const usedKeys: string[] = [];

async function session(role: "authenticated" | "service_role") {
  const db = await connect();
  await db.query("begin");
  await db.query(`set local role ${role}`);
  if (role === "authenticated") {
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: users.dispatcherNorth, role: "authenticated" }),
    ]);
  }
  const { rows } = await db.query<{ pid: number }>("select pg_backend_pid() as pid");
  return { db, pid: rows[0].pid };
}

async function waitForLock(pid: number) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await admin.query("select wait_event_type from pg_stat_activity where pid = $1", [pid]);
    if (rows[0]?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Сеанс ${pid} так и не встал в ожидание блокировки`);
}

function createTask(db: Client) {
  const clientKey = key();
  usedKeys.push(clientKey);
  return db
    .query<{ result: { result: string } }>(
      `select public.create_task(
         p_title => 'Демонтаж временного ограждения',
         p_description => 'Разобрать временное ограждение и вывезти секции на склад.',
         p_site_id => $1,
         p_crew_id => $2,
         p_priority => 'normal',
         p_planned_start => '2031-08-01T06:00:00Z',
         p_planned_end => '2031-08-01T10:00:00Z',
         p_client_key => $3
       ) as result`,
      [sites.park, crewId, clientKey],
    )
    .then(({ rows }) => rows[0].result);
}

function archiveCrew(db: Client) {
  return db
    .query<{ result: { changed: boolean } }>("select public.archive_crew($1) as result", [crewId])
    .then(({ rows }) => rows[0].result);
}

async function close(...sessions: { db: Client }[]) {
  for (const { db } of sessions) {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  }
}

describe("архивирование бригады при параллельных запросах", () => {
  before(async () => {
    admin = await connect();
    const { rows } = await admin.query("select next_task_number from public.companies where id = $1", [company]);
    nextNumber = rows[0].next_task_number;
    await admin.query("insert into auth.users (id, email) values ($1, $2)", [foremanId, `${foremanId}@demo.local`]);
    await admin.query(
      "insert into public.profiles (id, company_id, division_id, role, full_name) values ($1, $2, $3, 'foreman', 'Олег Миронов')",
      [foremanId, company, division],
    );
    await admin.query(
      "insert into public.crews (id, company_id, division_id, name, foreman_id) values ($1, $2, $3, 'Бригада демонтажа №4', $4)",
      [crewId, company, division, foremanId],
    );
  });

  afterEach(async () => {
    await admin.query("delete from public.tasks where crew_id = $1", [crewId]);
    await admin.query("update public.crews set archived_at = null where id = $1", [crewId]);
    await admin.query("delete from app.idempotency_keys where client_key = any($1::uuid[])", [usedKeys]);
    await admin.query("update public.companies set next_task_number = $2 where id = $1", [company, nextNumber]);
  });

  after(async () => {
    await admin.query("delete from public.crews where id = $1", [crewId]);
    await admin.query("delete from auth.users where id = $1", [foremanId]);
    await admin.end();
  });

  it("задание не назначается бригаде, которую в этот момент архивируют", async () => {
    const archiving = await session("service_role");
    const creating = await session("authenticated");
    try {
      assert.equal((await archiveCrew(archiving.db)).changed, true);
      const attempt = createTask(creating.db).then(
        () => null,
        (error: unknown) => error,
      );
      await waitForLock(creating.pid);
      await archiving.db.query("commit");
      const error = await attempt;
      assert.ok(error instanceof Error, "задание назначено архивной бригаде");
      assert.equal(errorCode(error), "MB422");
      assert.equal((error as Error).message, "archived_reference");
    } finally {
      await close(archiving, creating);
    }
    const { rows } = await admin.query("select count(*)::int as count from public.tasks where crew_id = $1", [crewId]);
    assert.equal(rows[0].count, 0);
  });

  it("архивирование ждёт создания задания и видит его как активное", async () => {
    const creating = await session("authenticated");
    const archiving = await session("service_role");
    try {
      assert.equal((await createTask(creating.db)).result, "ok");
      const attempt = archiveCrew(archiving.db).then(
        () => null,
        (error: unknown) => error,
      );
      await waitForLock(archiving.pid);
      await creating.db.query("commit");
      const error = await attempt;
      assert.ok(error instanceof Error, "бригада с активным заданием ушла в архив");
      assert.equal(errorCode(error), "MB423");
      assert.equal((error as Error).message, "active_tasks");
    } finally {
      await close(creating, archiving);
    }
    const { rows } = await admin.query("select archived_at from public.crews where id = $1", [crewId]);
    assert.equal(rows[0].archived_at, null);
  });
});
