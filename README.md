# URL Shortener

MVP сервиса сокращения ссылок с аналитикой переходов.

## Стек

- **Backend:** Node.js, Express, TypeScript, Zod
- **Database:** PostgreSQL
- **Cache:** Redis
- **Frontend:** React + TypeScript + Vite
- **Инфраструктура:** Docker, docker-compose

## Архитектура

Слоистая архитектура: контроллеры → сервисы → репозитории.

### Как работает кеширование

- При **первом** переходе по короткой ссылке (`GET /:shortCode`) backend идёт в PostgreSQL, читает `original_url`, кладёт в Redis с TTL 1 час и увеличивает счётчик кликов **в Redis** (не в БД).
- При **повторных** переходах backend отдаёт URL прямо из Redis и увеличивает счётчик **в Redis**. PostgreSQL не трогается.
- Раз в 30 секунд фоновый процесс сливает накопленные счётчики из Redis в PostgreSQL одним `UPDATE` на код.

Это означает, что поле `clicks` в PostgreSQL может отставать от реального значения до 30 секунд, но API статистики (`GET /api/stats/:shortCode`) показывает актуальное число: `clicks из БД + буфер из Redis`.

### Ограничения и компромиссы

- **Счётчик кликов может отставать от реального значения до 30 секунд** — буфер сбрасывается в PostgreSQL по таймеру.
- **`getStats` read-only** — GET-запрос не пишет ни в БД, ни в Redis. Значение формируется как `clicks из БД` + `буфер из Redis`.
- **Узкое окно гонки в `getStats`**: если flush сработает ровно между двумя чтениями (БД и Redis), возможно кратковременное задвоение. Окно — миллисекунды, flush идёт раз в 30 секунд. Для MVP это допустимо; в продакшене решалось бы через Lua-скрипт в Redis или транзакцию с блокировкой.
- **`flushClicksToDb` использует `GETDEL`** — атомарную операцию Redis. Если процесс упадёт после `GETDEL`, но до `UPDATE` в БД, клики за один интервал (≤30 сек) потеряются. При ошибке БД буфер восстанавливается через `INCRBY`.
- **`cacheScan` использует `SCAN`**, а не `KEYS` — не блокирует Redis при большом количестве ключей.
- **Graceful shutdown**: `SIGTERM`/`SIGINT` останавливают таймер flush, делают финальный сброс буфера и закрывают соединения с БД и Redis.

### Защита от циклических редиректов

Перед сохранением ссылки проверяется, не ведёт ли `originalUrl` на наш собственный домен (`BASE_URL`). Если да — возвращается 400. Это исключает ситуацию, когда переход по короткой ссылке снова попадает в наш редирект.

## Запуск через Docker

```bash
docker-compose up --build
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000

## Локальный запуск

### 1. Поднять PostgreSQL и Redis

```bash
docker-compose up -d postgres redis
```

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Тесты

```bash
cd backend
npm test
```

## Примеры API

### Создать короткую ссылку

```bash
curl -X POST http://localhost:3000/api/shorten \
  -H 'Content-Type: application/json' \
  -d '{"originalUrl":"https://example.com/very/long/path"}'
```

Ответ:

```json
{ "shortCode": "aB3xY9", "shortUrl": "http://localhost:3000/aB3xY9" }
```

### Перейти по короткой ссылке

```bash
curl -L http://localhost:3000/aB3xY9
```

### Получить статистику

```bash
curl http://localhost:3000/api/stats/aB3xY9
```

Ответ:

```json
{
  "originalUrl": "https://example.com/very/long/path",
  "shortCode": "aB3xY9",
  "clicks": 5,
  "createdAt": "2024-01-01T12:00:00.000Z"
}
```

### Удалить ссылку

```bash
curl -X DELETE http://localhost:3000/api/urls/aB3xY9
```

## Переменные окружения

| Переменная | Описание | Пример |
|---|---|---|
| `PORT` | Порт backend | `3000` |
| `PGHOST` | Хост PostgreSQL | `localhost` |
| `PGPORT` | Порт PostgreSQL | `5432` |
| `PGUSER` | Пользователь БД | `postgres` |
| `PGPASSWORD` | Пароль БД | `postgres` |
| `PGDATABASE` | Имя БД | `url_shortener` |
| `REDIS_HOST` | Хост Redis | `localhost` |
| `REDIS_PORT` | Порт Redis | `6379` |
| `REDIS_TTL` | TTL кеша (сек) | `3600` |
| `BASE_URL` | Базовый URL для коротких ссылок | `http://localhost:3000` |

## Реализованные фичи

- ✅ Валидация URL через Zod
- ✅ Генерация 6-символьного кода с обработкой коллизий через `UNIQUE` + retry
- ✅ Кеширование в Redis (TTL 1 час) с буферизацией счётчика кликов
- ✅ Защита от циклических редиректов
- ✅ Логирование запросов (morgan)
- ✅ Разделение ошибок (400/404/500)
- ✅ Базовые тесты (Jest + Supertest), включая тест кеша и валидации
- ✅ Docker-compose