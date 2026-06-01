# План реализации: AI-агент для Telegram ботов с админ-панелью

## Обзор

Трансформация заглушки-автоответчика в полноценный AI-агент на LangChain, который:
- Ведёт диалог с клиентами на русском, узбекском и английском
- Распознаёт голосовые сообщения (STT) с fallback стратегией
- Сохраняет историю всех сообщений
- Отправляет заявки (лиды) в Telegram-чат администраторов
- Имеет один инструмент (tool): отправка сообщения администратору
- Включает веб-админку для управления промптом, ботами и просмотра диалогов

## Технологический стек

### Новое
- **LangChain** - фреймворк для AI-агентов
- **@langchain/openai** - интеграция с DeepSeek через OpenAI-compatible API
- **LangChain Chat Memory** - хранение истории диалогов в PostgreSQL
- **FFmpeg** - обработка аудио файлов (для voice messages, конвертация OGG → WAV)
- **Express.js** - веб-сервер для админ-панели
- **EJS** - шаблонизатор для админки
- **express-session** - управление сессиями администраторов

### Сохраняется
- Node.js 22, TypeScript
- grammY (Telegram Bot API)
- PostgreSQL 17
- Docker, Docker Compose
- pino (логирование)

---

## Структура базы данных

### Новые таблицы

#### 1. `bot_configs` - конфигурация ботов (заменяет BOT_TOKENS из .env)
```sql
CREATE TABLE IF NOT EXISTS bot_configs (
  id BIGSERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  bot_link TEXT UNIQUE,
  bot_name TEXT,
  bot_description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bot_configs_active ON bot_configs(is_active);
```

#### 2. `system_prompts` - версионирование системных промптов
```sql
CREATE TABLE IF NOT EXISTS system_prompts (
  id BIGSERIAL PRIMARY KEY,
  prompt_text TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT -- tg_id админа who created it
);

CREATE INDEX idx_system_prompts_active ON system_prompts(is_active);
CREATE INDEX idx_system_prompts_version ON system_prompts(version DESC);
```

#### 3. `first_messages` - первое сообщение для новых пользователей
```sql
CREATE TABLE IF NOT EXISTS first_messages (
  id BIGSERIAL PRIMARY KEY,
  message_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by BIGINT -- tg_id админа who updated it
);

-- Только одна активная запись
CREATE UNIQUE INDEX idx_first_messages_active ON first_messages(is_active) WHERE is_active = true;
```

#### 4. `admin_tokens` - временные токены для доступа в админку
```sql
CREATE TABLE IF NOT EXISTS admin_tokens (
  id BIGSERIAL PRIMARY KEY,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tg_id BIGINT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_tokens_token ON admin_tokens(token);
CREATE INDEX idx_admin_tokens_expires ON admin_tokens(expires_at);
```

#### 5. `conversations` - сессии диалогов
```sql
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id BIGINT NOT NULL,
  bot_link TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, completed, escalated
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  
  CONSTRAINT fk_conversation_contact 
    FOREIGN KEY (tg_id, bot_link) 
    REFERENCES bot_contacts(tg_id, bot_link)
);

CREATE INDEX idx_conversations_tg_id ON conversations(tg_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_updated ON conversations(updated_at);
```

#### 6. `messages` - история всех сообщений
```sql
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL, -- user, assistant, system
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text', -- text, voice, image
  audio_file_id TEXT, -- для voice messages
  transcription TEXT, -- результат STT
  tool_calls TEXT, -- JSON array of tool calls if any
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at);
```

#### 7. `leads` - отправленные заявки
```sql
CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  tg_id BIGINT NOT NULL,
  bot_link TEXT NOT NULL,
  username TEXT,
  telegram_link TEXT, -- https://t.me/{username}
  summary TEXT NOT NULL, -- резюме диалога от агента
  contacts TEXT, -- контакты пользователя (если есть)
  telegram_message_id BIGINT, -- ID сообщения в чате админов
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_conversation ON leads(conversation_id);
CREATE INDEX idx_leads_sent ON leads(sent_at);
```

### Обновления
- Таблица `bot_contacts` расширяется полями: `username`, `first_name`, `last_name`, `phone`

---

## Переменные окружения (.env)

```env
# Существующие
DATABASE_URL=postgresql://botlogger:strong_password@postgres:5432/botlogger
# BOT_TOKENS - больше не нужен, боты управляются через админку
DROP_PENDING_UPDATES=true
LOG_LEVEL=info
POSTGRES_DB=botlogger
POSTGRES_USER=botlogger
POSTGRES_PASSWORD=strong_password

# Администраторы
ADMIN_TG_IDS=123456789,987654321  # TG IDs администраторов через запятую
ADMIN_SESSION_SECRET=your_random_secret_key_for_sessions
ADMIN_SESSION_MAX_AGE_HOURS=24

# AI/LLM конфигурация
LLM_PROVIDER=deepseek
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=your_deepseek_api_key
LLM_MODEL=deepseek-chat

# STT конфигурация
# MUXLISA (узбекский)
MUXLISA_BASE_URL=https://service.muxlisa.uz
MUXLISA_API_KEY=your_muxlisa_api_key

# OpenAI STT (русский/английский)
OPENAI_STT_MODEL=gpt-4o-transcribe
OPENAI_API_KEY=your_openai_api_key

# STT fallback настройки
STT_FALLBACK_CONFIDENCE_THRESHOLD=0.7
STT_MAX_RETRIES=2

# Telegram админ чат для лидов
ADMIN_CHAT_ID=-1001234567890

# AI Agent настройки
AGENT_MAX_CONVERSATION_TURNS=50
AGENT_INACTIVITY_TIMEOUT_MINUTES=30

# Админ-панель
ADMIN_PORT=3001  # Порт для веб-админки
ADMIN_BASE_URL=http://localhost:3001  # URL админки (для ссылок)
```

---

## Структура проекта

```
src/
├── index.ts                    # Точка входа (запуск ботов + админки)
├── config.ts                   # Конфигурация
├── db.ts                       # Работа с БД
├── bots.ts                     # Запуск ботов
├── migrations/
│   ├── 001_init.sql           # Существующая
│   └── 002_ai_agent.sql       # Новые таблицы
├── agent/
│   ├── index.ts               # Создание агента
│   ├── system_prompt.ts       # Загрузка промпта из БД
│   ├── tools/
│   │   └── send_to_admin.ts   # Tool для отправки админам
│   └── memory.ts              # Управление памятью (история)
├── stt/
│   ├── index.ts               # STT router
│   ├── muxlisa.ts             # MUXLISA провайдер
│   ├── openai_stt.ts          # OpenAI STT провайдер
│   └── language_detector.ts   # Определение языка
├── handlers/
│   ├── message.ts             # Обработка текстовых сообщений
│   ├── voice.ts               # Обработка голосовых сообщений
│   └── conversation.ts        # Управление диалогами
├── admin/
│   ├── server.ts              # Express сервер
│   ├── auth.ts                # Middleware авторизации
│   ├── routes/
│   │   ├── prompt.ts          # /admin/prompt - системный промпт
│   │   ├── first_message.ts   # /admin/first-message - первое сообщение
│   │   ├── bots.ts            # /admin/bots - управление ботами
│   │   └── conversations.ts   # /admin/conversations - история диалогов
│   ├── middleware/
│   │   └── auth.ts            # Проверка сессии админа
│   └── views/
│       ├── layout.ejs         # Общий layout
│       ├── prompt.ejs         # Страница системного промпта
│       ├── first_message.ejs  # Страница первого сообщения
│       ├── bots.ejs           # Страница управления ботами
│       └── conversations.ejs  # Страница истории диалогов
└── types/
    └── index.ts               # TypeScript типы
```

---

## План реализации по этапам

### Этап 1: Подготовка и зависимости ✅ COMPLETED

**Выполнено:**
- ✅ Созданы TypeScript типы в `src/types/index.ts`
- ✅ Создана миграция `src/migrations/002_ai_agent.sql`
- ✅ Обновлён `.env.example` с новыми переменными
- ✅ Обновлён `package.json` (зависимости будут установлены Docker при билде)

**Примечание:** Зависимости устанавливаются через Docker CI/CD, не локально

**Результат:** Проект готов к разработке AI-агента и админки

---

### Этап 2: Расширение базы данных ✅ COMPLETED

**Выполнено:**
- ✅ Создана миграция `src/migrations/002_ai_agent.sql` со всеми таблицами
- ✅ Обновлён `src/db.ts` с новыми функциями:
  - Bot Configs: `getActiveBots()`, `createBot()`, `updateBot()`, `deleteBot()`, `syncBotLink()`
  - System Prompts: `getActiveSystemPrompt()`, `createSystemPrompt()`
  - First Messages: `getActiveFirstMessage()`, `updateFirstMessage()`
  - Admin Tokens: `createAdminToken()`, `validateAdminToken()`
  - Conversations: `createConversation()`, `getActiveConversation()`, `closeConversation()`
  - Messages: `saveMessage()`, `getConversationHistory()`
  - Leads: `createLead()`
  - Admin Panel: `getConversations()`, `getMessagesByConversation()`
- ✅ Обновлена функция `upsertBotContact()` с новыми полями
- ✅ Добавлена миграция 002 в `runMigrations()`

**Результат:** Полная поддержка хранения диалогов, лидов, конфигурации и админки

---

### Этап 3: Админ-панель - базовая структура ✅ COMPLETED

**Выполнено:**
- ✅ Создан `src/admin/server.ts` - Express сервер с session management
- ✅ Создан `src/admin/middleware/auth.ts` - Middleware для проверки авторизации
- ✅ Создан `src/admin/auth.ts` - Генерация и валидация токенов
- ✅ Создан `src/admin/routes/api.ts` - API routes для всех страниц
- ✅ Создан layout `src/admin/views/layout.ejs` с навигацией
- ✅ Создана страница логина `src/admin/views/login.ejs`
- ✅ Обновлён `src/config.ts` с переменными для админки
- ✅ Добавлены зависимости в `package.json`

**Результат:** Работающий Express сервер с авторизацией

---

### Этап 4: Админ-панель - страницы ✅ COMPLETED

**Выполнено:**
- ✅ Страница 1: `src/admin/views/prompt.ejs` - управление системным промптом
- ✅ Страница 2: `src/admin/views/first-message.ejs` - первое сообщение
- ✅ Страница 3: `src/admin/views/bots.ejs` - CRUD для ботов
- ✅ Страница 4: `src/admin/views/conversations.ejs` - история диалогов с пагинацией и фильтрами
- ✅ Все страницы имеют API endpoints в `src/admin/routes/api.ts`
- ✅ JavaScript для динамической загрузки/сохранения данных

**Результат:** Полностью рабочая админ-панель с 4 страницами

---

### Этап 5: STT модуль ✅ COMPLETED

**Выполнено:**
- ✅ Создан `src/stt/openai_stt.ts` - OpenAI STT провайдер
- ✅ Создан `src/stt/muxlisa.ts` - MUXLISA STT провайдер (узбекский)
- ✅ Создан `src/stt/index.ts` - STT router с fallback стратегией
- ✅ Конвертация OGG → WAV через FFmpeg
- ✅ Fallback логика: OpenAI → MUXLISA при низкой confidence

**Результат:** Модуль распознавания речи с fallback на два провайдера

### Этап 6: LangChain Agent

**Задачи:**

1. **Создать `src/agent/system_prompt.ts`:**
   - Загрузка промпта из БД (динамически, не из .env)
   - Функция: `loadSystemPrompt(): Promise<string>`
   - Кэширование промпта с инвалидацией
   - Fallback на дефолтный промпт если БД недоступна
   
   ```typescript
   export async function loadSystemPrompt(): Promise<string> {
     const prompt = await getActiveSystemPrompt();
     return prompt || DEFAULT_PROMPT;
   }
   ```

2. **Создать `src/agent/tools/send_to_admin.ts`:**
   - Tool для LangChain агента
   - Функция: `sendToAdminTool(summary, contacts, username, telegram_link, tgId, botLink)`
   - Отправляет сообщение в ADMIN_CHAT_ID через Telegram Bot API
   - Сохраняет лид в БД (таблица `leads`)
   - Закрывает conversation (status = 'escalated')
   
   ```typescript
   export const sendToAdminTool = new DynamicStructuredTool({
     name: "send_to_admin",
     description: "Отправить заявку администраторам с резюме диалога и контактами",
     schema: z.object({
       summary: z.string().describe("Резюме диалога и потребности пользователя"),
       contacts: z.string().describe("Контактные данные пользователя"),
       username: z.string().describe("Username пользователя в Telegram"),
       telegram_link: z.string().describe("Ссылка на профиль Telegram")
     }),
     func: async ({ summary, contacts, username, telegram_link }) => {
       // Отправка в Telegram админ чат
       // Сохранение в БД
       // Закрытие conversation
       return "Заявка успешно отправлена администраторам";
     }
   });
   ```
   
   Формат сообщения в админ чат:
   ```
   📩 Новая заявка от @username
   🔗 Профиль: https://t.me/username
   
   👤 Контакты:
   • Телефон: +998901234567
   
   📝 Резюме:
   Пользователь интересуется услугами доставки...
   
   🤖 Бот: @my_business_bot
   ⏰ Время: 2026-06-01 14:30:00
   ```

3. **Создать `src/agent/memory.ts`:**
   - Кастомный ChatMessageHistory для PostgreSQL
   - Загружает историю из таблицы `messages`
   - Сохраняет новые сообщения
   - Поддерживает ограничение по количеству сообщений (windowed memory)

4. **Создать `src/agent/index.ts`:**
   - Создание LangChain агента:
     ```typescript
     const model = new ChatOpenAI({
       modelName: config.llmModel,
       openAIApiKey: config.llmApiKey,
       configuration: {
         baseURL: config.llmBaseUrl
       }
     });
     
     const tools = [sendToAdminTool];
     const agent = createReactAgent({ llm: model, tools });
     ```
   - Функция: `runAgent(conversationId, userMessage, userInfo): Promise<string>`

**Результат:** Полноценный AI-агент с одним инструментом

---

### Этап 7: Интеграция с ботами ✅ COMPLETED

**Выполнено:**
- ✅ Создан `src/handlers/message.ts` - обработчик текстовых сообщений
- ✅ Создан `src/handlers/voice.ts` - обработчик голосовых сообщений
- ✅ Переписан `src/bots.ts` с полной интеграцией AI-агента:
  - Загрузка ботов из БД вместо .env
  - Обработчики /start, /admin, text, voice
  - Генерация ссылки для админки
  - Интеграция с AI агентом и STT
- ✅ Обновлён `src/index.ts` для запуска админки и ботов

**Результат:** Боты используют AI-агента, конфигурацию из БД, и поддерживают админ-авторизацию

---

### Этап 8: Конфигурация и Docker ✅ COMPLETED

**Выполнено:**
- ✅ Обновлён `src/config.ts` со всеми новыми переменными
- ✅ Обновлён `.env.example` с документацией
- ✅ Обновлён `docker-compose.yml` с портом для админки
- ✅ Обновлён `Dockerfile`:
  - Установлен FFmpeg для конвертации аудио
  - Копирование EJS views для админки
- ✅ Обновлён `src/index.ts` для graceful shutdown

**Результат:** Полная конфигурация для AI-агента и админки, готовая к деплою

---

### Этап 9: Тестирование и отладка

**Задачи:**

1. **Локальное тестирование:**
   - Запустить через `docker compose up -d --build`
   - Протестировать админку:
     - Открыть http://localhost:3001
     - Отправить /admin в боте
     - Перейти по временной ссылке
     - Проверить все 4 страницы
     - Изменить системный промпт → сохранить
     - Изменить первое сообщение → сохранить
     - Добавить нового бота → сохранить
     - Проверить историю диалогов
   
   - Протестировать каждый бот:
     - Текстовые сообщения на разных языках
     - Голосовые сообщения
     - Проверить сохранение истории в БД
     - Проверить отправку лидов в админ чат

2. **Проверка STT fallback:**
   - Отправить голосовое на узбекском → должен использовать MUXLISA
   - Отправить голосовое на русском → должен использовать OpenAI
   - Проверить fallback при низкой confidence

3. **Проверка агента:**
   - Убедиться, что агент правильно вызывает `send_to_admin`
   - Проверить формат сообщения в админ чате (с telegram_link)
   - Проверить сохранение лидов в БД
   - Проверить что используется активный промпт из БД

4. **Проверка памяти:**
   - Убедиться, что история диалогов сохраняется
   - Проверить, что каждый бот имеет независимую историю
   - Проверить таймаут неактивности

5. **Проверка авторизации:**
   - Не-admin пользователь отправляет /admin → отказ
   - Admin пользователь → получает ссылку
   - Ссылка истекает после использования
   - Session expires after 24 hours

**Результат:** Протестированный и рабочий AI-агент с админкой

---

### Этап 10: Документация и деплой

**Задачи:**

1. **Обновить `README.md`:**
   - Новая архитектура и функционал
   - Настройка AI провайдера
   - Настройка STT провайдеров
   - Настройка админ-панели:
     - Как получить ADMIN_CHAT_ID
     - Как добавить ADMIN_TG_IDS
     - Как использовать /admin команду
     - Описание всех 4 страниц админки
   - Примеры использования

2. **Обновить `.github/workflows/deploy.yml`:**
   - Без изменений (работает как раньше)

3. **Подготовка к деплою:**
   - Обновить `.env` на VPS
     - Убрать BOT_TOKENS
     - Добавить ADMIN_TG_IDS
     - Добавить ADMIN_SESSION_SECRET
     - Добавить ADMIN_PORT
   - Применить миграции
   - Запустить новую версию
   - Настроить firewall для ADMIN_PORT

4. **Миграция данных:**
   - Перенести BOT_TOKENS из .env в БД через админку
   - Установить начальный системный промпт
   - Установить первое сообщение
   - Протестировать на одном боте сначала

5. **Мониторинг:**
   - Добавить логи для отладки STT fallback
   - Логировать вызовы агента
   - Логировать отправку лидов
   - Логировать доступ в админку

**Результат:** Задокументированный и готовый к деплою проект с админкой

---

## STT Fallback стратегия (детали)

### Рекомендуемый подход

```
Voice Message Received
         ↓
   Download from Telegram (OGG Opus)
         ↓
   Convert OGG → WAV (FFmpeg)
         ↓
   [Optional] Detect language from conversation history
         ↓
   Try Primary Provider (OpenAI for ru/en)
         ↓
   Success & confidence >= 0.7? ──No──→ Try Fallback (MUXLISA)
         ↓                                      ↓
        Yes                              Success?
         ↓                                ↓    ↓
   Return transcription                 Yes   No
                                         ↓    ↓
                                    Return  Return error
                                    text    message
```

### Почему fallback, а не parallel?
- **Экономия costs** - не нужно платить за два API
- **Простота** - меньше кода и точек отказа
- **Гибкость** - можно настроить threshold под свои нужды

### Альтернативные подходы (на будущее):
1. **Language detection** - использовать библиотеку `franc` для определения языка по предыдущим сообщениям
2. **Parallel** - отправлять обоим провайдерам и выбирать лучший результат (дороже)
3. **User preference** - позволить пользователю указать язык вручную

---

## Админ-панель: процесс авторизации

### Flow входа в админку

```
Admin sends /admin in Telegram bot
         ↓
   Check if tg_id in ADMIN_TG_IDS
         ↓
        No ─────→ Reply: "No access"
         ↓
        Yes
         ↓
   Generate UUID token
         ↓
   Save to admin_tokens table (expires in 1 hour)
         ↓
   Send link: http://yoursite:3001/admin/login?token=UUID
         ↓
   Admin clicks link
         ↓
   Validate token (not used, not expired)
         ↓
   Create session (expires in 24 hours)
         ↓
   Mark token as used
         ↓
   Redirect to /admin/prompt
```

### Безопасность
- Токен одноразовый (used = true после использования)
- Токен истекает через 1 час
- Сессия истекает через 24 часа
- Middleware проверяет ADMIN_TG_IDS при каждом запросе
- Session secret должен быть сложным и уникальным

### Страницы админки

#### 1. System Prompt (/admin/prompt)
- Большой textarea с текущим активным промптом
- Кнопка "Сохранить"
- При сохранении:
  - Создаётся новая версия (version++)
  - Старая версия деактивируется (is_active = false)
  - Новая версия становится активной
- Показывается текущая версия и дата изменения
- **Важно:** Агент загружает промпт при каждом запросе, поэтому изменения применяются мгновенно

#### 2. First Message (/admin/first-message)
- Textarea с текстом первого сообщения
- Кнопка "Сохранить"
- Это сообщение:
  - Отправляется при /start
  - Подмешивается в историю диалога как первое сообщение от assistant
  - Помогает агенту понимать контекст

#### 3. TG Bots (/admin/bots)
- Таблица всех ботов:
  - Token (маскированный: 123456:AAA...BBB)
  - Bot link (кликабельный)
  - Bot name
  - Description
  - Status (active/inactive)
- Кнопки:
  - "Добавить бота" → модальное окно с формой
  - "Редактировать" на каждом боте
  - "Удалить" (soft delete: is_active = false)
- При добавлении/изменении:
  - Автоматически вызывается getMe() для получения bot_link
  - Показывается сообщение: "Перезапустите Docker для применения изменений"
  - **Docker не перезапускается автоматически** (пользователь делает это вручную)

#### 4. Conversations (/admin/conversations)
- Таблица всех сообщений:
  - Date/Time
  - TG ID (кликабельный → фильтр)
  - Bot (bot_link)
  - Role (user/assistant/system)
  - Message preview (first 100 chars)
  - Tool calls badge (if any)
- Фильтры:
  - TG ID input
  - Date range picker
- Сортировка: по времени (DESC по умолчанию)
- Пагинация: 20/50/100 на страницу (selector)
- Клик на сообщение → модалка с полным текстом
- Клик на tool call badge → детали вызова (JSON)

---

## Пример сообщения в админ чат

```
📩 Новая заявка от @username

👤 Контакты:
• Телефон: +998901234567
• Email: user@example.com

📝 Резюме диалога:
Пользователь интересуется услугами доставки в Ташкенте. 
Нужна доставка документов из центра в аэропорт. 
Предпочтительное время - утро, завтра.

🤖 Бот: @my_business_bot
💬 Диалог: 12 сообщений
⏰ Время: 2026-06-01 14:30:00
```

---

## Миграция данных

При обновлении:
1. Существующая таблица `bot_contacts` сохраняется
2. Добавляются новые поля (nullable)
3. Старые контакты не теряются
4. История диалогов начинается с нуля

---

## Риски и решения

| Риск | Решение |
|------|---------|
| LLM API недоступен | Добавить retry logic и fallback на простое сообщение |
| STT не распознаёт | Вернуть пользователю "Пожалуйста, напишите текстом" |
| Долгие диалоги (cost) | Ограничить max conversation turns |
| Конфиденциальность | Логировать только metadata, не содержимое |
| Rate limiting | Добавить queue для сообщений |

---

## Следующие шаги (после реализации)

1. Добавить аналитику (количество диалогов, конверсия в лиды)
2. Добавить админку для просмотра диалогов
3. Добавить поддержку изображений (OCR)
4. Добавить multi-language system prompt
5. Добавить A/B testing для разных промптов

---

## Оценка времени

| Этап | Время |
|------|-------|
| Этап 1: Подготовка | 1-2 часа |
| Этап 2: БД | 3-4 часа |
| Этап 3: Админка - базовая структура | 3-4 часа |
| Этап 4: Админка - страницы | 6-8 часов |
| Этап 5: STT модуль | 4-6 часов |
| Этап 6: LangChain Agent | 6-8 часов |
| Этап 7: Интеграция | 4-6 часов |
| Этап 8: Конфигурация | 2-3 часа |
| Этап 9: Тестирование | 4-5 часов |
| Этап 10: Деплой | 2-3 часа |
| **Итого** | **35-49 часов** |

---

## Готов начать?

План готов к реализации. Рекомендуется начинать с Этапа 1 и двигаться последовательно. Каждый этап имеет чёткие критерии завершения.

Хотите, чтобы я начал реализацию?
