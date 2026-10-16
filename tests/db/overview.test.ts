import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { crews, errorCode, inRollback, rpc, select, sites, task, users, type Db } from "./helpers";

type Counters = {
  total: number;
  active: number;
  overdue: number;
  obstacles: number;
  review: number;
  statuses: Record<string, number>;
};

type Metrics = {
  accepted: number;
  on_time_original: number;
  on_time_current: number;
  avg_review_seconds: number | null;
};

type AcceptedRow = {
  number: number;
  report_version: number;
  on_time_original: boolean;
  on_time_current: boolean;
  review_seconds: number;
};

type QueueItem = { id: string; number: number; category?: string; reason?: string; report_version?: number };
type Queue = { overdue: QueueItem[]; obstacles: QueueItem[]; review: QueueItem[] };

type ScheduleRow = { id: string; number: number; status: string; overlapping: { number: number }[] };

const hour = 3600 * 1000;
const day = 24 * hour;

const counters = (db: Db, user: string) => rpc<Counters>(db, user, "division_counters", {});

const metrics = (db: Db, user: string, from: Date, to: Date) =>
  rpc<Metrics>(db, user, "division_metrics", { p_from: from.toISOString(), p_to: to.toISOString() });

const accepted = (db: Db, user: string, from: Date, to: Date) =>
  select<AcceptedRow>(db, user, "select * from public.division_accepted_tasks($1, $2)", [
    from.toISOString(),
    to.toISOString(),
  ]);

const schedule = (db: Db, user: string, from: Date, to: Date) =>
  select<ScheduleRow>(db, user, "select * from public.schedule_tasks($1, $2)", [from.toISOString(), to.toISOString()]);

const numbers = (rows: { number: number }[]) => rows.map((row) => row.number).sort((a, b) => a - b);

const overlapsOf = (rows: ScheduleRow[], number: number) =>
  numbers(rows.find((row) => row.number === number)?.overlapping ?? []);

async function seedDay(db: Db) {
  const { rows } = await db.query<{ start: Date }>(
    `select (date_trunc('day', planned_start at time zone 'Europe/Moscow') at time zone 'Europe/Moscow') as start
     from public.tasks where id = $1`,
    [task(1)],
  );
  return rows[0].start;
}

async function plannedInterval(db: Db, number: number) {
  const { rows } = await db.query<{ planned_start: Date; planned_end: Date }>(
    "select planned_start, planned_end from public.tasks where id = $1",
    [task(number)],
  );
  return rows[0];
}

async function moveTask(db: Db, number: number, start: Date, end: Date) {
  await db.query("update public.tasks set planned_start = $2, planned_end = $3 where id = $1", [
    task(number),
    start,
    end,
  ]);
}

type ReportFixture = { version: number; submitted: Date; decision: string; decided?: Date };

async function addTask(
  db: Db,
  number: number,
  fixture: { status: string; endOriginal: Date; end: Date; closedAt?: Date; reports: ReportFixture[] },
) {
  const id = randomUUID();
  const start = new Date(fixture.endOriginal.getTime() - 6 * hour);
  await db.query(
    `insert into public.tasks (
       id, company_id, division_id, number, title, description, site_id, crew_id, status, address_snapshot,
       planned_start_original, planned_end_original, planned_start, planned_end,
       completed_at, cancelled_at, cancelled_by, cancel_reason, created_by
     )
     select $1, s.company_id, s.division_id, $2, 'Проверка показателей', 'Задание для проверки показателей сроков',
       s.id, $3, $4::public.task_status, s.address, $5, $6, $5, $7,
       case when $4 = 'Completed' then $8::timestamptz end,
       case when $4 = 'Cancelled' then $8::timestamptz end,
       case when $4 = 'Cancelled' then $9::uuid end,
       case when $4 = 'Cancelled' then 'Отмена для проверки' end,
       $9
     from public.sites s where s.id = $10`,
    [
      id,
      number,
      crews.lebedev,
      fixture.status,
      start,
      fixture.endOriginal,
      fixture.end,
      fixture.closedAt ?? null,
      users.dispatcherNorth,
      sites.school,
    ],
  );
  for (const report of fixture.reports) {
    await db.query(
      `insert into public.task_reports (
         task_id, version, comment, submitted_by, submitted_at, decision, decided_by, decided_at, decision_note, client_key
       )
       values ($1, $2, 'Работы выполнены, фото приложены', $3, $4, $5::public.report_decision,
         case when $5 = 'pending' then null else $6::uuid end, $7,
         case when $5 in ('returned', 'cancelled') then 'Замечание для проверки' end, gen_random_uuid())`,
      [
        id,
        report.version,
        users.lebedev,
        report.submitted,
        report.decision,
        users.dispatcherNorth,
        report.decided ?? null,
      ],
    );
  }
  return id;
}

describe("счётчики обзора", () => {
  it("каждый видит только своё подразделение, руководитель — те же числа, что диспетчер", () =>
    inRollback(async (db) => {
      const north = await counters(db, users.dispatcherNorth);
      assert.equal(north.total, 16);
      assert.deepEqual(north.statuses, {
        Assigned: 7,
        Accepted: 2,
        InProgress: 3,
        InReview: 1,
        Completed: 2,
        Cancelled: 1,
      });
      assert.equal(north.active, 13);
      assert.equal(north.review, 1);
      assert.equal(north.obstacles, 1);
      assert.deepEqual(await counters(db, users.managerNorth), north);

      const south = await counters(db, users.managerSouth);
      assert.equal(south.total, 6);
      assert.equal(south.active, 4);
      assert.equal(south.review, 1);
      assert.equal(south.obstacles, 0);

      const petrov = await counters(db, users.petrov);
      assert.equal(petrov.total, 9);
      assert.equal(petrov.obstacles, 0);
    }));

  it("анонимный пользователь не вызывает функции обзора", () =>
    inRollback(async (db) => {
      await assert.rejects(counters(db, null as unknown as string), (error) => errorCode(error) === "42501");
      await assert.rejects(
        select(db, null, "select * from public.schedule_tasks(now(), now() + interval '1 day')"),
        (error) => errorCode(error) === "42501",
      );
    }));

  it("просрочка исполнения: срок прошёл и статус Assigned, Accepted или InProgress", () =>
    inRollback(async (db) => {
      const before = await counters(db, users.dispatcherNorth);
      const shift = (number: number, start: string, end: string) =>
        db.query(
          `update public.tasks set planned_start = now() + $2::interval, planned_end = now() + $3::interval where id = $1`,
          [task(number), start, end],
        );

      await shift(14, "-5 hours", "-1 hour");
      assert.equal((await counters(db, users.dispatcherNorth)).overdue, before.overdue + 1);

      await shift(14, "-5 hours", "0");
      assert.equal((await counters(db, users.dispatcherNorth)).overdue, before.overdue);

      await shift(5, "-1 day", "1 hour");
      assert.equal((await counters(db, users.dispatcherNorth)).overdue, before.overdue - 1);

      const queue = await rpc<Queue>(db, users.dispatcherNorth, "division_attention", { p_limit: 50 });
      const overdue = numbers(queue.overdue);
      assert.ok(!overdue.includes(6), "задание на проверке не считается просрочкой бригады");
      assert.ok(!overdue.includes(5));
      assert.equal(queue.overdue.length, before.overdue - 1);
    }));

  it("препятствия считаются только открытые", () =>
    inRollback(async (db) => {
      await db.query(
        "update public.task_obstacles set closed_at = now(), closed_by = $2, close_comment = 'Решено' where task_id = $1",
        [task(4), users.dispatcherNorth],
      );
      assert.equal((await counters(db, users.dispatcherNorth)).obstacles, 0);
    }));
});

describe("очередь внимания", () => {
  it("показывает просрочки, препятствия с причиной и ожидание проверки своего подразделения", () =>
    inRollback(async (db) => {
      const north = await rpc<Queue>(db, users.dispatcherNorth, "division_attention", { p_limit: 50 });
      assert.ok(numbers(north.overdue).includes(5));
      assert.deepEqual(numbers(north.obstacles), [4]);
      assert.equal(north.obstacles[0].category, "materials");
      assert.match(north.obstacles[0].reason ?? "", /краск/);
      assert.deepEqual(numbers(north.review), [6]);
      assert.equal(north.review[0].report_version, 1);

      const south = await rpc<Queue>(db, users.managerSouth, "division_attention", { p_limit: 50 });
      assert.deepEqual(numbers(south.review), [20]);
      assert.deepEqual(south.obstacles, []);
      assert.ok(numbers(south.overdue).every((number) => number >= 17));

      const short = await rpc<Queue>(db, users.dispatcherNorth, "division_attention", { p_limit: 1 });
      assert.equal(short.overdue.length, 1);
      assert.equal(short.overdue[0].number, north.overdue[0].number);
    }));
});

describe("доля принятых в срок", () => {
  it("на seed: MB-7 в срок, у MB-8 принятая версия 2 позже исходного, но в текущий срок", () =>
    inRollback(async (db) => {
      const { rows } = await db.query<{ now: Date }>("select now()");
      const to = rows[0].now;
      const from = new Date(to.getTime() - 30 * day);

      assert.deepEqual(await metrics(db, users.dispatcherNorth, from, to), {
        accepted: 2,
        on_time_original: 1,
        on_time_current: 2,
        avg_review_seconds: 8100,
      });
      assert.deepEqual(
        await metrics(db, users.managerNorth, from, to),
        await metrics(db, users.dispatcherNorth, from, to),
      );

      const tasks = await accepted(db, users.managerNorth, from, to);
      const byNumber = new Map(tasks.map((row) => [row.number, row]));
      assert.deepEqual(numbers(tasks), [7, 8]);
      assert.equal(byNumber.get(7)?.on_time_original, true);
      assert.equal(byNumber.get(7)?.on_time_current, true);
      assert.equal(byNumber.get(7)?.review_seconds, 9000);
      assert.equal(byNumber.get(8)?.report_version, 2);
      assert.equal(byNumber.get(8)?.on_time_original, false);
      assert.equal(byNumber.get(8)?.on_time_current, true);
      assert.equal(byNumber.get(8)?.review_seconds, 7200);

      const south = await accepted(db, users.managerSouth, from, to);
      assert.deepEqual(numbers(south), [21]);
      assert.equal((await metrics(db, users.dispatcherSouth, from, to)).accepted, 1);
    }));

  it("считается отправка принятой версии; возвращённые версии и отмены не входят", () =>
    inRollback(async (db) => {
      const base = new Date("2031-03-03T06:00:00Z");
      const at = (hours: number) => new Date(base.getTime() + hours * hour);

      await addTask(db, 9001, {
        status: "Completed",
        endOriginal: at(0),
        end: at(10),
        closedAt: at(13),
        reports: [
          { version: 1, submitted: at(-2), decision: "returned", decided: at(-1) },
          { version: 2, submitted: at(12), decision: "accepted", decided: at(13) },
        ],
      });
      await addTask(db, 9002, {
        status: "Completed",
        endOriginal: at(24),
        end: at(24),
        closedAt: at(24),
        reports: [{ version: 1, submitted: at(24), decision: "accepted", decided: at(24) }],
      });
      await addTask(db, 9003, {
        status: "Cancelled",
        endOriginal: at(30),
        end: at(30),
        closedAt: at(31),
        reports: [{ version: 1, submitted: at(20), decision: "cancelled", decided: at(31) }],
      });
      await addTask(db, 9004, {
        status: "Completed",
        endOriginal: at(300),
        end: at(300),
        closedAt: at(310),
        reports: [{ version: 1, submitted: at(290), decision: "accepted", decided: at(310) }],
      });

      const from = at(-48);
      const to = at(48);
      const tasks = await accepted(db, users.managerNorth, from, to);
      assert.deepEqual(numbers(tasks), [9001, 9002]);
      const late = tasks.find((row) => row.number === 9001);
      assert.equal(late?.report_version, 2);
      assert.equal(late?.on_time_original, false);
      assert.equal(late?.on_time_current, false);
      assert.equal(tasks.find((row) => row.number === 9002)?.on_time_original, true);

      assert.deepEqual(await metrics(db, users.managerNorth, from, to), {
        accepted: 2,
        on_time_original: 1,
        on_time_current: 1,
        avg_review_seconds: 1800,
      });
      assert.deepEqual(await metrics(db, users.managerSouth, from, to), {
        accepted: 0,
        on_time_original: 0,
        on_time_current: 0,
        avg_review_seconds: null,
      });
    }));
});

describe("расписание дня", () => {
  it("соседние интервалы не конфликтуют, пересечение MB-2 и MB-3 видно, ночное MB-13 попадает в оба дня", () =>
    inRollback(async (db) => {
      const start = await seedDay(db);
      const next = new Date(start.getTime() + day);
      const after = new Date(start.getTime() + 2 * day);

      const today = await schedule(db, users.dispatcherNorth, start, next);
      assert.deepEqual(numbers(today), [1, 2, 3, 4, 9, 13]);
      assert.deepEqual(overlapsOf(today, 1), []);
      assert.deepEqual(overlapsOf(today, 2), [3]);
      assert.deepEqual(overlapsOf(today, 3), [2]);
      assert.ok(overlapsOf(today, 13).includes(9));

      const tomorrow = await schedule(db, users.managerNorth, next, after);
      assert.deepEqual(numbers(tomorrow), [9, 12, 13, 16]);

      assert.deepEqual(numbers(await schedule(db, users.petrov, start, next)), [1, 2, 3]);
      assert.deepEqual(numbers(await schedule(db, users.lebedev, start, next)), [4, 9, 13]);
      assert.deepEqual(numbers(await schedule(db, users.dispatcherSouth, start, next)), [17, 18, 19]);
    }));

  it("пересечения через полночь находятся и для задания следующего дня", () =>
    inRollback(async (db) => {
      const start = await seedDay(db);
      const night = await plannedInterval(db, 13);
      await moveTask(
        db,
        15,
        new Date(night.planned_end.getTime() - hour),
        new Date(night.planned_end.getTime() + hour),
      );

      const today = await schedule(db, users.dispatcherNorth, start, new Date(start.getTime() + day));
      assert.ok(overlapsOf(today, 13).includes(15));
      assert.ok(!numbers(today).includes(15));

      const tomorrow = await schedule(
        db,
        users.dispatcherNorth,
        new Date(start.getTime() + day),
        new Date(start.getTime() + 2 * day),
      );
      assert.ok(overlapsOf(tomorrow, 15).includes(13));
    }));

  it("учитываются задания на проверке, но не завершённые и отменённые", () =>
    inRollback(async (db) => {
      const review = await plannedInterval(db, 6);
      await moveTask(
        db,
        14,
        new Date(review.planned_start.getTime() + hour),
        new Date(review.planned_end.getTime() - hour),
      );
      const completed = await plannedInterval(db, 8);
      await moveTask(
        db,
        16,
        new Date(completed.planned_start.getTime() + hour),
        new Date(completed.planned_start.getTime() + 3 * hour),
      );

      const around = await schedule(
        db,
        users.dispatcherNorth,
        new Date(review.planned_start.getTime() - 7 * day),
        new Date(review.planned_end.getTime() + day),
      );
      assert.deepEqual(overlapsOf(around, 14), [6]);
      assert.deepEqual(overlapsOf(around, 16), []);
      assert.deepEqual(overlapsOf(around, 8), []);
      assert.ok(!numbers(around).includes(10), "отменённые задания не попадают в расписание");
    }));
});
