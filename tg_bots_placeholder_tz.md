# Техническое задание: заглушка-автоответчик для 10 Telegram-ботов

## 1. Цель проекта

Нужно сделать небольшой сервис, который обслуживает 10 существующих Telegram-ботов.

Каждый бот должен работать как простая заглушка:

1. Пользователь пишет в бота.
2. Бот сохраняет пользователя как уникальный контакт.
3. Бот отправляет пользователю автоответ: «в разработке, приходите позже» или другой текст из `.env`.

Сообщение автоответа должно настраиваться через переменную окружения.

Проект должен деплоиться на VPS через Docker и GitHub Actions.

---

## 2. Важное уточнение по логике хранения

Нужно собирать **уникальные контакты**, а не логировать каждое обращение.

Это значит:

- если пользователь написал в конкретного бота первый раз — создать запись;
- если этот же пользователь снова написал в этого же бота — новую запись не создавать;
- если этот же пользователь написал в другого бота — создать отдельную запись, потому что `bot_link` другой.

Уникальность определяется парой:

```text
tg_id + bot_link
```

Пример:

| tg_id | bot_link | Что делать |
|---:|---|---|
| 123 | https://t.me/bot_one | создать запись |
| 123 | https://t.me/bot_one | не создавать дубль |
| 123 | https://t.me/bot_two | создать запись |

---

## 3. Главное ограничение

Проект должен быть максимально простым.

Не нужно делать:

- админку;
- веб-интерфейс;
- аналитику;
- роли пользователей;
- воронки;
- сложную обработку сообщений;
- сохранение текста сообщений;
- сохранение username, first_name, last_name;
- хранение raw Telegram update;
- разные сценарии для разных ботов;
- webhook;
- отдельный сервис на каждого бота.

Нужна только заглушка и сбор уникальных контактов в формате:

```text
tg_id, bot_link
```

Технические поля `id`, `created_at`, `updated_at` допустимы.

---

## 4. Рекомендуемый стек

### Backend

- Node.js 22
- TypeScript
- grammY для работы с Telegram Bot API
- pg для подключения к PostgreSQL
- dotenv для переменных окружения
- pino для логов приложения

### База данных

- PostgreSQL 17 Alpine

### Деплой

- Docker
- Docker Compose
- GitHub Actions
- VPS
- Polling, не webhook

---

## 5. Общая архитектура

Один сервис обслуживает все 10 Telegram-ботов.

```text
GitHub repository
  └── GitHub Actions
        └── SSH на VPS
              └── git pull
              └── docker compose up -d --build

VPS
  ├── app container
  │     ├── читает токены 10 Telegram-ботов из .env
  │     ├── запускает polling для каждого бота
  │     ├── сохраняет уникальные контакты в PostgreSQL
  │     └── отправляет автоответ из .env
  │
  └── postgres container
        └── хранит таблицу уникальных контактов
```

---

## 6. Переменные окружения

Нужно создать файл `.env`.

Пример:

```env
NODE_ENV=production

DATABASE_URL=postgresql://botlogger:strong_password@postgres:5432/botlogger

BOT_TOKENS=123456:AAA,234567:BBB,345678:CCC

AUTO_REPLY_MESSAGE=Бот сейчас в разработке. Пожалуйста, приходите позже.

DROP_PENDING_UPDATES=true

LOG_LEVEL=info
```

### Описание переменных

#### `DATABASE_URL`

Строка подключения к PostgreSQL.

#### `BOT_TOKENS`

Список токенов Telegram-ботов через запятую.

Пример:

```env
BOT_TOKENS=token1,token2,token3
```

Ожидается 10 токенов.

Если токенов меньше или больше — сервис должен запуститься, но вывести предупреждение в логи.

#### `AUTO_REPLY_MESSAGE`

Текст, который бот отправляет пользователю на любое обращение.

Текст должен полностью браться из `.env`, без хардкода в коде.

#### `DROP_PENDING_UPDATES`

Если `true`, при запуске бот должен сбросить старые накопившиеся Telegram-обновления.

Это нужно, чтобы после запуска бот не начал отвечать на старые сообщения.

---

## 7. Таблица уникальных контактов

Нужно хранить уникальные контакты пользователей по каждому боту.

Таблица:

```sql
CREATE TABLE IF NOT EXISTS bot_contacts (
  id BIGSERIAL PRIMARY KEY,
  tg_id BIGINT NOT NULL,
  bot_link TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_tg_contact_per_bot UNIQUE (tg_id, bot_link)
);

CREATE INDEX IF NOT EXISTS idx_bot_contacts_tg_id
ON bot_contacts(tg_id);

CREATE INDEX IF NOT EXISTS idx_bot_contacts_bot_link
ON bot_contacts(bot_link);

CREATE INDEX IF NOT EXISTS idx_bot_contacts_created_at
ON bot_contacts(created_at);
```

### Почему нужна уникальность

Нужно не количество сообщений, а список людей, которые обращались в ботов.

Поэтому нельзя делать простой `INSERT` на каждое сообщение.

Нужно делать `UPSERT`:

```sql
INSERT INTO bot_contacts (tg_id, bot_link)
VALUES ($1, $2)
ON CONFLICT (tg_id, bot_link)
DO UPDATE SET updated_at = now();
```

Так:

- первая запись пользователя создаёт контакт;
- повторное сообщение не создаёт дубль;
- `updated_at` показывает, когда контакт обращался последний раз.

---

## 8. Что считать контактом

Контакт — это уникальная пара:

```text
tg_id + bot_link
```

Если пользователь написал в одного бота 20 раз, в таблице должна быть одна строка.

Если пользователь написал в 3 разных бота, в таблице должно быть 3 строки:

```text
tg_id + bot_1
tg_id + bot_2
tg_id + bot_3
```

---

## 9. Формирование `bot_link`

При запуске сервиса для каждого токена нужно вызвать Telegram API `getMe()`.

Из ответа нужно взять username бота.

Пример:

```text
username = my_test_bot
bot_link = https://t.me/my_test_bot
```

Именно это значение нужно сохранять в поле `bot_link`.

Не нужно прописывать ссылки на ботов вручную в `.env`.

---

## 10. Поведение бота

### При входящем сообщении

Бот должен:

1. Получить `tg_id` из `ctx.from.id`.
2. Определить `bot_link`.
3. Сохранить или обновить уникальный контакт в PostgreSQL через `UPSERT`.
4. Отправить автоответ из `AUTO_REPLY_MESSAGE`.

### Если такой контакт уже есть

Если в таблице уже есть строка с такой парой:

```text
tg_id + bot_link
```

новую строку создавать нельзя.

Нужно только обновить `updated_at`.

### Если запись в БД не удалась

Если пользователь написал, но база временно недоступна:

1. Ошибку нужно записать в логи приложения.
2. Пользователю всё равно нужно отправить автоответ.

Пользователь не должен видеть техническую ошибку.

### Если отправка автоответа не удалась

Если Telegram API вернул ошибку:

1. Ошибку нужно записать в логи приложения.
2. Сервис не должен падать.

### Если один из токенов невалидный

Если один токен невалидный:

1. Ошибку нужно записать в логи.
2. Остальные боты должны продолжить работу.
3. Весь сервис не должен завершаться из-за одного плохого токена.

---

## 11. Структура проекта

Рекомендуемая структура:

```text
tg-bots-placeholder/
  ├── src/
  │   ├── index.ts
  │   ├── config.ts
  │   ├── db.ts
  │   ├── bots.ts
  │   └── migrations/
  │       └── 001_init.sql
  │
  ├── Dockerfile
  ├── docker-compose.yml
  ├── package.json
  ├── tsconfig.json
  ├── .env.example
  └── .github/
      └── workflows/
          └── deploy.yml
```

---

## 12. Описание файлов

### `src/config.ts`

Задачи:

- прочитать `.env`;
- проверить наличие обязательных переменных;
- распарсить `BOT_TOKENS`;
- экспортировать конфигурацию приложения.

Обязательные переменные:

- `DATABASE_URL`
- `BOT_TOKENS`
- `AUTO_REPLY_MESSAGE`

Если обязательной переменной нет — приложение должно завершиться с понятной ошибкой.

---

### `src/db.ts`

Задачи:

- создать подключение к PostgreSQL;
- экспортировать функцию `upsertBotContact`.

Функция:

```ts
async function upsertBotContact(params: {
  tgId: number;
  botLink: string;
}): Promise<void>
```

Функция должна выполнять SQL:

```sql
INSERT INTO bot_contacts (tg_id, bot_link)
VALUES ($1, $2)
ON CONFLICT (tg_id, bot_link)
DO UPDATE SET updated_at = now();
```

---

### `src/bots.ts`

Задачи:

- создать экземпляры ботов по списку токенов;
- для каждого бота получить данные через `getMe()`;
- сформировать `bot_link`;
- зарегистрировать обработчик входящих сообщений;
- запустить polling.

---

### `src/index.ts`

Задачи:

- загрузить конфиг;
- подключиться к БД;
- применить миграции;
- запустить всех ботов;
- корректно обработать завершение процесса.

---

## 13. Миграция

В проекте должна быть минимальная миграция `001_init.sql`.

Содержимое:

```sql
CREATE TABLE IF NOT EXISTS bot_contacts (
  id BIGSERIAL PRIMARY KEY,
  tg_id BIGINT NOT NULL,
  bot_link TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_tg_contact_per_bot UNIQUE (tg_id, bot_link)
);

CREATE INDEX IF NOT EXISTS idx_bot_contacts_tg_id
ON bot_contacts(tg_id);

CREATE INDEX IF NOT EXISTS idx_bot_contacts_bot_link
ON bot_contacts(bot_link);

CREATE INDEX IF NOT EXISTS idx_bot_contacts_created_at
ON bot_contacts(created_at);
```

Миграции можно применить простым кодом при старте приложения.

Отдельный migration framework не обязателен.

---

## 14. Dockerfile

Пример Dockerfile:

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY src/migrations ./dist/migrations

CMD ["node", "dist/index.js"]
```

---

## 15. Docker Compose

Пример `docker-compose.yml`:

```yaml
services:
  app:
    build: .
    container_name: tg-bots-placeholder-app
    restart: unless-stopped
    env_file:
      - .env
    depends_on:
      - postgres

  postgres:
    image: postgres:17-alpine
    container_name: tg-bots-placeholder-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: botlogger
      POSTGRES_USER: botlogger
      POSTGRES_PASSWORD: strong_password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

В production желательно не хранить реальный пароль прямо в `docker-compose.yml`.

Можно вынести в `.env`:

```env
POSTGRES_DB=botlogger
POSTGRES_USER=botlogger
POSTGRES_PASSWORD=strong_password
```

---

## 16. GitHub Actions

Нужно настроить деплой при push в ветку `main`.

Пример `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_PORT }}
          script: |
            cd /opt/tg-bots-placeholder
            git pull
            docker compose up -d --build
            docker image prune -f
```

---

## 17. GitHub Secrets

В GitHub нужно добавить secrets:

```text
VPS_HOST
VPS_USER
VPS_PORT
VPS_SSH_KEY
```

Где:

- `VPS_HOST` — IP-адрес VPS;
- `VPS_USER` — пользователь на сервере;
- `VPS_PORT` — SSH-порт, обычно `22`;
- `VPS_SSH_KEY` — приватный SSH-ключ для деплоя.

---

## 18. Подготовка VPS

На VPS должны быть установлены:

- Git
- Docker
- Docker Compose plugin

Проект должен лежать, например, здесь:

```text
/opt/tg-bots-placeholder
```

Первичная подготовка:

```bash
cd /opt
git clone <REPOSITORY_URL> tg-bots-placeholder
cd tg-bots-placeholder
cp .env.example .env
nano .env
docker compose up -d --build
```

---

## 19. Проверка работы

### Проверить контейнеры

```bash
docker compose ps
```

Ожидается:

```text
tg-bots-placeholder-app   Up
tg-bots-placeholder-db    Up
```

### Посмотреть логи приложения

```bash
docker logs -f tg-bots-placeholder-app
```

### Проверить базу

```bash
docker exec -it tg-bots-placeholder-db psql -U botlogger -d botlogger
```

Затем:

```sql
SELECT * FROM bot_contacts ORDER BY updated_at DESC LIMIT 20;
```

### Проверить отсутствие дублей

```sql
SELECT tg_id, bot_link, COUNT(*)
FROM bot_contacts
GROUP BY tg_id, bot_link
HAVING COUNT(*) > 1;
```

Ожидаемый результат — пустой список.

---

## 20. План выполнения

### Этап 1. Создать репозиторий

1. Создать новый GitHub-репозиторий.
2. Добавить базовую структуру проекта.
3. Добавить `.gitignore`.
4. Добавить `.env.example`.

---

### Этап 2. Инициализировать Node.js-проект

1. Установить TypeScript.
2. Установить зависимости:
   - `grammy`
   - `pg`
   - `dotenv`
   - `pino`
3. Настроить `tsconfig.json`.
4. Добавить npm-скрипты:
   - `dev`
   - `build`
   - `start`

Пример:

```json
{
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

---

### Этап 3. Реализовать конфиг

1. Прочитать переменные окружения.
2. Проверить обязательные переменные.
3. Разобрать `BOT_TOKENS` в массив.
4. Вывести предупреждение, если токенов не 10.

---

### Этап 4. Реализовать подключение к PostgreSQL

1. Создать `Pool` из пакета `pg`.
2. Реализовать проверку подключения.
3. Реализовать функцию применения миграции.
4. Реализовать функцию `upsertBotContact`.

---

### Этап 5. Реализовать запуск ботов

1. Для каждого токена создать экземпляр `Bot`.
2. Перед polling вызвать `deleteWebhook`.
3. Если `DROP_PENDING_UPDATES=true`, сбросить накопившиеся update.
4. Вызвать `getMe`.
5. Сформировать `bot_link`.
6. Зарегистрировать обработчик входящих сообщений.
7. Запустить polling.

---

### Этап 6. Реализовать обработчик контакта

Для каждого входящего сообщения:

1. Получить `tg_id`.
2. Если `tg_id` отсутствует — ничего не делать.
3. Сохранить или обновить уникальный контакт:
   - `tg_id`
   - `bot_link`
4. Отправить пользователю `AUTO_REPLY_MESSAGE`.

SQL-логика должна быть именно через `ON CONFLICT`, чтобы не плодить дубли:

```sql
INSERT INTO bot_contacts (tg_id, bot_link)
VALUES ($1, $2)
ON CONFLICT (tg_id, bot_link)
DO UPDATE SET updated_at = now();
```

---

### Этап 7. Добавить Docker

1. Написать `Dockerfile`.
2. Написать `docker-compose.yml`.
3. Проверить локальную сборку:
   ```bash
   docker compose up -d --build
   ```
4. Проверить логи:
   ```bash
   docker logs -f tg-bots-placeholder-app
   ```

---

### Этап 8. Настроить VPS

1. Установить Docker.
2. Установить Git.
3. Склонировать репозиторий в `/opt/tg-bots-placeholder`.
4. Создать `.env`.
5. Запустить проект вручную через Docker Compose.
6. Проверить ответы ботов.
7. Проверить записи в PostgreSQL.

---

### Этап 9. Настроить GitHub Actions

1. Создать SSH-ключ для деплоя.
2. Добавить публичный ключ на VPS в `authorized_keys`.
3. Добавить приватный ключ в GitHub Secrets.
4. Добавить остальные secrets.
5. Создать workflow `deploy.yml`.
6. Сделать test push в `main`.
7. Проверить, что сервис обновился на VPS.

---

### Этап 10. Финальная проверка

Нужно проверить каждый из 10 ботов:

1. Написать `/start`.
2. Убедиться, что пришёл автоответ.
3. Написать обычное сообщение тому же боту.
4. Убедиться, что пришёл автоответ.
5. Проверить, что в БД для этого пользователя и этого бота осталась одна строка.
6. Проверить, что `updated_at` обновился.
7. Проверить, что `bot_link` соответствует конкретному боту.

SQL для проверки:

```sql
SELECT tg_id, bot_link, created_at, updated_at
FROM bot_contacts
ORDER BY updated_at DESC
LIMIT 50;
```

---

## 21. Критерии готовности

Проект считается готовым, если:

1. Один сервис запускает polling для всех 10 Telegram-ботов.
2. Автоответ берётся из `.env`.
3. При обращении пользователя бот отправляет автоответ.
4. В PostgreSQL сохраняются уникальные контакты, а не каждое обращение.
5. Уникальность обеспечивается парой:
   - `tg_id`
   - `bot_link`
6. Повторные сообщения одного пользователя в одного и того же бота не создают дубли.
7. Если пользователь написал в разные боты, для каждого бота есть отдельная запись.
8. Проект запускается через Docker Compose.
9. Проект деплоится на VPS через GitHub Actions.
10. Если один бот не стартовал из-за плохого токена, остальные продолжают работать.
11. При перезапуске контейнера сервис автоматически поднимается снова.
12. В логах понятно видно, какие боты успешно запущены.

---

## 22. Что не делать без отдельного согласования

Не добавлять без отдельного согласования:

- админку;
- авторизацию;
- webhook;
- Redis;
- очереди;
- CRM;
- Google Sheets;
- аналитику;
- разные тексты для разных ботов;
- сохранение текста сообщений;
- сохранение username;
- сохранение first_name;
- сохранение last_name;
- сохранение raw Telegram update;
- сложные сценарии обработки сообщений;
- лимиты ответов;
- рассылки;
- экспорт в Excel;
- таблицу всех сообщений.

Задача — сделать простую техническую заглушку и сбор уникальных контактов.
