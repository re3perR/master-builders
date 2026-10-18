# Развёртывание на сервере

Приложение запускается двумя контейнерами из `docker-compose.yml` в корне репозитория:

- `app` — Next.js в режиме standalone на Node 22 (Debian bookworm slim). В образе только собранный сервер, статика и зависимости, нужные во время работы, включая `sharp` для обработки фото. Процесс работает от пользователя `node`, порт 3000 доступен только внутри сети compose.
- `caddy` — обратный прокси на портах 80 и 443. Сам получает и продлевает сертификат Let's Encrypt для домена из `APP_DOMAIN` и хранит его в томе `caddy_data`.

База, авторизация и фото находятся в облачном Supabase, данных приложения на сервере нет.

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` и `NEXT_PUBLIC_COMPANY_TIMEZONE` встраиваются в код при сборке, после их изменения образ нужно пересобрать. `SUPABASE_SERVICE_ROLE_KEY`, `DEMO_ACCOUNTS` и `DEMO_PASSWORD` читаются при запуске, для них достаточно перезапустить контейнер. Ключ service_role в образ не попадает.

## Сервер

Нужен Linux-сервер с Docker Engine и плагином compose (проверка: `docker compose version`). Откройте порты 80/tcp, 443/tcp и 443/udp. A-запись домена должна указывать на сервер до первого запуска, иначе Caddy не получит сертификат. При сборке образа нужен доступ к registry.npmjs.org и fonts.googleapis.com.

## Supabase

1. Создайте проект. В Project Settings, раздел API Keys, возьмите адрес проекта, публичный ключ anon и секретный ключ service_role.
2. В Authentication, раздел URL Configuration, укажите Site URL `https://<домен>` и добавьте в Redirect URLs `https://<домен>/auth/callback`. Без этого не работает восстановление пароля.
3. В Authentication, раздел SMTP Settings, подключите свой SMTP. Встроенная почта Supabase подходит только для проверки.
4. Примените миграции с машины разработчика из корня репозитория:

        npx supabase login
        npx supabase link --project-ref <ref>
        npx supabase db push

   Миграции создают схему, функции, политики доступа и бакет для фото. Для демо-стенда добавьте `--include-seed`: загрузятся демо-компания и аккаунты из `supabase/seed.sql`.

## Настройка

    git clone <адрес репозитория> /opt/master-builders
    cd /opt/master-builders
    cp .env.example .env

В `.env` заполните:

- `NEXT_PUBLIC_SUPABASE_URL` — адрес проекта, `https://<ref>.supabase.co`;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — ключ anon;
- `SUPABASE_SERVICE_ROLE_KEY` — ключ service_role;
- `NEXT_PUBLIC_COMPANY_TIMEZONE` — пояс компании, по умолчанию Europe/Moscow;
- `APP_DOMAIN` — домен без схемы, например `mb.company.ru`;
- `APP_IMAGE` — имя образа приложения;
- `DEMO_ACCOUNTS` — `enabled` показывает на странице входа демо-аккаунты с паролем из `DEMO_PASSWORD`. На рабочем стенде оставьте `disabled`.

Ключ service_role сервер использует в одном месте: после всех проверок сохраняет фото в закрытое хранилище. Пользователям и в браузер он не передаётся. Держите `.env` с правами только для владельца (`chmod 600 .env`).

## Запуск

    docker compose up -d --build
    docker compose ps

Caddy стартует, когда приложение пройдёт проверку здоровья (`/login` отвечает 200). После получения сертификата сайт открывается по `https://<домен>`.

## Обновление

Если в новой версии есть миграции, сначала примените их через `npx supabase db push`. Затем на сервере:

    git pull
    docker compose up -d --build
    docker image prune -f

Не запускайте `docker compose down -v`: вместе с томом удалятся сертификаты, и Caddy будет выпускать их заново.

## Готовый образ

Образ можно собрать на другой машине и хранить в registry. Платформа должна совпадать с сервером:

    docker build --platform linux/amd64 -t registry.example.com/master-builders:1.0 \
      --build-arg NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
      --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=<ключ anon> \
      --build-arg NEXT_PUBLIC_COMPANY_TIMEZONE=Europe/Moscow .
    docker push registry.example.com/master-builders:1.0

На сервере укажите в `.env` `APP_IMAGE=registry.example.com/master-builders:1.0` и запустите без сборки:

    docker compose pull app
    docker compose up -d --no-build

## Логи

    docker compose logs -f app
    docker compose logs -f caddy

Логи каждого контейнера ограничены пятью файлами по 10 МБ.

## Очистка временных загрузок

`npm run cleanup:uploads` (подробнее в `docs/operations.md`) запускается раз в сутки там, где есть репозиторий, Node 22, установленные зависимости (`npm ci`) и `.env.local` с адресом облачного проекта и `SUPABASE_SERVICE_ROLE_KEY`. Это может быть и сам сервер: `.env.local` в контейнер не попадает. Пример строки crontab, в `PATH` должны быть `node` и `npm`:

    0 3 * * * cd /opt/master-builders && npm run cleanup:uploads >> /var/log/mb-cleanup.log 2>&1

## Резервные копии

Копирование и восстановление базы вместе с фотографиями описаны в `docs/operations.md`. Они выполняются через Supabase CLI и от контейнеров не зависят.
