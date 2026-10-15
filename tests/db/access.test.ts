import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { as, crews, errorCode, inRollback, key, rpc, select, sites, task, users } from "./helpers";

describe("изоляция данных", () => {
  it("бригадир видит только задания своей бригады", () =>
    inRollback(async (db) => {
      const rows = await select<{ crew_id: string }>(db, users.petrov, "select crew_id from public.tasks");
      assert.ok(rows.length > 0);
      assert.ok(rows.every((row) => row.crew_id === crews.petrov));
    }));

  it("диспетчер и руководитель видят только своё подразделение", () =>
    inRollback(async (db) => {
      for (const user of [users.dispatcherNorth, users.managerNorth]) {
        const rows = await select<{ number: number }>(db, user, "select number from public.tasks order by number");
        assert.ok(rows.length > 0);
        assert.ok(rows.every((row) => row.number <= 16));
      }
      const south = await select(db, users.managerSouth, "select 1 from public.tasks where id = $1", [task(1)]);
      assert.equal(south.length, 0);
    }));

  it("чужие сообщения, история, отчёты и фото не читаются по прямому ID", () =>
    inRollback(async (db) => {
      for (const table of ["task_messages", "task_events", "task_reports", "uploads", "task_obstacles"]) {
        const rows = await select(db, users.gusev, `select 1 from public.${table} where task_id = any($1)`, [
          [task(4), task(6), task(8), task(9)],
        ]);
        assert.equal(rows.length, 0, table);
      }
      const objects = await select(db, users.petrov, "select 1 from public.uploads where task_id = $1", [task(7)]);
      assert.equal(objects.length, 0);
    }));

  it("бригадир видит только объекты своих заданий", () =>
    inRollback(async (db) => {
      const rows = await select<{ id: string }>(db, users.lebedev, "select id from public.sites");
      const ids = rows.map((row) => row.id).sort();
      assert.deepEqual(ids, [sites.park, sites.school, sites.warehouse].sort());
      const gusev = await select<{ id: string }>(db, users.gusev, "select id from public.sites");
      assert.ok(gusev.every((row) => row.id === sites.office || row.id === sites.cafe));
    }));

  it("анонимный пользователь ничего не читает", () =>
    inRollback(async (db) => {
      await assert.rejects(select(db, null, "select * from public.tasks"), (error) => errorCode(error) === "42501");
    }));

  it("дополнительная компания изолирована от основной", () =>
    inRollback(async (db) => {
      await db.query(`
        insert into public.companies (id, name) values ('00000000-0000-4000-8000-000000000001', 'Сторонняя компания');
        insert into public.divisions (id, company_id, name)
          values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Участок');
        insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000003', 'other@demo.local');
        insert into public.profiles (id, company_id, division_id, role, full_name)
          values ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001',
                  '00000000-0000-4000-8000-000000000002', 'dispatcher', 'Чужой Диспетчер');
      `);
      const outsider = "00000000-0000-4000-8000-000000000003";
      for (const table of ["tasks", "sites", "crews", "profiles", "task_events"]) {
        const rows = await select<{ id?: string }>(db, outsider, `select * from public.${table}`);
        assert.ok(
          rows.every((row) => row.id === undefined || row.id === outsider),
          table,
        );
      }
      await assert.rejects(
        rpc(db, outsider, "accept_task", { p_task_id: task(1), p_expected_version: 1, p_client_key: key() }),
        (error) => errorCode(error) === "MB403",
      );
      await assert.rejects(
        rpc(db, outsider, "cancel_task", {
          p_task_id: task(1),
          p_expected_version: 1,
          p_reason: "Проверка",
          p_client_key: key(),
        }),
        (error) => errorCode(error) === "MB404",
      );
    }));
});

describe("запрет прямых изменений", () => {
  it("пользователь не меняет статус, отчёт и историю напрямую", () =>
    inRollback(async (db) => {
      const attempts = [
        ["update public.tasks set status = 'Completed' where id = $1", [task(6)]],
        ["update public.task_reports set decision = 'accepted' where task_id = $1", [task(6)]],
        ["delete from public.task_events where task_id = $1", [task(6)]],
        [
          "insert into public.task_messages (task_id, author_id, author_role, body, client_key) values ($1, $2, 'dispatcher', 'x', gen_random_uuid())",
          [task(6), users.dispatcherNorth],
        ],
      ] as const;
      for (const [sql, values] of attempts) {
        await assert.rejects(
          as(db, users.dispatcherNorth, () => db.query(sql, [...values])),
          (error) => errorCode(error) === "42501",
          sql,
        );
      }
    }));

  it("руководитель не выполняет ни одного действия", () =>
    inRollback(async (db) => {
      const calls: [string, Record<string, unknown>][] = [
        ["accept_task", { p_task_id: task(1), p_expected_version: 1, p_client_key: key() }],
        ["cancel_task", { p_task_id: task(1), p_expected_version: 1, p_reason: "Проверка", p_client_key: key() }],
        ["post_message", { p_task_id: task(1), p_body: "Привет", p_client_key: key() }],
        ["close_obstacle", { p_task_id: task(4), p_expected_version: 4, p_comment: "Закрываю", p_client_key: key() }],
      ];
      for (const [name, args] of calls) {
        await assert.rejects(rpc(db, users.managerNorth, name, args), (error) => errorCode(error) === "MB403", name);
      }
    }));
});

describe("хранилище фото", () => {
  it("загрузка возможна только по выданному сервером пути", () =>
    inRollback(async (db) => {
      await assert.rejects(
        as(db, users.lebedev, () =>
          db.query("insert into storage.objects (bucket_id, name) values ('task-photos', 'any/path/photo.jpg')"),
        ),
        (error) => errorCode(error) === "42501",
      );
    }));

  it("опубликованные фото видны только участникам задания", () =>
    inRollback(async (db) => {
      const { rows } = await db.query<{ storage_path: string }>(
        "select storage_path from public.uploads where task_id = $1 and report_id is not null limit 1",
        [task(7)],
      );
      await db.query("insert into storage.objects (bucket_id, name) values ('task-photos', $1)", [
        rows[0].storage_path,
      ]);
      const own = await select(db, users.lebedev, "select 1 from storage.objects where name = $1", [
        rows[0].storage_path,
      ]);
      assert.equal(own.length, 1);
      for (const user of [users.petrov, users.gusev, users.dispatcherSouth]) {
        const other = await select(db, user, "select 1 from storage.objects where name = $1", [rows[0].storage_path]);
        assert.equal(other.length, 0);
      }
    }));

  it("чужой неопубликованный файл недоступен даже диспетчеру", () =>
    inRollback(async (db) => {
      const staged = await rpc<{ storage_path: string }>(db, users.lebedev, "register_upload", {
        p_task_id: task(5),
        p_mime_type: "image/webp",
        p_size_bytes: 5000,
        p_width: 100,
        p_height: 100,
      });
      await as(db, users.lebedev, () =>
        db.query("insert into storage.objects (bucket_id, name) values ('task-photos', $1)", [staged.storage_path]),
      );
      const dispatcher = await select(db, users.dispatcherNorth, "select 1 from storage.objects where name = $1", [
        staged.storage_path,
      ]);
      assert.equal(dispatcher.length, 0);
      await assert.rejects(
        as(db, users.lebedev, () =>
          db
            .query("update storage.objects set name = name || '.bak' where name = $1", [staged.storage_path])
            .then((result) => {
              if (result.rowCount) throw Object.assign(new Error("updated"), { code: "UPDATED" });
              throw Object.assign(new Error("denied"), { code: "42501" });
            }),
        ),
        (error) => errorCode(error) === "42501",
      );
    }));
});
