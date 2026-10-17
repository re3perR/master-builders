import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { after, afterEach, before, describe, it } from "node:test";
import type { Client } from "pg";
import { as, connect, crews, errorCode, inRollback, key, rpc, sites, task, users, version, type Db } from "./helpers";

type Staged = { upload_id: string; storage_path: string };
type TaskResult = { task_id: string; version: number; status: string };

const photoSize = 120000;

function register(db: Db, taskId: string, mimeType = "image/jpeg") {
  return rpc<Staged>(db, users.lebedev, "register_upload", {
    p_task_id: taskId,
    p_mime_type: mimeType,
    p_size_bytes: photoSize,
    p_width: 1600,
    p_height: 1200,
  });
}

async function storeObject(
  db: Db,
  path: string,
  metadata: object | null = { size: photoSize, mimetype: "image/jpeg" },
) {
  await db.query("insert into storage.objects (bucket_id, name, metadata) values ('task-photos', $1, $2)", [
    path,
    metadata,
  ]);
}

async function submit(db: Db, taskId: string, ids: string[]) {
  return rpc<TaskResult>(db, users.lebedev, "submit_report", {
    p_task_id: taskId,
    p_expected_version: await version(db, taskId),
    p_comment: "Работы выполнены, фото приложены",
    p_upload_ids: ids,
    p_client_key: key(),
  });
}

function notReady(error: unknown) {
  assert.equal(errorCode(error), "MB422");
  assert.equal((error as Error).message, "uploads_not_ready");
  return true;
}

async function waitForLock(observer: Db, pid: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { rows } = await observer.query<{ waiting: boolean }>(
      "select cardinality(pg_blocking_pids($1)) > 0 as waiting",
      [pid],
    );
    if (rows[0].waiting) return true;
    await delay(20);
  }
  return false;
}

async function backendPid(db: Db) {
  const { rows } = await db.query<{ pid: number }>("select pg_backend_pid() as pid");
  return rows[0].pid;
}

const uploadIds = (photos: Staged[]) => photos.map((photo) => photo.upload_id);

function outcome<T>(pending: Promise<T>) {
  return pending.then(
    (value) => ({ value, error: null }),
    (error: unknown) => ({ value: null, error }),
  );
}

describe("запись фото в хранилище", () => {
  it("бригадир не может сам положить файл даже по выданному ему пути", () =>
    inRollback(async (db) => {
      const staged = await register(db, task(5));
      await assert.rejects(
        as(db, users.lebedev, () =>
          db.query("insert into storage.objects (bucket_id, name, metadata) values ('task-photos', $1, $2)", [
            staged.storage_path,
            { size: photoSize, mimetype: "image/jpeg" },
          ]),
        ),
        (error) => errorCode(error) === "42501",
      );
    }));

  it("отчёт не отправляется, если файл в хранилище не совпадает с записью", () =>
    inRollback(async (db) => {
      const id = task(5);
      const cases: [string, object | null][] = [
        ["image/jpeg", { size: 873, mimetype: "image/jpeg" }],
        ["image/jpeg", { size: photoSize, mimetype: "image/png" }],
        ["image/webp", { size: photoSize, mimetype: "image/jpeg" }],
        ["image/jpeg", null],
      ];
      for (const [mimeType, metadata] of cases) {
        const staged = await register(db, id, mimeType);
        await storeObject(db, staged.storage_path, metadata);
        await assert.rejects(submit(db, id, [staged.upload_id]), notReady, JSON.stringify(metadata));
      }

      const staged = await register(db, id, "image/webp");
      await storeObject(db, staged.storage_path, { size: photoSize, mimetype: "image/webp" });
      const result = await submit(db, id, [staged.upload_id]);
      assert.equal(result.status, "InReview");
    }));
});

describe("отправка отчёта при одновременном удалении фото", () => {
  let db: Client;
  let other: Client;
  let dbPid: number;
  let otherPid: number;
  let taskId: string;
  let companyId: string;
  let nextNumber: number;
  let startedAt: Date;

  async function stage(count: number) {
    await db.query("begin");
    const staged: Staged[] = [];
    for (let index = 0; index < count; index += 1) {
      const photo = await register(db, taskId);
      await storeObject(db, photo.storage_path);
      staged.push(photo);
    }
    await db.query("commit");
    return staged;
  }

  function removeObject(path: string) {
    return as(other, users.lebedev, () =>
      other.query("delete from storage.objects where bucket_id = 'task-photos' and name = $1", [path]),
    );
  }

  before(async () => {
    db = await connect();
    other = await connect();
    dbPid = await backendPid(db);
    otherPid = await backendPid(other);
    const { rows } = await db.query<{ id: string; next_task_number: number; now: Date }>(
      "select c.id, c.next_task_number, now() from public.companies c join public.tasks t on t.company_id = c.id where t.id = $1",
      [task(5)],
    );
    companyId = rows[0].id;
    nextNumber = rows[0].next_task_number;
    startedAt = rows[0].now;

    await db.query("begin");
    let state = await rpc<TaskResult>(db, users.dispatcherNorth, "create_task", {
      p_title: "Проверка одновременного удаления фото",
      p_description: "Задание для проверки отправки отчёта",
      p_site_id: sites.park,
      p_crew_id: crews.lebedev,
      p_priority: "normal",
      p_planned_start: "2033-04-04T06:00:00Z",
      p_planned_end: "2033-04-04T10:00:00Z",
      p_client_key: key(),
    });
    taskId = state.task_id;
    state = await rpc<TaskResult>(db, users.lebedev, "accept_task", {
      p_task_id: taskId,
      p_expected_version: state.version,
      p_client_key: key(),
    });
    await rpc(db, users.lebedev, "start_task", {
      p_task_id: taskId,
      p_expected_version: state.version,
      p_client_key: key(),
    });
    await db.query("commit");
  });

  afterEach(async () => {
    await db.query("rollback");
    await other.query("rollback");
  });

  after(async () => {
    if (taskId) {
      await db.query("delete from storage.objects where bucket_id = 'task-photos' and name like $1", [
        `${companyId}/${taskId}/%`,
      ]);
      await db.query("delete from public.tasks where id = $1", [taskId]);
      await db.query("update public.companies set next_task_number = $2 where id = $1", [companyId, nextNumber]);
    }
    await db.query("delete from app.idempotency_keys where created_at >= $1 and user_id = any ($2::uuid[])", [
      startedAt,
      [users.dispatcherNorth, users.lebedev],
    ]);
    await db.end();
    await other.end();
  });

  it("discard_upload в соседней вкладке: отчёт без фото не публикуется", async () => {
    const photos = await stage(2);
    await other.query("begin");
    for (const photo of photos) {
      await rpc(other, users.lebedev, "discard_upload", { p_upload_id: photo.upload_id });
    }

    await db.query("begin");
    const pending = outcome(submit(db, taskId, uploadIds(photos)));
    assert.ok(await waitForLock(other, dbPid));
    await other.query("commit");
    const { value, error } = await pending;

    assert.equal(value, null);
    assert.ok(notReady(error));
  });

  it("файл удалён из хранилища раньше отправки: отчёт ждёт и не публикуется", async () => {
    const photos = await stage(2);
    await other.query("begin");
    assert.equal((await removeObject(photos[0].storage_path)).rowCount, 1);

    await db.query("begin");
    const pending = outcome(submit(db, taskId, uploadIds(photos)));
    assert.ok(await waitForLock(other, dbPid));
    await other.query("commit");
    const { value, error } = await pending;

    assert.equal(value, null);
    assert.ok(notReady(error));
  });

  it("отчёт отправлен раньше удаления: файл остаётся в хранилище", async () => {
    const photos = await stage(2);
    await db.query("begin");
    const result = await submit(db, taskId, uploadIds(photos));
    assert.equal(result.status, "InReview");

    await other.query("begin");
    const removal = outcome(removeObject(photos[1].storage_path));
    assert.ok(await waitForLock(db, otherPid));
    await db.query("commit");
    const { value, error } = await removal;
    await other.query("commit");

    assert.equal(error, null);
    assert.equal(value?.rowCount, 0);
    const { rows } = await db.query<{ count: number }>(
      `select count(*)::int as count
       from public.uploads u
       join storage.objects o on o.bucket_id = 'task-photos' and o.name = u.storage_path
       where u.task_id = $1 and u.report_id is not null`,
      [taskId],
    );
    assert.equal(rows[0].count, 2);
  });
});
