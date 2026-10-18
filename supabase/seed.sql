create or replace function pg_temp.sid(p_key text) returns uuid
language sql immutable
as $$ select md5('master-builders:' || p_key)::uuid $$;

create or replace function pg_temp.at(p_day integer, p_hour integer, p_minute integer default 0) returns timestamptz
language sql stable
as $$
  select ((date_trunc('day', now() at time zone 'Europe/Moscow') + make_interval(days => p_day, hours => p_hour, mins => p_minute))
    at time zone 'Europe/Moscow')
$$;

create or replace function pg_temp.add_user(p_key text, p_email text, p_name text, p_division text, p_role public.user_role)
returns void
language plpgsql
as $$
declare
  v_id uuid := pg_temp.sid('user:' || p_key);
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('demo-pass-2026', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', p_name), now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true), 'email', now(), now(), now());

  insert into public.profiles (id, company_id, division_id, role, full_name)
  values (v_id, pg_temp.sid('company'), pg_temp.sid('division:' || p_division), p_role, p_name);
end;
$$;

create or replace function pg_temp.add_task(
  p_number integer,
  p_division text,
  p_site text,
  p_crew text,
  p_title text,
  p_description text,
  p_priority public.task_priority,
  p_start timestamptz,
  p_end timestamptz,
  p_author text
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := pg_temp.sid('task:' || p_number);
  v_site public.sites;
  v_crew public.crews;
  v_created timestamptz := least(p_start - interval '2 days', now() - interval '1 hour');
begin
  select * into v_site from public.sites where id = pg_temp.sid('site:' || p_site);
  select * into v_crew from public.crews where id = pg_temp.sid('crew:' || p_crew);

  insert into public.tasks (
    id, company_id, division_id, number, title, description, site_id, crew_id, priority,
    address_snapshot, access_note_snapshot,
    planned_start_original, planned_end_original, planned_start, planned_end,
    created_by, created_at, updated_at
  )
  values (
    v_id, pg_temp.sid('company'), pg_temp.sid('division:' || p_division), p_number, p_title, p_description,
    v_site.id, v_crew.id, p_priority,
    v_site.address, v_site.access_note,
    p_start, p_end, p_start, p_end,
    pg_temp.sid('user:' || p_author), v_created, v_created
  );

  insert into public.task_events (task_id, actor_id, actor_role, kind, data, created_at)
  values (v_id, pg_temp.sid('user:' || p_author), 'dispatcher', 'created', jsonb_build_object(
    'title', p_title,
    'site_id', v_site.id,
    'site_name', v_site.name,
    'crew_id', v_crew.id,
    'crew_name', v_crew.name,
    'priority', p_priority,
    'planned_start', p_start,
    'planned_end', p_end
  ), v_created);

  return v_id;
end;
$$;

create or replace function pg_temp.event(p_number integer, p_actor text, p_kind text, p_data jsonb, p_at timestamptz)
returns void
language sql
as $$
  insert into public.task_events (task_id, actor_id, actor_role, kind, data, created_at)
  select pg_temp.sid('task:' || p_number), p.id, p.role, p_kind, p_data, p_at
  from public.profiles p where p.id = pg_temp.sid('user:' || p_actor)
$$;

create or replace function pg_temp.move(p_number integer, p_status public.task_status, p_actor text, p_at timestamptz)
returns void
language plpgsql
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = pg_temp.sid('task:' || p_number);
  update public.tasks
  set status = p_status,
      accepted_at = case when p_status = 'Accepted' then p_at else accepted_at end,
      started_at = case when p_status = 'InProgress' then coalesce(started_at, p_at) else started_at end,
      submitted_at = case when p_status = 'InReview' then p_at else submitted_at end,
      completed_at = case when p_status = 'Completed' then p_at else completed_at end,
      version = version + 1,
      updated_at = p_at
  where id = v_task.id;
  perform pg_temp.event(p_number, p_actor, 'status_changed', jsonb_build_object('old', v_task.status, 'new', p_status), p_at);
end;
$$;

create or replace function pg_temp.report(
  p_number integer,
  p_version integer,
  p_actor text,
  p_comment text,
  p_photos integer,
  p_at timestamptz
)
returns uuid
language plpgsql
as $$
declare
  v_task public.tasks;
  v_report uuid := pg_temp.sid('report:' || p_number || ':' || p_version);
  v_upload uuid;
begin
  select * into v_task from public.tasks where id = pg_temp.sid('task:' || p_number);
  insert into public.task_reports (id, task_id, version, comment, submitted_by, submitted_at, client_key)
  values (v_report, v_task.id, p_version, p_comment, pg_temp.sid('user:' || p_actor), p_at, gen_random_uuid());

  for i in 1..p_photos loop
    v_upload := pg_temp.sid('upload:' || p_number || ':' || p_version || ':' || i);
    insert into public.uploads (id, task_id, uploaded_by, storage_path, mime_type, size_bytes, width, height, report_id, position, created_at)
    values (
      v_upload, v_task.id, pg_temp.sid('user:' || p_actor),
      v_task.company_id || '/' || v_task.id || '/' || v_upload || '.jpg',
      'image/jpeg', 180000, 1600, 1200, v_report, i, p_at - interval '5 minutes'
    );
  end loop;

  perform pg_temp.event(p_number, p_actor, 'report_submitted', jsonb_build_object('report_id', v_report, 'version', p_version, 'photos', p_photos), p_at);
  perform pg_temp.move(p_number, 'InReview', p_actor, p_at);
  return v_report;
end;
$$;

create or replace function pg_temp.decide(
  p_number integer,
  p_version integer,
  p_actor text,
  p_decision public.report_decision,
  p_note text,
  p_at timestamptz
)
returns void
language plpgsql
as $$
declare
  v_report public.task_reports;
begin
  select * into v_report from public.task_reports where id = pg_temp.sid('report:' || p_number || ':' || p_version);
  update public.task_reports
  set decision = p_decision, decided_by = pg_temp.sid('user:' || p_actor), decided_at = p_at, decision_note = p_note
  where id = v_report.id;

  if p_decision = 'accepted' then
    perform pg_temp.event(p_number, p_actor, 'report_accepted', jsonb_build_object('report_id', v_report.id, 'version', p_version, 'submitted_at', v_report.submitted_at), p_at);
    perform pg_temp.move(p_number, 'Completed', p_actor, p_at);
  else
    perform pg_temp.event(p_number, p_actor, 'report_returned', jsonb_build_object('report_id', v_report.id, 'version', p_version, 'note', p_note), p_at);
    perform pg_temp.move(p_number, 'InProgress', p_actor, p_at);
  end if;
end;
$$;

create or replace function pg_temp.obstacle(
  p_number integer,
  p_actor text,
  p_category public.obstacle_category,
  p_reason text,
  p_opened timestamptz,
  p_closer text default null,
  p_comment text default null,
  p_closed timestamptz default null
)
returns void
language plpgsql
as $$
declare
  v_id uuid := pg_temp.sid('obstacle:' || p_number || ':' || p_opened);
begin
  insert into public.task_obstacles (id, task_id, category, reason, opened_by, opened_at, closed_by, closed_at, close_comment)
  values (
    v_id, pg_temp.sid('task:' || p_number), p_category, p_reason, pg_temp.sid('user:' || p_actor), p_opened,
    case when p_closer is not null then pg_temp.sid('user:' || p_closer) end, p_closed, p_comment
  );
  perform pg_temp.event(p_number, p_actor, 'obstacle_opened', jsonb_build_object('obstacle_id', v_id, 'category', p_category, 'reason', p_reason), p_opened);
  if p_closer is not null then
    perform pg_temp.event(p_number, p_closer, 'obstacle_closed', jsonb_build_object(
      'obstacle_id', v_id,
      'category', p_category,
      'comment', p_comment,
      'duration_seconds', extract(epoch from p_closed - p_opened)::bigint,
      'system', false
    ), p_closed);
  end if;
  update public.tasks set version = version + case when p_closer is null then 1 else 2 end where id = pg_temp.sid('task:' || p_number);
end;
$$;

create or replace function pg_temp.message(p_number integer, p_actor text, p_body text, p_at timestamptz)
returns void
language sql
as $$
  insert into public.task_messages (task_id, author_id, author_role, body, client_key, created_at)
  select pg_temp.sid('task:' || p_number), p.id, p.role, p_body, gen_random_uuid(), p_at
  from public.profiles p where p.id = pg_temp.sid('user:' || p_actor)
$$;

insert into public.companies (id, name, timezone)
values (pg_temp.sid('company'), 'ООО «СеверСтройМонтаж»', 'Europe/Moscow');

insert into public.divisions (id, company_id, name) values
  (pg_temp.sid('division:north'), pg_temp.sid('company'), 'Монтажный участок «Север»'),
  (pg_temp.sid('division:south'), pg_temp.sid('company'), 'Ремонтный участок «Юг»');

select pg_temp.add_user('dispatcher.north', 'dispatcher.north@demo.local', 'Ольга Смирнова', 'north', 'dispatcher');
select pg_temp.add_user('manager.north', 'manager.north@demo.local', 'Андрей Ковалёв', 'north', 'manager');
select pg_temp.add_user('foreman.petrov', 'foreman.petrov@demo.local', 'Игорь Петров', 'north', 'foreman');
select pg_temp.add_user('foreman.lebedev', 'foreman.lebedev@demo.local', 'Сергей Лебедев', 'north', 'foreman');
select pg_temp.add_user('dispatcher.south', 'dispatcher.south@demo.local', 'Марина Егорова', 'south', 'dispatcher');
select pg_temp.add_user('manager.south', 'manager.south@demo.local', 'Виктор Орлов', 'south', 'manager');
select pg_temp.add_user('foreman.gusev', 'foreman.gusev@demo.local', 'Павел Гусев', 'south', 'foreman');

insert into public.crews (id, company_id, division_id, name, foreman_id) values
  (pg_temp.sid('crew:petrov'), pg_temp.sid('company'), pg_temp.sid('division:north'), 'Бригада монтажа №1', pg_temp.sid('user:foreman.petrov')),
  (pg_temp.sid('crew:lebedev'), pg_temp.sid('company'), pg_temp.sid('division:north'), 'Бригада отделки №2', pg_temp.sid('user:foreman.lebedev')),
  (pg_temp.sid('crew:gusev'), pg_temp.sid('company'), pg_temp.sid('division:south'), 'Ремонтная бригада №3', pg_temp.sid('user:foreman.gusev'));

insert into public.crew_members (crew_id, name, position) values
  (pg_temp.sid('crew:petrov'), 'Монтажник 1 — А. Волков', 1),
  (pg_temp.sid('crew:petrov'), 'Монтажник 2 — Д. Зайцев', 2),
  (pg_temp.sid('crew:petrov'), 'Сварщик — Р. Ахмедов', 3),
  (pg_temp.sid('crew:lebedev'), 'Отделочник — Н. Белова', 1),
  (pg_temp.sid('crew:lebedev'), 'Отделочник — К. Морозов', 2),
  (pg_temp.sid('crew:gusev'), 'Электрик — Е. Соколов', 1),
  (pg_temp.sid('crew:gusev'), 'Разнорабочий — Т. Кузнецов', 2),
  (pg_temp.sid('crew:gusev'), 'Сантехник — Л. Фёдоров', 3);

insert into public.sites (id, company_id, division_id, name, address, access_note, contact, created_by) values
  (pg_temp.sid('site:park'), pg_temp.sid('company'), pg_temp.sid('division:north'),
   'ЖК «Северный парк», корпус 2', 'г. Тверь, ул. Строителей, д. 14, корп. 2',
   'Въезд через КПП со стороны ул. Строителей, пропуск заказывать за сутки у охраны.', 'Прораб заказчика, +7 900 000-00-01',
   pg_temp.sid('user:dispatcher.north')),
  (pg_temp.sid('site:warehouse'), pg_temp.sid('company'), pg_temp.sid('division:north'),
   'Складской комплекс «Восток»', 'г. Тверь, Промышленный проезд, д. 7, стр. 3',
   'Работы только в будни с 8:00 до 20:00, обязательны каски и жилеты.', null,
   pg_temp.sid('user:dispatcher.north')),
  (pg_temp.sid('site:school'), pg_temp.sid('company'), pg_temp.sid('division:north'),
   'Школа №12, спортзал', 'г. Тверь, пр-т Победы, д. 41',
   'Ключи у завхоза, шумные работы после 15:00.', 'Завхоз, +7 900 000-00-02',
   pg_temp.sid('user:dispatcher.north')),
  (pg_temp.sid('site:office'), pg_temp.sid('company'), pg_temp.sid('division:south'),
   'Бизнес-центр «Меридиан», 3 этаж', 'г. Тверь, ул. Южная, д. 3',
   'Грузовой лифт по заявке у администратора.', 'Администратор БЦ, +7 900 000-00-03',
   pg_temp.sid('user:dispatcher.south')),
  (pg_temp.sid('site:cafe'), pg_temp.sid('company'), pg_temp.sid('division:south'),
   'Кафе «Липа»', 'г. Тверь, наб. Волги, д. 18',
   'Заходить через служебный вход со двора.', null,
   pg_temp.sid('user:dispatcher.south'));

select pg_temp.add_task(1, 'north', 'park', 'petrov', 'Монтаж вентиляционных коробов, 5 этаж',
  'Смонтировать прямые участки воздуховодов по осям 3–7 согласно листу ОВ-12. Крепёж на складе объекта.',
  'high', pg_temp.at(0, 9), pg_temp.at(0, 12), 'dispatcher.north');
select pg_temp.add_task(2, 'north', 'park', 'petrov', 'Установка решёток и диффузоров',
  'Установить решётки и диффузоры в квартирах 5-го этажа после монтажа коробов.',
  'normal', pg_temp.at(0, 12), pg_temp.at(0, 15), 'dispatcher.north');
select pg_temp.add_task(3, 'north', 'warehouse', 'petrov', 'Проверка креплений кабельных лотков',
  'Осмотреть и подтянуть крепления кабельных лотков в зоне хранения Б, составить список замечаний.',
  'normal', pg_temp.at(0, 14), pg_temp.at(0, 17), 'dispatcher.north');
select pg_temp.add_task(4, 'north', 'school', 'lebedev', 'Окраска стен спортзала',
  'Огрунтовать и окрасить стены спортзала в два слоя, цвет по согласованной выкраске.',
  'normal', pg_temp.at(-1, 9), pg_temp.at(0, 18), 'dispatcher.north');
select pg_temp.add_task(5, 'north', 'warehouse', 'lebedev', 'Ремонт пола в бытовке',
  'Заменить повреждённое покрытие пола в бытовке персонала, площадь около 12 м².',
  'high', pg_temp.at(-2, 9), pg_temp.at(-1, 17), 'dispatcher.north');
select pg_temp.add_task(6, 'north', 'park', 'petrov', 'Монтаж ограждения кровли',
  'Смонтировать временное ограждение по периметру кровли секции 1.',
  'high', pg_temp.at(-2, 8), pg_temp.at(-1, 16), 'dispatcher.north');
select pg_temp.add_task(7, 'north', 'school', 'lebedev', 'Замена светильников в раздевалках',
  'Заменить 14 светильников в мужской и женской раздевалке на светодиодные панели.',
  'normal', pg_temp.at(-5, 9), pg_temp.at(-4, 18), 'dispatcher.north');
select pg_temp.add_task(8, 'north', 'warehouse', 'petrov', 'Монтаж противопожарных дверей',
  'Установить две противопожарные двери в лестничной клетке склада, проверить доводчики.',
  'high', pg_temp.at(-6, 9), pg_temp.at(-5, 17), 'dispatcher.north');
select pg_temp.add_task(9, 'north', 'park', 'lebedev', 'Шпаклёвка откосов, секция 2',
  'Выполнить шпаклёвку оконных откосов в квартирах 2-й секции, этажи 3–4.',
  'normal', pg_temp.at(-3, 9), pg_temp.at(1, 18), 'dispatcher.north');
select pg_temp.add_task(10, 'north', 'school', 'petrov', 'Демонтаж старой разводки',
  'Демонтировать старую электрическую разводку в подсобных помещениях спортзала.',
  'low', pg_temp.at(-1, 10), pg_temp.at(-1, 16), 'dispatcher.north');
select pg_temp.add_task(11, 'north', 'school', 'petrov', 'Демонтаж старой разводки (повторно)',
  'Демонтировать старую электрическую разводку в подсобных помещениях после согласования доступа.',
  'normal', pg_temp.at(2, 10), pg_temp.at(2, 16), 'dispatcher.north');
select pg_temp.add_task(12, 'north', 'warehouse', 'lebedev', 'Герметизация швов фасадных панелей',
  'Загерметизировать вертикальные швы фасадных панелей по оси А, около 40 погонных метров.',
  'normal', pg_temp.at(0, 9), pg_temp.at(0, 17), 'dispatcher.north');
select pg_temp.add_task(13, 'north', 'warehouse', 'lebedev', 'Ночная замена светильников над стеллажами',
  'Заменить светильники над стеллажами зоны А в ночное окно, пока склад не работает.',
  'normal', pg_temp.at(0, 22), pg_temp.at(1, 2), 'dispatcher.north');
select pg_temp.add_task(14, 'north', 'park', 'petrov', 'Пусконаладка вентиляции, секция 1',
  'Провести пусконаладку приточной установки секции 1, заполнить протокол измерений.',
  'normal', pg_temp.at(3, 9), pg_temp.at(3, 15), 'dispatcher.north');
select pg_temp.add_task(15, 'north', 'school', 'lebedev', 'Установка защитных сеток на окна',
  'Установить защитные сетки на окна спортзала, 8 проёмов.',
  'low', pg_temp.at(4, 10), pg_temp.at(4, 14), 'dispatcher.north');
select pg_temp.add_task(16, 'north', 'park', 'petrov', 'Монтаж кронштейнов наружных блоков',
  'Смонтировать кронштейны под наружные блоки кондиционеров на фасаде, 6 точек.',
  'normal', pg_temp.at(1, 13), pg_temp.at(1, 17), 'dispatcher.north');

select pg_temp.add_task(17, 'south', 'office', 'gusev', 'Перенос розеток в переговорной',
  'Перенести четыре розетки в переговорной согласно новой планировке, восстановить отделку.',
  'normal', pg_temp.at(0, 10), pg_temp.at(0, 14), 'dispatcher.south');
select pg_temp.add_task(18, 'south', 'cafe', 'gusev', 'Замена смесителей на кухне',
  'Заменить два смесителя на кухне кафе, проверить отсутствие протечек.',
  'high', pg_temp.at(0, 15), pg_temp.at(0, 18), 'dispatcher.south');
select pg_temp.add_task(19, 'south', 'office', 'gusev', 'Ремонт подвесного потолка',
  'Заменить 12 повреждённых плит подвесного потолка в коридоре третьего этажа.',
  'normal', pg_temp.at(-1, 9), pg_temp.at(0, 19), 'dispatcher.south');
select pg_temp.add_task(20, 'south', 'cafe', 'gusev', 'Покраска фасадной вывески',
  'Очистить и покрасить металлическое основание вывески, цвет RAL 7016.',
  'low', pg_temp.at(-3, 10), pg_temp.at(-2, 16), 'dispatcher.south');
select pg_temp.add_task(21, 'south', 'office', 'gusev', 'Монтаж перегородки в open space',
  'Смонтировать гипсокартонную перегородку длиной 6 м с дверным проёмом.',
  'high', pg_temp.at(-7, 9), pg_temp.at(-6, 18), 'dispatcher.south');
select pg_temp.add_task(22, 'south', 'cafe', 'gusev', 'Чистка вытяжки',
  'Очистить вытяжной зонт и воздуховод кухни.',
  'normal', pg_temp.at(-1, 8), pg_temp.at(-1, 12), 'dispatcher.south');

update public.companies set next_task_number = 23 where id = pg_temp.sid('company');

select pg_temp.move(3, 'Accepted', 'foreman.petrov', pg_temp.at(-1, 18));

select pg_temp.move(4, 'Accepted', 'foreman.lebedev', pg_temp.at(-1, 8, 30));
select pg_temp.move(4, 'InProgress', 'foreman.lebedev', pg_temp.at(-1, 9, 10));
select pg_temp.obstacle(4, 'foreman.lebedev', 'materials', 'Не привезли краску нужного оттенка, на объекте только грунт.', now() - interval '3 hours');
select pg_temp.message(4, 'foreman.lebedev', 'Грунт нанесли, ждём краску. Без неё дальше не идём.', now() - interval '170 minutes');
select pg_temp.message(4, 'dispatcher.north', 'Поставщик обещает привезти до 15:00, держу в курсе.', now() - interval '150 minutes');

select pg_temp.move(5, 'Accepted', 'foreman.lebedev', pg_temp.at(-2, 8));
select pg_temp.move(5, 'InProgress', 'foreman.lebedev', pg_temp.at(-2, 9, 15));

select pg_temp.move(6, 'Accepted', 'foreman.petrov', pg_temp.at(-3, 17));
select pg_temp.move(6, 'InProgress', 'foreman.petrov', pg_temp.at(-2, 8, 20));
select pg_temp.report(6, 1, 'foreman.petrov', 'Ограждение смонтировано по всему периметру секции 1, стойки закреплены анкерами.', 3, now() - interval '2 hours');

select pg_temp.move(7, 'Accepted', 'foreman.lebedev', pg_temp.at(-6, 16));
select pg_temp.move(7, 'InProgress', 'foreman.lebedev', pg_temp.at(-5, 9));
select pg_temp.obstacle(7, 'foreman.lebedev', 'access', 'Раздевалки закрыты, завхоз на совещании.', pg_temp.at(-5, 9, 20),
  'dispatcher.north', 'Связались с директором школы, ключи выдали.', pg_temp.at(-5, 10, 30));
select pg_temp.report(7, 1, 'foreman.lebedev', 'Заменены все 14 светильников, проверена работа, мусор вывезен.', 2, pg_temp.at(-4, 16));
select pg_temp.decide(7, 1, 'dispatcher.north', 'accepted', null, pg_temp.at(-4, 18, 30));

select pg_temp.move(8, 'Accepted', 'foreman.petrov', pg_temp.at(-7, 15));
select pg_temp.move(8, 'InProgress', 'foreman.petrov', pg_temp.at(-6, 9));
select pg_temp.report(8, 1, 'foreman.petrov', 'Двери установлены, доводчики отрегулированы.', 2, pg_temp.at(-5, 15));
select pg_temp.decide(8, 1, 'dispatcher.north', 'returned', 'На второй двери не работает доводчик, нет фото маркировки дверей.', pg_temp.at(-5, 17));
update public.tasks set planned_end = pg_temp.at(-4, 17), version = version + 1 where id = pg_temp.sid('task:8');
select pg_temp.event(8, 'dispatcher.north', 'rescheduled', jsonb_build_object(
  'reason', 'Доработка по замечаниям, заказчик согласовал перенос на сутки.',
  'old', jsonb_build_object('planned_start', pg_temp.at(-6, 9), 'planned_end', pg_temp.at(-5, 17)),
  'new', jsonb_build_object('planned_start', pg_temp.at(-6, 9), 'planned_end', pg_temp.at(-4, 17))
), pg_temp.at(-5, 17, 10));
select pg_temp.report(8, 2, 'foreman.petrov', 'Доводчик второй двери заменён, добавлены фото маркировки обеих дверей.', 3, pg_temp.at(-4, 12));
select pg_temp.decide(8, 2, 'dispatcher.north', 'accepted', null, pg_temp.at(-4, 14));

select pg_temp.move(9, 'Accepted', 'foreman.lebedev', pg_temp.at(-4, 18));
select pg_temp.move(9, 'InProgress', 'foreman.lebedev', pg_temp.at(-3, 9));
select pg_temp.report(9, 1, 'foreman.lebedev', 'Откосы на 3 этаже готовы, на 4 этаже выполнено черновое выравнивание.', 2, pg_temp.at(-1, 17));
select pg_temp.decide(9, 1, 'dispatcher.north', 'returned', 'Отчёт преждевременный: 4 этаж не закончен. Доделайте и пришлите фото по каждой квартире.', pg_temp.at(-1, 18));
select pg_temp.message(9, 'foreman.lebedev', 'Принял, завтра закрываем 4 этаж.', pg_temp.at(-1, 18, 20));

update public.tasks
set status = 'Cancelled', cancelled_at = pg_temp.at(-1, 9, 30), cancelled_by = pg_temp.sid('user:dispatcher.north'),
    cancel_reason = 'Школа не предоставила доступ в подсобные помещения, работы перенесены.', version = version + 1
where id = pg_temp.sid('task:10');
select pg_temp.event(10, 'dispatcher.north', 'cancelled', jsonb_build_object(
  'reason', 'Школа не предоставила доступ в подсобные помещения, работы перенесены.',
  'old_status', 'Assigned'
), pg_temp.at(-1, 9, 30));
update public.tasks set source_task_id = pg_temp.sid('task:10') where id = pg_temp.sid('task:11');

select pg_temp.move(12, 'Accepted', 'foreman.lebedev', now() - interval '5 hours');
update public.tasks set planned_start = pg_temp.at(1, 9), planned_end = pg_temp.at(1, 17),
  terms_changed_at = now() - interval '4 hours', version = version + 1
where id = pg_temp.sid('task:12');
select pg_temp.event(12, 'dispatcher.north', 'rescheduled', jsonb_build_object(
  'reason', 'Дождь по прогнозу на весь день, герметик нельзя наносить на мокрые швы.',
  'old', jsonb_build_object('planned_start', pg_temp.at(0, 9), 'planned_end', pg_temp.at(0, 17)),
  'new', jsonb_build_object('planned_start', pg_temp.at(1, 9), 'planned_end', pg_temp.at(1, 17))
), now() - interval '4 hours');

select pg_temp.move(18, 'Accepted', 'foreman.gusev', now() - interval '6 hours');

select pg_temp.move(19, 'Accepted', 'foreman.gusev', pg_temp.at(-2, 17));
select pg_temp.move(19, 'InProgress', 'foreman.gusev', pg_temp.at(-1, 9, 5));
select pg_temp.obstacle(19, 'foreman.gusev', 'equipment', 'Сломалась стремянка, нужна вышка-тура.', pg_temp.at(-1, 11),
  'foreman.gusev', 'Привезли туру со склада, продолжаем.', pg_temp.at(-1, 14));

select pg_temp.move(20, 'Accepted', 'foreman.gusev', pg_temp.at(-4, 12));
select pg_temp.move(20, 'InProgress', 'foreman.gusev', pg_temp.at(-3, 10));
select pg_temp.report(20, 1, 'foreman.gusev', 'Основание вывески очищено от ржавчины и окрашено в два слоя.', 2, pg_temp.at(-2, 15));

select pg_temp.move(21, 'Accepted', 'foreman.gusev', pg_temp.at(-8, 16));
select pg_temp.move(21, 'InProgress', 'foreman.gusev', pg_temp.at(-7, 9));
select pg_temp.report(21, 1, 'foreman.gusev', 'Перегородка смонтирована, дверной блок установлен, швы зашпаклёваны.', 3, pg_temp.at(-6, 16));
select pg_temp.decide(21, 1, 'dispatcher.south', 'accepted', null, pg_temp.at(-6, 17, 30));

update public.tasks
set status = 'Cancelled', cancelled_at = pg_temp.at(-2, 18), cancelled_by = pg_temp.sid('user:dispatcher.south'),
    cancel_reason = 'Заказчик сам заключил договор на обслуживание вытяжки.', version = version + 1
where id = pg_temp.sid('task:22');
select pg_temp.event(22, 'dispatcher.south', 'cancelled', jsonb_build_object(
  'reason', 'Заказчик сам заключил договор на обслуживание вытяжки.',
  'old_status', 'Assigned'
), pg_temp.at(-2, 18));
