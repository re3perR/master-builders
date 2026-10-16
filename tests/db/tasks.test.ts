import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crews, errorCode, inRollback, key, rpc, select, sites, task, users, version, type Db } from "./helpers";

type ListRow = {
  id: string;
  number: number;
  site_id: string;
  site_name: string | null;
  crew_name: string | null;
  is_overdue: boolean;
  has_open_obstacle: boolean;
  obstacle_category: string | null;
  obstacle_reason: string | null;
  obstacle_opened_at: Date | null;
  pending_submitted_at: Date | null;
  search_text: string;
};

async function seedDay(db: Db, offset: number) {
  const { rows } = await db.query(
    `select (date_trunc('day', planned_start at time zone 'Europe/Moscow') + make_interval(days => $2::int))
              at time zone 'Europe/Moscow' as start,
            (date_trunc('day', planned_start at time zone 'Europe/Moscow') + make_interval(days => $2::int + 1))
              at time zone 'Europe/Moscow' as finish
     from public.tasks where id = $1`,
    [task(1), offset],
  );
  return rows[0] as { start: Date; finish: Date };
}

async function numbersOnDay(db: Db, userId: string, offset: number) {
  const day = await seedDay(db, offset);
  const rows = await select<{ number: number }>(
    db,
    userId,
    "select number from public.task_list where planned_start < $2 and planned_end > $1 order by number",
    [day.start, day.finish],
  );
  return rows.map((row) => row.number);
}

async function searchNumbers(db: Db, userId: string, text: string) {
  const rows = await select<{ number: number }>(
    db,
    userId,
    "select number from public.task_list where search_text like '%' || $1 || '%' order by number",
    [text],
  );
  return rows.map((row) => row.number);
}

describe("список заданий: представление task_list", () => {
  it("каждый видит в списке ровно те задания, что доступны ему в таблице", () =>
    inRollback(async (db) => {
      const viewers = [
        users.dispatcherNorth,
        users.managerNorth,
        users.petrov,
        users.lebedev,
        users.dispatcherSouth,
        users.gusev,
      ];
      for (const viewer of viewers) {
        const listed = await select<{ id: string }>(db, viewer, "select id from public.task_list order by id");
        const direct = await select<{ id: string }>(db, viewer, "select id from public.tasks order by id");
        assert.ok(listed.length > 0, viewer);
        assert.deepEqual(listed, direct, viewer);
      }
      const petrov = await select<{ crew_id: string }>(db, users.petrov, "select crew_id from public.task_list");
      assert.ok(petrov.every((row) => row.crew_id === crews.petrov));
      const south = await select(db, users.dispatcherSouth, "select 1 from public.task_list where id = $1", [task(1)]);
      assert.equal(south.length, 0);
    }));

  it("анонимный пользователь не читает список", () =>
    inRollback(async (db) => {
      await assert.rejects(select(db, null, "select * from public.task_list"), (error) => errorCode(error) === "42501");
    }));

  it("представление работает с правами пользователя и не даёт менять данные", () =>
    inRollback(async (db) => {
      const { rows } = await db.query("select reloptions from pg_class where oid = 'public.task_list'::regclass");
      assert.ok((rows[0].reloptions as string[]).includes("security_invoker=true"));
      for (const [role, privilege, expected] of [
        ["authenticated", "SELECT", true],
        ["authenticated", "INSERT", false],
        ["authenticated", "UPDATE", false],
        ["authenticated", "DELETE", false],
        ["anon", "SELECT", false],
      ] as const) {
        const granted = await db.query("select has_table_privilege($1, 'public.task_list', $2) as allowed", [
          role,
          privilege,
        ]);
        assert.equal(granted.rows[0].allowed, expected, `${role} ${privilege}`);
      }
      await assert.rejects(
        select(db, users.dispatcherNorth, "update public.task_list set title = 'Новое название' where id = $1", [
          task(14),
        ]),
      );
      await assert.rejects(select(db, users.dispatcherNorth, "delete from public.task_list where id = $1", [task(14)]));
      const unchanged = await select<{ title: string }>(
        db,
        users.dispatcherNorth,
        "select title from public.tasks where id = $1",
        [task(14)],
      );
      assert.notEqual(unchanged[0].title, "Новое название");
    }));

  it("признаки просрочки, препятствия и ожидания проверки считаются по данным", () =>
    inRollback(async (db) => {
      const rows = await select<ListRow>(db, users.dispatcherNorth, "select * from public.task_list");
      const byNumber = new Map(rows.map((row) => [row.number, row]));
      assert.equal(byNumber.size, rows.length);

      const blocked = byNumber.get(4);
      assert.equal(blocked?.has_open_obstacle, true);
      assert.equal(blocked?.obstacle_category, "materials");
      assert.ok(blocked?.obstacle_reason && blocked.obstacle_opened_at);
      assert.equal(byNumber.get(7)?.has_open_obstacle, false);
      assert.equal(byNumber.get(7)?.obstacle_reason, null);

      assert.ok(byNumber.get(6)?.pending_submitted_at);
      assert.equal(byNumber.get(8)?.pending_submitted_at, null);

      assert.equal(byNumber.get(5)?.is_overdue, true);
      assert.equal(byNumber.get(6)?.is_overdue, false);
      assert.equal(byNumber.get(7)?.is_overdue, false);
      assert.equal(byNumber.get(10)?.is_overdue, false);
      assert.equal(byNumber.get(14)?.is_overdue, false);

      assert.ok(rows.every((row) => row.site_name && row.crew_name));
    }));

  it("закрытие препятствия сразу убирает признак из списка", () =>
    inRollback(async (db) => {
      await rpc(db, users.dispatcherNorth, "close_obstacle", {
        p_task_id: task(4),
        p_expected_version: await version(db, task(4)),
        p_comment: "Краску привезли, можно продолжать.",
        p_client_key: key(),
      });
      const rows = await select<ListRow>(db, users.managerNorth, "select * from public.task_list where id = $1", [
        task(4),
      ]);
      assert.equal(rows[0].has_open_obstacle, false);
      assert.equal(rows[0].obstacle_category, null);
    }));

  it("поиск не зависит от регистра и буквы ё и учитывает объект и адрес", () =>
    inRollback(async (db) => {
      assert.deepEqual(await searchNumbers(db, users.dispatcherNorth, "шпаклевка откосов"), [9]);

      const warehouse = await select<{ number: number }>(
        db,
        users.dispatcherNorth,
        "select number from public.tasks where site_id = $1 order by number",
        [sites.warehouse],
      );
      assert.ok(warehouse.length > 0);
      assert.deepEqual(
        await searchNumbers(db, users.dispatcherNorth, "восток"),
        warehouse.map((row) => row.number),
      );

      const school = await select<{ number: number }>(
        db,
        users.dispatcherNorth,
        "select number from public.tasks where site_id = $1 order by number",
        [sites.school],
      );
      assert.deepEqual(
        await searchNumbers(db, users.dispatcherNorth, "пр-т победы"),
        school.map((row) => row.number),
      );

      assert.deepEqual(await searchNumbers(db, users.gusev, "шпаклевка"), []);
    }));

  it("фильтр по дню учитывает пересечение интервала, ночные задания и полночь", () =>
    inRollback(async (db) => {
      assert.deepEqual(await numbersOnDay(db, users.dispatcherNorth, 0), [1, 2, 3, 4, 9, 13]);
      assert.deepEqual(await numbersOnDay(db, users.dispatcherNorth, 1), [9, 12, 13, 16]);

      const evening = await seedDay(db, 5);
      const midnight = await seedDay(db, 6);
      const created = await rpc<{ number: number }>(db, users.dispatcherNorth, "create_task", {
        p_title: "Вечерний монтаж",
        p_description: "Работы до полуночи, без выхода на следующий день.",
        p_site_id: sites.park,
        p_crew_id: crews.lebedev,
        p_priority: "normal",
        p_planned_start: new Date(evening.start.getTime() + 20 * 3600 * 1000),
        p_planned_end: midnight.start,
        p_client_key: key(),
      });
      assert.ok((await numbersOnDay(db, users.dispatcherNorth, 5)).includes(created.number));
      assert.ok(!(await numbersOnDay(db, users.dispatcherNorth, 6)).includes(created.number));
    }));

  it("руководитель и бригадир не создают и не меняют задания", () =>
    inRollback(async (db) => {
      const current = await version(db, task(14));
      const calls: [string, Record<string, unknown>][] = [
        [
          "create_task",
          {
            p_title: "Попытка без прав",
            p_description: "Задание не должно появиться у бригады.",
            p_site_id: sites.park,
            p_crew_id: crews.petrov,
            p_priority: "normal",
            p_planned_start: new Date(Date.now() + 86_400_000),
            p_planned_end: new Date(Date.now() + 90_000_000),
          },
        ],
        [
          "update_task_details",
          {
            p_task_id: task(14),
            p_expected_version: current,
            p_title: "Новое название",
            p_description: "Новое описание задания для проверки прав.",
            p_priority: "high",
            p_address_snapshot: "г. Тверь, ул. Строителей, д. 14",
            p_access_note_snapshot: null,
          },
        ],
        [
          "reschedule_task",
          {
            p_task_id: task(14),
            p_expected_version: current,
            p_planned_start: new Date(Date.now() + 86_400_000),
            p_planned_end: new Date(Date.now() + 90_000_000),
            p_reason: "Проверка прав",
          },
        ],
        [
          "reassign_task",
          { p_task_id: task(14), p_expected_version: current, p_crew_id: crews.lebedev, p_reason: "Проверка прав" },
        ],
        ["cancel_task", { p_task_id: task(14), p_expected_version: current, p_reason: "Проверка прав" }],
      ];
      for (const user of [users.managerNorth, users.petrov]) {
        for (const [name, args] of calls) {
          await assert.rejects(
            rpc(db, user, name, { ...args, p_client_key: key() }),
            (error) => errorCode(error) === "MB403",
            `${name} ${user}`,
          );
        }
      }
      assert.equal(await version(db, task(14)), current);
    }));

  it("для сортировки списка есть индекс по подразделению, сроку и номеру", () =>
    inRollback(async (db) => {
      const { rows } = await db.query(
        "select indexdef from pg_indexes where schemaname = 'public' and indexname = 'tasks_division_end_number_idx'",
      );
      assert.match(rows[0]?.indexdef ?? "", /\(division_id, planned_end, number\)/);
    }));
});
