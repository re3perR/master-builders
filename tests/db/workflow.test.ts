import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crews, errorCode, inRollback, key, rpc, select, sites, stagePhoto, task, users, version } from "./helpers";

type Result = {
  result: string;
  task_id: string;
  status: string;
  version: number;
  report_id?: string;
  overlaps?: { id: string }[];
};

const hour = 3600 * 1000;

async function createTask(
  db: Parameters<typeof rpc>[0],
  start: Date,
  end: Date,
  crew = crews.petrov,
  acknowledged: string[] = [],
) {
  return rpc<Result>(db, users.dispatcherNorth, "create_task", {
    p_title: "Тестовое задание",
    p_description: "Описание тестового задания для проверки",
    p_site_id: sites.park,
    p_crew_id: crew,
    p_priority: "normal",
    p_planned_start: start.toISOString(),
    p_planned_end: end.toISOString(),
    p_client_key: key(),
    p_acknowledged_overlaps: acknowledged,
  });
}

const farFuture = (offsetHours: number) => new Date(Date.UTC(2031, 0, 10, 6) + offsetHours * hour);

describe("основная цепочка", () => {
  it("задание проходит Assigned → Completed разными аккаунтами", () =>
    inRollback(async (db) => {
      const created = await createTask(db, farFuture(0), farFuture(4));
      assert.equal(created.result, "ok");
      assert.equal(created.status, "Assigned");

      const visible = await select(db, users.petrov, "select 1 from public.tasks where id = $1", [created.task_id]);
      assert.equal(visible.length, 1);
      const hidden = await select(db, users.lebedev, "select 1 from public.tasks where id = $1", [created.task_id]);
      assert.equal(hidden.length, 0);

      let state = await rpc<Result>(db, users.petrov, "accept_task", {
        p_task_id: created.task_id,
        p_expected_version: created.version,
        p_client_key: key(),
      });
      assert.equal(state.status, "Accepted");
      state = await rpc<Result>(db, users.petrov, "start_task", {
        p_task_id: created.task_id,
        p_expected_version: state.version,
        p_client_key: key(),
      });
      assert.equal(state.status, "InProgress");

      const photo = await stagePhoto(db, users.petrov, created.task_id);
      state = await rpc<Result>(db, users.petrov, "submit_report", {
        p_task_id: created.task_id,
        p_expected_version: state.version,
        p_comment: "Работы выполнены полностью",
        p_upload_ids: [photo],
        p_client_key: key(),
      });
      assert.equal(state.status, "InReview");

      state = await rpc<Result>(db, users.dispatcherNorth, "approve_report", {
        p_task_id: created.task_id,
        p_expected_version: state.version,
        p_report_id: state.report_id,
        p_client_key: key(),
      });
      assert.equal(state.status, "Completed");

      const events = await select<{ kind: string }>(
        db,
        users.managerNorth,
        "select kind from public.task_events where task_id = $1 order by id",
        [created.task_id],
      );
      assert.deepEqual(
        events.map((event) => event.kind),
        [
          "created",
          "status_changed",
          "status_changed",
          "report_submitted",
          "status_changed",
          "report_accepted",
          "status_changed",
        ],
      );

      await assert.rejects(
        rpc(db, users.petrov, "post_message", {
          p_task_id: created.task_id,
          p_body: "Ещё вопрос",
          p_client_key: key(),
        }),
        (error) => errorCode(error) === "MB423",
      );
    }));

  it("нельзя пропустить принятие и выполнить чужой переход", () =>
    inRollback(async (db) => {
      await assert.rejects(
        rpc(db, users.petrov, "start_task", { p_task_id: task(1), p_expected_version: 1, p_client_key: key() }),
        (error) => errorCode(error) === "MB423",
      );
      await assert.rejects(
        rpc(db, users.dispatcherNorth, "accept_task", {
          p_task_id: task(1),
          p_expected_version: 1,
          p_client_key: key(),
        }),
        (error) => errorCode(error) === "MB403",
      );
      await assert.rejects(
        rpc(db, users.lebedev, "accept_task", { p_task_id: task(1), p_expected_version: 1, p_client_key: key() }),
        (error) => errorCode(error) === "MB404",
      );
      await assert.rejects(
        rpc(db, users.dispatcherNorth, "cancel_task", {
          p_task_id: task(7),
          p_expected_version: await version(db, task(7)),
          p_reason: "Проверка",
          p_client_key: key(),
        }),
        (error) => errorCode(error) === "MB423",
      );
    }));
});

describe("проверка отчёта", () => {
  it("возврат требует замечания, повторная отправка создаёт версию 2", () =>
    inRollback(async (db) => {
      const report = (
        await select<{ id: string }>(
          db,
          users.dispatcherNorth,
          "select id from public.task_reports where task_id = $1 and decision = 'pending'",
          [task(6)],
        )
      )[0];
      await assert.rejects(
        rpc(db, users.dispatcherNorth, "return_report", {
          p_task_id: task(6),
          p_expected_version: await version(db, task(6)),
          p_report_id: report.id,
          p_note: "  ",
          p_client_key: key(),
        }),
        (error) => errorCode(error) === "MB422",
      );
      const returned = await rpc<Result>(db, users.dispatcherNorth, "return_report", {
        p_task_id: task(6),
        p_expected_version: await version(db, task(6)),
        p_report_id: report.id,
        p_note: "Нет фото крепления у лифтовой шахты",
        p_client_key: key(),
      });
      assert.equal(returned.status, "InProgress");

      const photo = await stagePhoto(db, users.petrov, task(6));
      const resubmitted = await rpc<Result & { report_version: number }>(db, users.petrov, "submit_report", {
        p_task_id: task(6),
        p_expected_version: returned.version,
        p_comment: "Добавил фото крепления у шахты",
        p_upload_ids: [photo],
        p_client_key: key(),
      });
      assert.equal(resubmitted.report_version, 2);
      const versions = await select<{ version: number; decision: string }>(
        db,
        users.petrov,
        "select version, decision from public.task_reports where task_id = $1 order by version",
        [task(6)],
      );
      assert.deepEqual(versions, [
        { version: 1, decision: "returned" },
        { version: 2, decision: "pending" },
      ]);
    }));

  it("отчёт без фото, с 11 фото или с чужим файлом не отправляется", () =>
    inRollback(async (db) => {
      const id = task(5);
      const submit = (uploads: string[], comment = "Пол заменён полностью") =>
        rpc(db, users.lebedev, "submit_report", {
          p_task_id: id,
          p_expected_version: 3,
          p_comment: comment,
          p_upload_ids: uploads,
          p_client_key: key(),
        });

      await assert.rejects(submit([]), (error) => errorCode(error) === "MB422");
      const eleven: string[] = [];
      for (let i = 0; i < 11; i += 1) eleven.push(await stagePhoto(db, users.lebedev, id));
      await assert.rejects(submit(eleven), (error) => errorCode(error) === "MB422");
      await assert.rejects(submit(eleven.slice(0, 2), "коротко"), (error) => errorCode(error) === "MB422");

      const otherTask = await stagePhoto(db, users.lebedev, task(4));
      await assert.rejects(submit([otherTask]), (error) => errorCode(error) === "MB422");

      const { rows } = await db.query(
        "insert into public.uploads (task_id, uploaded_by, storage_path, mime_type, size_bytes) values ($1, $2, 'x/foreign.jpg', 'image/jpeg', 100) returning id",
        [id, users.petrov],
      );
      await db.query("insert into storage.objects (bucket_id, name) values ('task-photos', 'x/foreign.jpg')");
      await assert.rejects(submit([rows[0].id]), (error) => errorCode(error) === "MB422");

      const notUploaded = await rpc<{ upload_id: string }>(db, users.lebedev, "register_upload", {
        p_task_id: id,
        p_mime_type: "image/png",
        p_size_bytes: 1000,
        p_width: 10,
        p_height: 10,
      });
      await assert.rejects(submit([notUploaded.upload_id]), (error) => errorCode(error) === "MB422");
      await assert.rejects(
        rpc(db, users.lebedev, "register_upload", {
          p_task_id: id,
          p_mime_type: "image/heic",
          p_size_bytes: 1000,
          p_width: 10,
          p_height: 10,
        }),
        (error) => errorCode(error) === "MB422",
      );
      await assert.rejects(
        rpc(db, users.lebedev, "register_upload", {
          p_task_id: id,
          p_mime_type: "image/jpeg",
          p_size_bytes: 10485761,
          p_width: 10,
          p_height: 10,
        }),
        (error) => errorCode(error) === "MB422",
      );

      const status = await select<{ status: string }>(
        db,
        users.lebedev,
        "select status from public.tasks where id = $1",
        [id],
      );
      assert.equal(status[0].status, "InProgress");
    }));

  it("повтор запроса не создаёт дублей отчёта и решения", () =>
    inRollback(async (db) => {
      const id = task(5);
      const photo = await stagePhoto(db, users.lebedev, id);
      const clientKey = key();
      const args = {
        p_task_id: id,
        p_expected_version: 3,
        p_comment: "Пол заменён полностью",
        p_upload_ids: [photo],
        p_client_key: clientKey,
      };
      const first = await rpc<Result>(db, users.lebedev, "submit_report", args);
      const second = await rpc<Result>(db, users.lebedev, "submit_report", args);
      assert.deepEqual(second, first);

      const decisionKey = key();
      const decision = {
        p_task_id: id,
        p_expected_version: first.version,
        p_report_id: first.report_id,
        p_client_key: decisionKey,
      };
      const approved = await rpc<Result>(db, users.dispatcherNorth, "approve_report", decision);
      assert.deepEqual(await rpc<Result>(db, users.dispatcherNorth, "approve_report", decision), approved);

      const counts = await select<{ reports: number; events: number }>(
        db,
        users.dispatcherNorth,
        `
        select (select count(*) from public.task_reports where task_id = $1)::int as reports,
               (select count(*) from public.task_events where task_id = $1 and kind = 'report_accepted')::int as events
      `,
        [id],
      );
      assert.deepEqual(counts[0], { reports: 1, events: 1 });

      await assert.rejects(
        rpc(db, users.dispatcherNorth, "return_report", {
          p_task_id: id,
          p_expected_version: approved.version,
          p_report_id: first.report_id,
          p_note: "Поздно",
          p_client_key: key(),
        }),
        (error) => errorCode(error) === "MB423",
      );
    }));

  it("повтор сообщения с тем же ключом не дублирует его", () =>
    inRollback(async (db) => {
      const clientKey = key();
      const args = { p_task_id: task(4), p_body: "Краска приехала", p_client_key: clientKey };
      await rpc(db, users.lebedev, "post_message", args);
      await rpc(db, users.lebedev, "post_message", args);
      const rows = await select(db, users.lebedev, "select 1 from public.task_messages where client_key = $1", [
        clientKey,
      ]);
      assert.equal(rows.length, 1);
    }));
});

describe("препятствия", () => {
  it("одно открытое препятствие блокирует отчёт, но не статус и срок", () =>
    inRollback(async (db) => {
      const id = task(4);
      const before = await select<{ status: string; planned_end: Date }>(
        db,
        users.lebedev,
        "select status, planned_end from public.tasks where id = $1",
        [id],
      );
      await assert.rejects(
        rpc(db, users.lebedev, "open_obstacle", {
          p_task_id: id,
          p_expected_version: await version(db, id),
          p_category: "other",
          p_reason: "Второе препятствие",
          p_client_key: key(),
        }),
        (error) => errorCode(error) === "MB423",
      );
      const photo = await stagePhoto(db, users.lebedev, id);
      await assert.rejects(
        rpc(db, users.lebedev, "submit_report", {
          p_task_id: id,
          p_expected_version: await version(db, id),
          p_comment: "Стены окрашены полностью",
          p_upload_ids: [photo],
          p_client_key: key(),
        }),
        (error) => errorCode(error) === "MB423",
      );
      await assert.rejects(
        rpc(db, users.lebedev, "close_obstacle", {
          p_task_id: id,
          p_expected_version: await version(db, id),
          p_comment: "",
          p_client_key: key(),
        }),
        (error) => errorCode(error) === "MB422",
      );
      await rpc(db, users.dispatcherNorth, "close_obstacle", {
        p_task_id: id,
        p_expected_version: await version(db, id),
        p_comment: "Краску привезли",
        p_client_key: key(),
      });
      const after = await select<{ status: string; planned_end: Date }>(
        db,
        users.lebedev,
        "select status, planned_end from public.tasks where id = $1",
        [id],
      );
      assert.deepEqual(after, before);
      const submitted = await rpc<Result>(db, users.lebedev, "submit_report", {
        p_task_id: id,
        p_expected_version: await version(db, id),
        p_comment: "Стены окрашены полностью",
        p_upload_ids: [photo],
        p_client_key: key(),
      });
      assert.equal(submitted.status, "InReview");
    }));
});

describe("переназначение и отмена", () => {
  it("переназначение из Accepted сбрасывает статус, после начала запрещено", () =>
    inRollback(async (db) => {
      const args = {
        p_task_id: task(3),
        p_expected_version: await version(db, task(3)),
        p_crew_id: crews.lebedev,
        p_reason: "Петров занят на кровле",
        p_client_key: key(),
      };
      const warning = await rpc<Result>(db, users.dispatcherNorth, "reassign_task", args);
      assert.equal(warning.result, "overlaps");
      const reassigned = await rpc<Result>(db, users.dispatcherNorth, "reassign_task", {
        ...args,
        p_acknowledged_overlaps: warning.overlaps?.map((item) => item.id),
      });
      assert.equal(reassigned.result, "ok");
      assert.equal(reassigned.status, "Assigned");
      const old = await select(db, users.petrov, "select 1 from public.tasks where id = $1", [task(3)]);
      assert.equal(old.length, 0);
      const history = await select(db, users.lebedev, "select 1 from public.task_events where task_id = $1", [task(3)]);
      assert.ok(history.length >= 3);

      await assert.rejects(
        rpc(db, users.dispatcherNorth, "reassign_task", {
          p_task_id: task(9),
          p_expected_version: await version(db, task(9)),
          p_crew_id: crews.petrov,
          p_reason: "Проверка",
          p_client_key: key(),
        }),
        (error) => errorCode(error) === "MB423",
      );
      await assert.rejects(
        rpc(db, users.dispatcherNorth, "reassign_task", {
          p_task_id: task(1),
          p_expected_version: 1,
          p_crew_id: crews.gusev,
          p_reason: "Проверка",
          p_client_key: key(),
        }),
        (error) => errorCode(error) === "MB422",
      );
    }));

  it("отмена закрывает препятствие и сохраняет ожидающий отчёт", () =>
    inRollback(async (db) => {
      await rpc(db, users.dispatcherNorth, "cancel_task", {
        p_task_id: task(4),
        p_expected_version: await version(db, task(4)),
        p_reason: "Заказчик остановил работы",
        p_client_key: key(),
      });
      const obstacle = await select<{ closed_by_system: boolean }>(
        db,
        users.lebedev,
        "select closed_by_system from public.task_obstacles where task_id = $1",
        [task(4)],
      );
      assert.equal(obstacle[0].closed_by_system, true);

      await rpc(db, users.dispatcherNorth, "cancel_task", {
        p_task_id: task(6),
        p_expected_version: await version(db, task(6)),
        p_reason: "Объект закрыт",
        p_client_key: key(),
      });
      const report = await select<{ decision: string }>(
        db,
        users.petrov,
        "select decision from public.task_reports where task_id = $1",
        [task(6)],
      );
      assert.deepEqual(report, [{ decision: "cancelled" }]);
      const photos = await select(db, users.petrov, "select 1 from public.uploads where task_id = $1", [task(6)]);
      assert.equal(photos.length, 3);

      const followUp = await rpc<Result>(db, users.dispatcherNorth, "create_task", {
        p_title: "Ограждение кровли, повторно",
        p_description: "Повторить монтаж ограждения после открытия объекта",
        p_site_id: sites.park,
        p_crew_id: crews.petrov,
        p_priority: "high",
        p_planned_start: farFuture(0).toISOString(),
        p_planned_end: farFuture(8).toISOString(),
        p_client_key: key(),
        p_source_task_id: task(6),
      });
      assert.equal(followUp.result, "ok");
    }));
});

describe("сроки и пересечения", () => {
  it("начало должно быть раньше окончания", () =>
    inRollback(async (db) => {
      await assert.rejects(createTask(db, farFuture(2), farFuture(2)), (error) => errorCode(error) === "MB422");
      await assert.rejects(createTask(db, farFuture(3), farFuture(2)), (error) => errorCode(error) === "MB422");
    }));

  it("пересечение предупреждает, соседние интервалы не конфликтуют", () =>
    inRollback(async (db) => {
      const first = await createTask(db, farFuture(0), farFuture(6));
      const adjacent = await createTask(db, farFuture(6), farFuture(8));
      assert.equal(adjacent.result, "ok");

      const overlapping = await createTask(db, farFuture(5), farFuture(7));
      assert.equal(overlapping.result, "overlaps");
      assert.deepEqual(overlapping.overlaps?.map((item) => item.id).sort(), [first.task_id, adjacent.task_id].sort());

      const partial = await createTask(db, farFuture(5), farFuture(7), crews.petrov, [first.task_id]);
      assert.equal(partial.result, "overlaps");

      const confirmed = await createTask(db, farFuture(5), farFuture(7), crews.petrov, [
        first.task_id,
        adjacent.task_id,
      ]);
      assert.equal(confirmed.result, "ok");

      const night = await createTask(db, farFuture(16), farFuture(22), crews.lebedev);
      assert.equal(night.result, "ok");
      const morning = await createTask(db, farFuture(20), farFuture(26), crews.lebedev);
      assert.equal(morning.result, "overlaps");
    }));

  it("перенос сохраняет исходный срок и причину", () =>
    inRollback(async (db) => {
      const before = await select<{ planned_end_original: Date }>(
        db,
        users.dispatcherNorth,
        "select planned_end_original from public.tasks where id = $1",
        [task(14)],
      );
      await assert.rejects(
        rpc(db, users.dispatcherNorth, "reschedule_task", {
          p_task_id: task(14),
          p_expected_version: 1,
          p_planned_start: farFuture(0).toISOString(),
          p_planned_end: farFuture(4).toISOString(),
          p_reason: "",
          p_client_key: key(),
        }),
        (error) => errorCode(error) === "MB422",
      );
      const moved = await rpc<Result>(db, users.dispatcherNorth, "reschedule_task", {
        p_task_id: task(14),
        p_expected_version: 1,
        p_planned_start: farFuture(0).toISOString(),
        p_planned_end: farFuture(4).toISOString(),
        p_reason: "Заказчик попросил перенести",
        p_client_key: key(),
      });
      assert.equal(moved.result, "ok");
      const after = await select<{ planned_end_original: Date; planned_end: Date }>(
        db,
        users.dispatcherNorth,
        "select planned_end_original, planned_end from public.tasks where id = $1",
        [task(14)],
      );
      assert.deepEqual(after[0].planned_end_original, before[0].planned_end_original);
      assert.deepEqual(after[0].planned_end, farFuture(4));
      const event = await select<{ data: { reason: string } }>(
        db,
        users.petrov,
        "select data from public.task_events where task_id = $1 and kind = 'rescheduled'",
        [task(14)],
      );
      assert.equal(event[0].data.reason, "Заказчик попросил перенести");
    }));
});

describe("конкурентные изменения", () => {
  it("устаревшая версия отклоняется и не перезаписывает данные", () =>
    inRollback(async (db) => {
      const current = await version(db, task(2));
      await rpc(db, users.dispatcherNorth, "update_task_details", {
        p_task_id: task(2),
        p_expected_version: current,
        p_title: "Установка решёток и диффузоров, 5 этаж",
        p_description: "Установить решётки и диффузоры в квартирах 5-го этажа после монтажа коробов.",
        p_priority: "normal",
        p_address_snapshot: "г. Тверь, ул. Строителей, д. 14, корп. 2",
        p_access_note_snapshot: null,
        p_client_key: key(),
      });
      await assert.rejects(
        rpc(db, users.petrov, "accept_task", { p_task_id: task(2), p_expected_version: current, p_client_key: key() }),
        (error) => errorCode(error) === "MB409",
      );
      const row = await select<{ title: string; status: string }>(
        db,
        users.petrov,
        "select title, status from public.tasks where id = $1",
        [task(2)],
      );
      assert.deepEqual(row[0], { title: "Установка решёток и диффузоров, 5 этаж", status: "Assigned" });
    }));
});
