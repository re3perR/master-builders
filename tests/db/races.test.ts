import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, describe, it } from "node:test";
import type { Client } from "pg";
import { connect, crews, errorCode, key, seedId, sites, users } from "./helpers";

type Created = { result: string; task_id: string; number: number; overlaps?: unknown[] };

const company = seedId("company");

let admin: Client;
let nextNumber: number;
const usedKeys: string[] = [];

function freshKey() {
  const value = key();
  usedKeys.push(value);
  return value;
}

async function session(userId: string) {
  const db = await connect();
  await db.query("begin");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
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

function createTask(db: Client, siteId: string, clientKey: string) {
  return db
    .query<{ result: Created }>(
      `select public.create_task(
         p_title => 'Монтаж стоек ограждения',
         p_description => 'Смонтировать стойки ограждения по периметру площадки.',
         p_site_id => $1,
         p_crew_id => $2,
         p_priority => 'normal',
         p_planned_start => '2031-07-01T06:00:00Z',
         p_planned_end => '2031-07-01T10:00:00Z',
         p_client_key => $3
       ) as result`,
      [siteId, crews.petrov, clientKey],
    )
    .then(({ rows }) => rows[0].result);
}

function archiveSite(db: Client, siteId: string) {
  return db
    .query<{ result: { changed: boolean } }>("select public.archive_site($1, $2) as result", [siteId, freshKey()])
    .then(({ rows }) => rows[0].result);
}

async function addSite() {
  const id = randomUUID();
  await admin.query(
    `insert into public.sites (id, company_id, division_id, name, address, created_by)
     select $1, p.company_id, p.division_id, 'Склад «Запад», ангар 4', 'г. Тверь, Западный проезд, д. 9', p.id
     from public.profiles p where p.id = $2`,
    [id, users.dispatcherNorth],
  );
  return id;
}

async function close(...sessions: { db: Client }[]) {
  for (const { db } of sessions) {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  }
}

describe("параллельные запросы", () => {
  before(async () => {
    admin = await connect();
    const { rows } = await admin.query("select next_task_number from public.companies where id = $1", [company]);
    nextNumber = rows[0].next_task_number;
  });

  afterEach(async () => {
    await admin.query(
      "delete from public.tasks where title = 'Монтаж стоек ограждения' and planned_start = '2031-07-01T06:00:00Z'",
    );
    await admin.query("delete from public.sites where name = 'Склад «Запад», ангар 4'");
    await admin.query("delete from app.idempotency_keys where client_key = any($1::uuid[])", [usedKeys]);
    await admin.query("update public.companies set next_task_number = $2 where id = $1", [company, nextNumber]);
  });

  after(() => admin.end());

  it("задание не создаётся на объекте, который в этот момент архивируют", async () => {
    const siteId = await addSite();
    const archiving = await session(users.dispatcherNorth);
    const creating = await session(users.dispatcherNorth);
    try {
      assert.equal((await archiveSite(archiving.db, siteId)).changed, true);
      const attempt = createTask(creating.db, siteId, freshKey()).then(
        () => null,
        (error: unknown) => error,
      );
      await waitForLock(creating.pid);
      await archiving.db.query("commit");
      const error = await attempt;
      assert.ok(error instanceof Error, "задание создано на архивном объекте");
      assert.equal(errorCode(error), "MB422");
      assert.equal((error as Error).message, "archived_reference");
    } finally {
      await close(archiving, creating);
    }
    const { rows } = await admin.query("select count(*)::int as count from public.tasks where site_id = $1", [siteId]);
    assert.equal(rows[0].count, 0);
  });

  it("архивирование ждёт создания задания и видит его как активное", async () => {
    const siteId = await addSite();
    const creating = await session(users.dispatcherNorth);
    const archiving = await session(users.dispatcherNorth);
    try {
      assert.equal((await createTask(creating.db, siteId, freshKey())).result, "ok");
      const attempt = archiveSite(archiving.db, siteId).then(
        () => null,
        (error: unknown) => error,
      );
      await waitForLock(archiving.pid);
      await creating.db.query("commit");
      const error = await attempt;
      assert.ok(error instanceof Error, "объект с активным заданием ушёл в архив");
      assert.equal(errorCode(error), "MB423");
      assert.equal((error as Error).message, "active_tasks");
    } finally {
      await close(creating, archiving);
    }
    const { rows } = await admin.query("select archived_at from public.sites where id = $1", [siteId]);
    assert.equal(rows[0].archived_at, null);
  });

  it("повтор создания с тем же ключом, пока первый запрос не завершён, возвращает то же задание", async () => {
    const clientKey = freshKey();
    const first = await session(users.dispatcherNorth);
    const second = await session(users.dispatcherNorth);
    try {
      const created = await createTask(first.db, sites.park, clientKey);
      assert.equal(created.result, "ok");
      const repeat = createTask(second.db, sites.park, clientKey);
      await waitForLock(second.pid);
      await first.db.query("commit");
      assert.deepEqual(await repeat, created);
      await second.db.query("commit");
    } finally {
      await close(first, second);
    }
    const { rows } = await admin.query(
      "select count(*)::int as count from public.tasks where title = 'Монтаж стоек ограждения' and site_id = $1",
      [sites.park],
    );
    assert.equal(rows[0].count, 1);
  });
});
