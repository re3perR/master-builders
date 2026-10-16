import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { as, errorCode, inRollback, key, rpc, select, stagePhoto, task, users, version, type Db } from "./helpers";

async function pathOf(db: Db, uploadId: string) {
  const { rows } = await db.query<{ storage_path: string }>("select storage_path from public.uploads where id = $1", [
    uploadId,
  ]);
  return rows[0].storage_path;
}

async function removeObject(db: Db, userId: string, path: string) {
  return as(db, userId, async () => {
    const result = await db.query("delete from storage.objects where bucket_id = 'task-photos' and name = $1", [path]);
    return result.rowCount;
  });
}

async function asService<T>(db: Db, fn: () => Promise<T>) {
  await db.query("savepoint as_service");
  try {
    await db.query("set local role service_role");
    const result = await fn();
    await db.query("reset role");
    await db.query("release savepoint as_service");
    return result;
  } catch (error) {
    await db.query("rollback to savepoint as_service");
    await db.query("reset role");
    throw error;
  }
}

describe("удаление временных фото", () => {
  it("бригадир удаляет только свой неотправленный файл", () =>
    inRollback(async (db) => {
      const own = await pathOf(db, await stagePhoto(db, users.lebedev, task(5)));
      assert.equal(await removeObject(db, users.dispatcherNorth, own), 0);
      assert.equal(await removeObject(db, users.petrov, own), 0);
      assert.equal(await removeObject(db, users.lebedev, own), 1);

      const { rows } = await db.query<{ storage_path: string }>(
        "select storage_path from public.uploads where task_id = $1 and report_id is not null limit 1",
        [task(7)],
      );
      await db.query("insert into storage.objects (bucket_id, name) values ('task-photos', $1)", [
        rows[0].storage_path,
      ]);
      assert.equal(await removeObject(db, users.lebedev, rows[0].storage_path), 0);
    }));

  it("после отправки отчёта фото удалить нельзя", () =>
    inRollback(async (db) => {
      const id = task(5);
      const upload = await stagePhoto(db, users.lebedev, id);
      await rpc(db, users.lebedev, "submit_report", {
        p_task_id: id,
        p_expected_version: await version(db, id),
        p_comment: "Покрытие пола заменено полностью",
        p_upload_ids: [upload],
        p_client_key: key(),
      });
      assert.equal(await removeObject(db, users.lebedev, await pathOf(db, upload)), 0);
      const discarded = await rpc<{ storage_path: string | null }>(db, users.lebedev, "discard_upload", {
        p_upload_id: upload,
      });
      assert.equal(discarded.storage_path, null);
    }));

  it("discard_upload не трогает чужие временные загрузки", () =>
    inRollback(async (db) => {
      const upload = await stagePhoto(db, users.lebedev, task(5));
      const path = await pathOf(db, upload);
      const foreign = await rpc<{ storage_path: string | null }>(db, users.dispatcherNorth, "discard_upload", {
        p_upload_id: upload,
      });
      assert.equal(foreign.storage_path, null);
      const own = await rpc<{ storage_path: string | null }>(db, users.lebedev, "discard_upload", {
        p_upload_id: upload,
      });
      assert.equal(own.storage_path, path);
      const left = await select(db, users.lebedev, "select 1 from public.uploads where id = $1", [upload]);
      assert.equal(left.length, 0);
    }));
});

describe("очистка старых загрузок", () => {
  it("в очистку попадают старые временные файлы и файлы без записи, но не фото отчётов", () =>
    inRollback(async (db) => {
      const stale = await stagePhoto(db, users.lebedev, task(5));
      const fresh = await stagePhoto(db, users.lebedev, task(5));
      await db.query("update public.uploads set created_at = now() - interval '2 days' where id = $1", [stale]);
      await db.query(
        "insert into storage.objects (bucket_id, name, created_at) values ('task-photos', 'orphan/old.jpg', now() - interval '3 days'), ('task-photos', 'orphan/new.jpg', now())",
      );
      const { rows: published } = await db.query<{ id: string; storage_path: string }>(
        "update public.uploads set created_at = now() - interval '9 days' where task_id = $1 and report_id is not null returning id, storage_path",
        [task(7)],
      );
      for (const row of published) {
        await db.query(
          "insert into storage.objects (bucket_id, name, created_at) values ('task-photos', $1, now() - interval '9 days')",
          [row.storage_path],
        );
      }

      const listed = await asService(db, async () => {
        const { rows } = await db.query<{ upload_id: string | null; storage_path: string }>(
          "select * from public.stale_uploads(interval '24 hours')",
        );
        return rows;
      });
      const paths = listed.map((row) => row.storage_path);
      assert.ok(listed.some((row) => row.upload_id === stale));
      assert.ok(!listed.some((row) => row.upload_id === fresh));
      assert.ok(paths.includes("orphan/old.jpg"));
      assert.ok(!paths.includes("orphan/new.jpg"));
      assert.ok(published.every((row) => !paths.includes(row.storage_path)));

      await asService(db, async () => {
        await db.query("select public.forget_stale_upload($1)", [stale]);
        await db.query("select public.forget_stale_upload($1)", [published[0].id]);
      });
      const { rows: remaining } = await db.query<{ id: string }>(
        "select id from public.uploads where id = any($1::uuid[])",
        [[stale, published[0].id]],
      );
      assert.deepEqual(
        remaining.map((row) => row.id),
        [published[0].id],
      );
    }));

  it("пользователи не вызывают служебные функции очистки", () =>
    inRollback(async (db) => {
      for (const user of [users.lebedev, users.dispatcherNorth]) {
        await assert.rejects(
          select(db, user, "select * from public.stale_uploads(interval '24 hours')"),
          (error) => errorCode(error) === "42501",
        );
      }
    }));
});
