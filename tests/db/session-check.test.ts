import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { as, errorCode, inRollback, key, task, users, type Db } from "./helpers";

const photoQuery = "select 1 from storage.objects where name = $1";
const messageQuery = "select public.post_message(p_task_id => $1, p_body => 'Материалы на месте', p_client_key => $2)";

async function openSession(db: Db, userId: string, notAfter: string | null = null) {
  const sessionId = randomUUID();
  await db.query("insert into auth.sessions (id, user_id, not_after) values ($1, $2, $3)", [
    sessionId,
    userId,
    notAfter,
  ]);
  return sessionId;
}

async function closeSession(db: Db, sessionId: string) {
  await db.query("delete from auth.sessions where id = $1", [sessionId]);
}

function inSession(db: Db, userId: string, sessionId: string, sql: string, values: unknown[] = []) {
  return as(db, userId, async () => {
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated", session_id: sessionId }),
    ]);
    const { rows } = await db.query(sql, values);
    return rows;
  });
}

async function publishedPhoto(db: Db) {
  const { rows } = await db.query<{ storage_path: string }>(
    "select storage_path from public.uploads where task_id = $1 and report_id is not null limit 1",
    [task(7)],
  );
  await db.query("insert into storage.objects (bucket_id, name) values ('task-photos', $1)", [rows[0].storage_path]);
  return rows[0].storage_path;
}

describe("завершённая сессия", () => {
  it("фото отчёта доступно в активной сессии и закрывается после выхода", () =>
    inRollback(async (db) => {
      const path = await publishedPhoto(db);
      const session = await openSession(db, users.lebedev);
      assert.equal((await inSession(db, users.lebedev, session, photoQuery, [path])).length, 1);

      await closeSession(db, session);
      assert.equal((await inSession(db, users.lebedev, session, photoQuery, [path])).length, 0);
    }));

  it("сессия с истёкшим сроком не открывает фото", () =>
    inRollback(async (db) => {
      const path = await publishedPhoto(db);
      const session = await openSession(db, users.lebedev, "2020-01-01T00:00:00Z");
      assert.equal((await inSession(db, users.lebedev, session, photoQuery, [path])).length, 0);
    }));

  it("сессия другого пользователя не подходит", () =>
    inRollback(async (db) => {
      const path = await publishedPhoto(db);
      const session = await openSession(db, users.petrov);
      assert.equal((await inSession(db, users.lebedev, session, photoQuery, [path])).length, 0);
    }));

  it("после выхода изменения через RPC отклоняются", () =>
    inRollback(async (db) => {
      const session = await openSession(db, users.lebedev);
      const [{ post_message: posted }] = await inSession(db, users.lebedev, session, messageQuery, [task(4), key()]);
      assert.ok(posted);

      await closeSession(db, session);
      await assert.rejects(
        inSession(db, users.lebedev, session, messageQuery, [task(4), key()]),
        (error) => errorCode(error) === "MB401",
      );
    }));
});
