import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  as,
  crews,
  errorCode,
  inRollback,
  key,
  rpc,
  select,
  sites,
  stagePhoto,
  task,
  users,
  version,
  type Db,
} from "./helpers";

type SiteResult = {
  result: string;
  site_id: string;
  changed: boolean;
  updated_at: string;
  archived_at?: string | null;
};
type CrewResult = { result: string; crew_id: string; changed: boolean; updated_at: string };
type TaskResult = { result: string; task_id: string; status: string; version: number; report_id?: string };

const hour = 3600 * 1000;
const slot = (offsetHours: number) => new Date(Date.UTC(2032, 2, 1, 6) + offsetHours * hour).toISOString();

function rejectsWith(code: string, message?: string) {
  return (error: unknown) => {
    assert.equal(errorCode(error), code);
    if (message) assert.equal((error as Error).message, message);
    return true;
  };
}

async function createSite(db: Db, name = "Тестовый объект", user = users.dispatcherNorth) {
  return rpc<SiteResult>(db, user, "create_site", {
    p_name: name,
    p_address: "г. Тверь, ул. Тестовая, д. 1",
    p_access_note: "Вход со двора",
    p_contact: null,
    p_client_key: key(),
  });
}

async function createTask(db: Db, siteId: string, offsetHours = 0) {
  return rpc<TaskResult>(db, users.dispatcherNorth, "create_task", {
    p_title: "Задание на тестовом объекте",
    p_description: "Описание задания для проверки справочников",
    p_site_id: siteId,
    p_crew_id: crews.petrov,
    p_priority: "normal",
    p_planned_start: slot(offsetHours),
    p_planned_end: slot(offsetHours + 4),
    p_client_key: key(),
  });
}

async function moveToReview(db: Db, created: TaskResult) {
  let state = await rpc<TaskResult>(db, users.petrov, "accept_task", {
    p_task_id: created.task_id,
    p_expected_version: created.version,
    p_client_key: key(),
  });
  state = await rpc<TaskResult>(db, users.petrov, "start_task", {
    p_task_id: created.task_id,
    p_expected_version: state.version,
    p_client_key: key(),
  });
  const photo = await stagePhoto(db, users.petrov, created.task_id);
  return rpc<TaskResult>(db, users.petrov, "submit_report", {
    p_task_id: created.task_id,
    p_expected_version: state.version,
    p_comment: "Работы на объекте выполнены",
    p_upload_ids: [photo],
    p_client_key: key(),
  });
}

describe("права на справочники", () => {
  it("руководитель и бригадир не меняют объекты и бригады", () =>
    inRollback(async (db) => {
      const calls: [string, Record<string, unknown>][] = [
        [
          "create_site",
          {
            p_name: "Объект",
            p_address: "г. Тверь, ул. Новая, 1",
            p_access_note: null,
            p_contact: null,
            p_client_key: key(),
          },
        ],
        [
          "update_site",
          {
            p_site_id: sites.park,
            p_name: "Переименованный объект",
            p_address: "г. Тверь, ул. Новая, 1",
            p_access_note: null,
            p_contact: null,
            p_client_key: key(),
          },
        ],
        ["archive_site", { p_site_id: sites.park, p_client_key: key() }],
        ["restore_site", { p_site_id: sites.park, p_client_key: key() }],
        ["delete_site", { p_site_id: sites.park, p_client_key: key() }],
        ["update_crew", { p_crew_id: crews.petrov, p_name: "Бригада", p_members: [], p_client_key: key() }],
      ];
      for (const user of [users.managerNorth, users.petrov]) {
        for (const [name, args] of calls) {
          await assert.rejects(rpc(db, user, name, args), rejectsWith("MB403"), name);
        }
      }
      for (const [name, args] of calls) {
        await assert.rejects(rpc(db, null, name, args), rejectsWith("42501"), name);
      }
    }));

  it("диспетчер не видит и не меняет справочники другого подразделения", () =>
    inRollback(async (db) => {
      const calls: [string, Record<string, unknown>][] = [
        [
          "update_site",
          {
            p_site_id: sites.park,
            p_name: "Чужой объект",
            p_address: "г. Тверь, ул. Чужая, 1",
            p_access_note: null,
            p_contact: null,
            p_client_key: key(),
          },
        ],
        ["archive_site", { p_site_id: sites.school, p_client_key: key() }],
        ["restore_site", { p_site_id: sites.school, p_client_key: key() }],
        ["delete_site", { p_site_id: sites.warehouse, p_client_key: key() }],
        ["update_crew", { p_crew_id: crews.petrov, p_name: "Чужая бригада", p_members: [], p_client_key: key() }],
      ];
      for (const [name, args] of calls) {
        await assert.rejects(rpc(db, users.dispatcherSouth, name, args), rejectsWith("MB404"), name);
      }

      const southSites = await select<{ id: string }>(
        db,
        users.dispatcherSouth,
        "select id from public.site_summaries(null, true)",
      );
      assert.deepEqual(southSites.map((row) => row.id).sort(), [sites.office, sites.cafe].sort());
      const southCrews = await select<{ id: string }>(db, users.managerSouth, "select id from public.crew_summaries()");
      assert.deepEqual(
        southCrews.map((row) => row.id),
        [crews.gusev],
      );

      const created = await createSite(db, "Объект «Юг»", users.dispatcherSouth);
      const north = await select(db, users.managerNorth, "select 1 from public.sites where id = $1", [created.site_id]);
      assert.equal(north.length, 0);
    }));

  it("бригадир видит в сводках только свою бригаду и объекты своих заданий", () =>
    inRollback(async (db) => {
      const own = await select<{ id: string }>(db, users.lebedev, "select id from public.crew_summaries()");
      assert.deepEqual(
        own.map((row) => row.id),
        [crews.lebedev],
      );
      const visible = await select<{ id: string; total_tasks: number }>(
        db,
        users.petrov,
        "select id, total_tasks from public.site_summaries(null, true)",
      );
      const tasks = await select<{ site_id: string }>(db, users.petrov, "select site_id from public.tasks");
      assert.deepEqual(visible.map((row) => row.id).sort(), [...new Set(tasks.map((row) => row.site_id))].sort());
      assert.equal(
        visible.reduce((sum, row) => sum + row.total_tasks, 0),
        tasks.length,
      );
    }));

  it("справочники нельзя менять прямыми запросами к таблицам", () =>
    inRollback(async (db) => {
      const attempts = [
        [
          "insert into public.sites (company_id, division_id, name, address) select company_id, division_id, 'Обход', 'г. Тверь, ул. Обходная, 1' from public.sites limit 1",
          [],
        ],
        ["update public.sites set archived_at = now() where id = $1", [sites.park]],
        ["delete from public.sites where id = $1", [sites.park]],
        ["update public.crews set name = 'Обход' where id = $1", [crews.petrov]],
        ["delete from public.crew_members where crew_id = $1", [crews.petrov]],
        ["insert into public.crew_members (crew_id, name) values ($1, 'Лишний')", [crews.petrov]],
      ] as const;
      for (const [sql, values] of attempts) {
        await assert.rejects(
          as(db, users.dispatcherNorth, () => db.query(sql, [...values])),
          rejectsWith("42501"),
          sql,
        );
      }
    }));
});

describe("объекты", () => {
  it("создание проверяет поля и не дублируется при повторе", () =>
    inRollback(async (db) => {
      const base = {
        p_name: "Новый объект",
        p_address: "г. Тверь, ул. Лесная, д. 5",
        p_access_note: null,
        p_contact: null,
      };
      const invalid: [Record<string, unknown>, string][] = [
        [{ p_name: " Я " }, "name"],
        [{ p_address: "ул." }, "address"],
        [{ p_access_note: "а".repeat(2001) }, "access_note"],
        [{ p_contact: "к".repeat(201) }, "contact"],
      ];
      for (const [patch, field] of invalid) {
        await assert.rejects(
          rpc(db, users.dispatcherNorth, "create_site", { ...base, ...patch, p_client_key: key() }),
          (error) => {
            assert.equal(errorCode(error), "MB422");
            assert.equal(JSON.parse((error as { detail: string }).detail).field, field);
            return true;
          },
          field,
        );
      }

      const clientKey = key();
      const args = { ...base, p_name: "  Новый объект  ", p_access_note: "  ", p_client_key: clientKey };
      const first = await rpc<SiteResult>(db, users.dispatcherNorth, "create_site", args);
      const second = await rpc<SiteResult>(db, users.dispatcherNorth, "create_site", args);
      assert.deepEqual(second, first);

      const rows = await select<{ name: string; access_note: string | null; archived_at: string | null }>(
        db,
        users.managerNorth,
        "select name, access_note, archived_at from public.sites where name like 'Новый объект%'",
      );
      assert.deepEqual(rows, [{ name: "Новый объект", access_note: null, archived_at: null }]);
    }));

  it("правка объекта не меняет снимки адреса в заданиях и защищена от устаревших данных", () =>
    inRollback(async (db) => {
      const before = await select<{ id: string; address_snapshot: string; access_note_snapshot: string | null }>(
        db,
        users.dispatcherNorth,
        "select id, address_snapshot, access_note_snapshot from public.tasks where site_id = $1 order by id",
        [sites.park],
      );
      const [site] = await select<{ updated_at: string }>(
        db,
        users.dispatcherNorth,
        "select updated_at::text from public.sites where id = $1",
        [sites.park],
      );
      const update = (patch: Record<string, unknown> = {}) =>
        rpc<SiteResult>(db, users.dispatcherNorth, "update_site", {
          p_site_id: sites.park,
          p_name: "ЖК «Северный парк», корпус 2",
          p_address: "г. Тверь, ул. Строителей, д. 16",
          p_access_note: "Новый порядок въезда",
          p_contact: null,
          p_client_key: key(),
          p_expected_updated_at: site.updated_at,
          ...patch,
        });

      const updated = await update();
      assert.equal(updated.changed, true);
      const after = await select(
        db,
        users.dispatcherNorth,
        "select id, address_snapshot, access_note_snapshot from public.tasks where site_id = $1 order by id",
        [sites.park],
      );
      assert.deepEqual(after, before);

      await assert.rejects(update({ p_name: "Другое название" }), rejectsWith("MB409", "version_conflict"));

      const unchanged = await update({ p_expected_updated_at: updated.updated_at });
      assert.equal(unchanged.changed, false);
      assert.equal(unchanged.updated_at, updated.updated_at);
    }));

  it("архивирование запрещено при активных заданиях, включая проверку", () =>
    inRollback(async (db) => {
      await assert.rejects(
        rpc(db, users.dispatcherNorth, "archive_site", { p_site_id: sites.park, p_client_key: key() }),
        rejectsWith("MB423", "active_tasks"),
      );

      const site = await createSite(db);
      const created = await createTask(db, site.site_id);
      await assert.rejects(
        rpc(db, users.dispatcherNorth, "archive_site", { p_site_id: site.site_id, p_client_key: key() }),
        rejectsWith("MB423", "active_tasks"),
      );

      const inReview = await moveToReview(db, created);
      assert.equal(inReview.status, "InReview");
      await assert.rejects(
        rpc(db, users.dispatcherNorth, "archive_site", { p_site_id: site.site_id, p_client_key: key() }),
        rejectsWith("MB423", "active_tasks"),
      );

      await rpc(db, users.dispatcherNorth, "approve_report", {
        p_task_id: created.task_id,
        p_expected_version: inReview.version,
        p_report_id: inReview.report_id,
        p_client_key: key(),
      });
      const clientKey = key();
      const archived = await rpc<SiteResult>(db, users.dispatcherNorth, "archive_site", {
        p_site_id: site.site_id,
        p_client_key: clientKey,
      });
      assert.equal(archived.changed, true);
      assert.ok(archived.archived_at);
      assert.deepEqual(
        await rpc(db, users.dispatcherNorth, "archive_site", { p_site_id: site.site_id, p_client_key: clientKey }),
        archived,
      );
      const again = await rpc<SiteResult>(db, users.dispatcherNorth, "archive_site", {
        p_site_id: site.site_id,
        p_client_key: key(),
      });
      assert.equal(again.changed, false);

      const history = await select(db, users.petrov, "select 1 from public.tasks where id = $1 and site_id = $2", [
        created.task_id,
        site.site_id,
      ]);
      assert.equal(history.length, 1);
    }));

  it("архивный объект не выбирается для нового задания, после восстановления — выбирается", () =>
    inRollback(async (db) => {
      const site = await createSite(db);
      await rpc(db, users.dispatcherNorth, "archive_site", { p_site_id: site.site_id, p_client_key: key() });

      await assert.rejects(createTask(db, site.site_id), (error) => {
        assert.equal(errorCode(error), "MB422");
        assert.equal((error as Error).message, "archived_reference");
        return true;
      });
      await assert.rejects(
        rpc(db, users.dispatcherNorth, "update_site", {
          p_site_id: site.site_id,
          p_name: "Архивный объект",
          p_address: "г. Тверь, ул. Тестовая, д. 1",
          p_access_note: null,
          p_contact: null,
          p_client_key: key(),
        }),
        rejectsWith("MB423", "site_archived"),
      );

      const listed = await select<{ id: string }>(
        db,
        users.dispatcherNorth,
        "select id from public.site_summaries() where id = $1",
        [site.site_id],
      );
      assert.equal(listed.length, 0);
      const withArchived = await select<{ id: string }>(
        db,
        users.dispatcherNorth,
        "select id from public.site_summaries('тестов', true) where id = $1",
        [site.site_id],
      );
      assert.equal(withArchived.length, 1);

      const restored = await rpc<SiteResult>(db, users.dispatcherNorth, "restore_site", {
        p_site_id: site.site_id,
        p_client_key: key(),
      });
      assert.equal(restored.changed, true);
      assert.equal(restored.archived_at, null);
      const created = await createTask(db, site.site_id);
      assert.equal(created.result, "ok");
    }));

  it("удалить можно только объект, который ни разу не использовался", () =>
    inRollback(async (db) => {
      await assert.rejects(
        rpc(db, users.dispatcherNorth, "delete_site", { p_site_id: sites.school, p_client_key: key() }),
        rejectsWith("MB423", "site_in_use"),
      );

      const used = await createSite(db, "Использованный объект");
      const created = await createTask(db, used.site_id);
      await rpc(db, users.dispatcherNorth, "cancel_task", {
        p_task_id: created.task_id,
        p_expected_version: created.version,
        p_reason: "Заказчик отказался",
        p_client_key: key(),
      });
      await rpc(db, users.dispatcherNorth, "archive_site", { p_site_id: used.site_id, p_client_key: key() });
      await assert.rejects(
        rpc(db, users.dispatcherNorth, "delete_site", { p_site_id: used.site_id, p_client_key: key() }),
        rejectsWith("MB423", "site_in_use"),
      );

      const unused = await createSite(db, "Лишний объект");
      const clientKey = key();
      const deleted = await rpc(db, users.dispatcherNorth, "delete_site", {
        p_site_id: unused.site_id,
        p_client_key: clientKey,
      });
      assert.deepEqual(
        await rpc(db, users.dispatcherNorth, "delete_site", { p_site_id: unused.site_id, p_client_key: clientKey }),
        deleted,
      );
      await assert.rejects(
        rpc(db, users.dispatcherNorth, "delete_site", { p_site_id: unused.site_id, p_client_key: key() }),
        rejectsWith("MB404", "site_not_found"),
      );
      const rows = await select(db, users.dispatcherNorth, "select 1 from public.sites where id = $1", [
        unused.site_id,
      ]);
      assert.equal(rows.length, 0);
    }));
});

describe("бригады", () => {
  it("диспетчер меняет название и состав, бригадир видит изменения", () =>
    inRollback(async (db) => {
      const [crew] = await select<{ updated_at: string; foreman_id: string }>(
        db,
        users.dispatcherNorth,
        "select updated_at::text, foreman_id from public.crews where id = $1",
        [crews.petrov],
      );
      const tasksBefore = await select(db, users.petrov, "select id, crew_id, version from public.tasks order by id");

      const updated = await rpc<CrewResult>(db, users.dispatcherNorth, "update_crew", {
        p_crew_id: crews.petrov,
        p_name: "  Бригада монтажа №1 (усиленная)  ",
        p_members: ["Монтажник — Д. Зайцев", " Сварщик — Р. Ахмедов ", "Монтажник 3"],
        p_client_key: key(),
        p_expected_updated_at: crew.updated_at,
      });
      assert.equal(updated.changed, true);

      const members = await select<{ name: string; position: number }>(
        db,
        users.petrov,
        "select name, position from public.crew_members where crew_id = $1 order by position",
        [crews.petrov],
      );
      assert.deepEqual(members, [
        { name: "Монтажник — Д. Зайцев", position: 1 },
        { name: "Сварщик — Р. Ахмедов", position: 2 },
        { name: "Монтажник 3", position: 3 },
      ]);
      const [after] = await select<{ name: string; foreman_id: string }>(
        db,
        users.petrov,
        "select name, foreman_id from public.crews where id = $1",
        [crews.petrov],
      );
      assert.deepEqual(after, { name: "Бригада монтажа №1 (усиленная)", foreman_id: crew.foreman_id });
      assert.deepEqual(
        await select(db, users.petrov, "select id, crew_id, version from public.tasks order by id"),
        tasksBefore,
      );

      const same = await rpc<CrewResult>(db, users.dispatcherNorth, "update_crew", {
        p_crew_id: crews.petrov,
        p_name: "Бригада монтажа №1 (усиленная)",
        p_members: ["Монтажник — Д. Зайцев", "Сварщик — Р. Ахмедов", "Монтажник 3"],
        p_client_key: key(),
        p_expected_updated_at: updated.updated_at,
      });
      assert.equal(same.changed, false);

      await assert.rejects(
        rpc(db, users.dispatcherNorth, "update_crew", {
          p_crew_id: crews.petrov,
          p_name: "Бригада монтажа №1",
          p_members: [],
          p_client_key: key(),
          p_expected_updated_at: crew.updated_at,
        }),
        rejectsWith("MB409", "version_conflict"),
      );

      const emptied = await rpc<CrewResult>(db, users.dispatcherNorth, "update_crew", {
        p_crew_id: crews.petrov,
        p_name: "Бригада монтажа №1",
        p_members: [],
        p_client_key: key(),
      });
      assert.equal(emptied.changed, true);
      const left = await select(db, users.dispatcherNorth, "select 1 from public.crew_members where crew_id = $1", [
        crews.petrov,
      ]);
      assert.equal(left.length, 0);
    }));

  it("состав ограничен 30 людьми и именами от 1 до 120 символов", () =>
    inRollback(async (db) => {
      const update = (members: (string | null)[], name = "Бригада отделки №2") =>
        rpc(db, users.dispatcherNorth, "update_crew", {
          p_crew_id: crews.lebedev,
          p_name: name,
          p_members: members,
          p_client_key: key(),
        });
      const thirty = Array.from({ length: 30 }, (_, index) => `Отделочник ${index + 1}`);
      await assert.rejects(update([...thirty, "Лишний"]), rejectsWith("MB422", "too_many_members"));
      await assert.rejects(update(["Отделочник", "   "]), rejectsWith("MB422"));
      await assert.rejects(update(["Отделочник", null]), rejectsWith("MB422"));
      await assert.rejects(update(["О".repeat(121)]), rejectsWith("MB422"));
      await assert.rejects(update(["Отделочник"], "Б"), rejectsWith("MB422"));

      const saved = await update(thirty);
      assert.equal((saved as CrewResult).changed, true);
      const rows = await select(db, users.lebedev, "select 1 from public.crew_members where crew_id = $1", [
        crews.lebedev,
      ]);
      assert.equal(rows.length, 30);
    }));

  it("бригада другого подразделения недоступна, архивная бригада не редактируется", () =>
    inRollback(async (db) => {
      await assert.rejects(
        rpc(db, users.dispatcherNorth, "update_crew", {
          p_crew_id: crews.gusev,
          p_name: "Чужая бригада",
          p_members: [],
          p_client_key: key(),
        }),
        rejectsWith("MB404", "crew_not_found"),
      );
      await db.query("update public.crews set archived_at = now() where id = $1", [crews.lebedev]);
      await assert.rejects(
        rpc(db, users.dispatcherNorth, "update_crew", {
          p_crew_id: crews.lebedev,
          p_name: "Бригада отделки №2",
          p_members: [],
          p_client_key: key(),
        }),
        rejectsWith("MB423", "crew_archived"),
      );
      const summaries = await select<{ id: string; archived_at: string | null }>(
        db,
        users.managerNorth,
        "select id, archived_at from public.crew_summaries()",
      );
      assert.equal(summaries.at(-1)?.id, crews.lebedev);
      assert.ok(summaries.at(-1)?.archived_at);
    }));

  it("сводка по бригаде считает активные задания и открытые препятствия", () =>
    inRollback(async (db) => {
      const [summary] = await select<Record<string, number>>(
        db,
        users.managerNorth,
        "select assigned, accepted, in_progress, in_review, open_obstacles from public.crew_summaries() where id = $1",
        [crews.lebedev],
      );
      const [expected] = await select<Record<string, number>>(
        db,
        users.managerNorth,
        `select
           count(*) filter (where status = 'Assigned')::int as assigned,
           count(*) filter (where status = 'Accepted')::int as accepted,
           count(*) filter (where status = 'InProgress')::int as in_progress,
           count(*) filter (where status = 'InReview')::int as in_review,
           (select count(*) from public.task_obstacles o
             join public.tasks t on t.id = o.task_id
             where t.crew_id = $1 and o.closed_at is null)::int as open_obstacles
         from public.tasks where crew_id = $1`,
        [crews.lebedev],
      );
      assert.deepEqual(summary, expected);
      assert.equal(summary.open_obstacles, 1);

      await rpc(db, users.lebedev, "close_obstacle", {
        p_task_id: task(4),
        p_expected_version: await version(db, task(4)),
        p_comment: "Краску привезли",
        p_client_key: key(),
      });
      const [after] = await select<{ open_obstacles: number }>(
        db,
        users.managerNorth,
        "select open_obstacles from public.crew_summaries() where id = $1",
        [crews.lebedev],
      );
      assert.equal(after.open_obstacles, 0);
    }));
});
