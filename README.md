# Fleet AI Dashboard — стартовый скелет

Дашборд: карта траков (данные из Samsara) + деталка по клику + чат с ИИ-агентом
поверх тех же данных. Спроектирован так, чтобы локальный запуск сегодня
переехал на хостинг позже без переписывания кода — единственное, что меняется,
это значения в `.env`.

## Почему так спроектировано (важно понимать, не только копировать)

- **Вся конфигурация — через переменные окружения**, нигде в коде нет
  захардкоженных `localhost`. `app/config.py` — единственное место, которое
  читает `.env`. Когда переедете на хостинг, меняете `DATABASE_URL` на адрес
  managed Postgres и `ALLOWED_ORIGINS`/`NEXT_PUBLIC_API_URL` на реальные домены
  — код не трогаете вообще.
- **Агент никогда не стучится в Samsara напрямую во время диалога.**
  Отдельный фоновый job (`sync_job.py`) периодически подтягивает данные из
  Samsara в вашу же Postgres. Чат читает только из своей базы — быстро и не
  зависит от лимитов/аптайма Samsara в момент разговора.
- **Инструменты агента (`agent/tools.py`) — единственное место**, где описано,
  что агент умеет делать. Добавляя новую функцию (SMS, поиск сервиса и т.д.),
  трогаете только этот файл и роутер чата.
- **История чата хранится в БД по `user_id`** — контекст разных пользователей
  физически не пересекается (см. `chat.py`).

## Структура проекта

```
trucking-ai-dashboard/
├── docker-compose.yml       # локальная Postgres+pgvector
├── .env.example              # шаблон конфига backend
├── backend/
│   ├── requirements.txt
│   └── app/
│       ├── main.py            # точка входа FastAPI
│       ├── config.py          # единственное место чтения env
│       ├── database.py
│       ├── models.py          # Vehicle, VehicleEvent, ChatMessage
│       ├── samsara_client.py  # весь код специфичный для Samsara — здесь и только здесь
│       ├── sync_job.py        # фоновая синхронизация Samsara → своя БД
│       ├── routers/
│       │   ├── vehicles.py    # GET /vehicles — то, что рисует карта
│       │   └── chat.py        # POST /chat — агент с tool use
│       └── agent/
│           ├── tools.py       # что агент умеет делать
│           └── prompts.py     # системный промпт
└── frontend/
    ├── .env.local.example
    ├── app/page.tsx            # главная страница: карта + деталка + чат
    └── components/
        ├── TruckMap.tsx
        ├── TruckDetail.tsx
        └── ChatWidget.tsx
```

## Запуск локально — по шагам

### 1. База данных
```bash
docker compose up -d
```

### 2. Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp ../.env.example ../.env
# откройте .env и впишите реальные ANTHROPIC_API_KEY и SAMSARA_API_TOKEN

uvicorn app.main:app --reload --port 8000
```
Проверка: откройте `http://localhost:8000/docs` — должна открыться Swagger-документация
со всеми эндпоинтами (`/vehicles`, `/chat`, `/health`).

### 3. Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```
Откройте `http://localhost:3000` — карта, деталка по клику на трак, чат справа.

## Что нужно донастроить под реальный аккаунт Samsara

`app/samsara_client.py` написан по общей структуре Samsara API, но **точные
пути эндпоинтов и поля в ответах нужно сверить с актуальной документацией**
(https://developers.samsara.com) под ваш конкретный аккаунт и версию API —
это единственный файл, который может потребовать правок под реальные данные.
Если у Samsara есть sandbox/демо-аккаунт — начните с него, чтобы не трогать
продовые данные компании во время разработки.

## Как это едет на хостинг позже (когда будете готовы)

1. Поднимаете managed Postgres у хостинг-провайдера (Railway/Render и т.п.),
   меняете `DATABASE_URL` в `.env` на его адрес.
2. Деплоите папку `backend/` как отдельный сервис (Railway/Render видят
   `requirements.txt` и `uvicorn` автоматически либо через простой Dockerfile).
3. Деплоите `frontend/` как отдельный сервис (Vercel — нативно для Next.js,
   либо тот же Railway/Render), выставляете `NEXT_PUBLIC_API_URL` на адрес
   задеплоенного backend.
4. В backend `.env` на хостинге прописываете реальный домен фронтенда в
   `ALLOWED_ORIGINS`.

Ни одна строчка кода при этом не меняется — только значения в `.env` на
хостинг-платформе.

## Дальнейшие шаги (после того как это заработало)

- Добавить инструмент `send_sms` в `agent/tools.py` + роутер для уведомлений
- Добавить RAG (pgvector уже подключён) для базы знаний компании
- Заменить `Base.metadata.create_all` на нормальные миграции (Alembic) перед
  тем как база станет боевой
- Добавить реальную авторизацию вместо `USER_ID = "demo-user"` в чате
