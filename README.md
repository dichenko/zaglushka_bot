# tg-bots-placeholder

Заглушка-автоответчик для 10 Telegram-ботов. Сохраняет уникальные контакты (tg_id + bot_link) в PostgreSQL.

## Запуск

```bash
cp .env.example .env
# заполни .env своими токенами и паролем БД
docker compose up -d --build
```

## Экспорт контактов в CSV

### Из контейнера

```bash
docker exec tg-bots-placeholder-app npx tsx scripts/export_csv.ts /tmp/out.csv
docker cp tg-bots-placeholder-app:/tmp/out.csv ./bot_contacts.csv
```

### Локально

```bash
npm run export-csv bot_contacts.csv
```

Аргумент — имя выходного файла (по умолчанию `bot_contacts.csv`).

Структура CSV:

| id | tg_id | bot_link | created_at | updated_at |
|---|---|---|---|---|
| 1 | 12345 | https://t.me/my_bot | 2026-01-01 00:00:00+00 | 2026-01-01 00:00:00+00 |

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | Строка подключения к PostgreSQL |
| `BOT_TOKENS` | Токены ботов через запятую |
| `AUTO_REPLY_MESSAGE` | Текст автоответа |
| `DROP_PENDING_UPDATES` | Сброс старых апдейтов при старте (`true`/`false`) |
| `LOG_LEVEL` | Уровень логирования (по умолчанию `info`) |
| `POSTGRES_DB` | Имя БД (по умолчанию `botlogger`) |
| `POSTGRES_USER` | Пользователь БД (по умолчанию `botlogger`) |
| `POSTGRES_PASSWORD` | Пароль БД (по умолчанию `strong_password`) |

## Проверка

```bash
# статус контейнеров
docker compose ps

# логи приложения
docker logs -f tg-bots-placeholder-app

# записи в БД
docker exec tg-bots-placeholder-db psql -U botlogger -d botlogger -c "SELECT * FROM bot_contacts ORDER BY updated_at DESC LIMIT 20;"

# проверка дублей
docker exec tg-bots-placeholder-db psql -U botlogger -d botlogger -c "SELECT tg_id, bot_link, COUNT(*) FROM bot_contacts GROUP BY tg_id, bot_link HAVING COUNT(*) > 1;"
```
