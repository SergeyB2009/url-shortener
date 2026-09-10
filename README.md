# URL Shortener

MVP сервиса сокращения ссылок с аналитикой переходов.

## Стек

- **Backend:** Node.js, Express, TypeScript, Zod
- **Database:** PostgreSQL
- **Cache:** Redis
- **Frontend:** React + TypeScript + Vite
- **Инфраструктура:** Docker, docker-compose

## Архитектура

Слоистая архитектура: контроллеры → сервисы → репозитории. Кеширование в Redis с TTL 1 час.

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
- ✅ Генерация 6-символьного кода с проверкой коллизий
- ✅ Кеширование в Redis (TTL 1 час)
- ✅ Инкремент счётчика переходов
- ✅ Защита от циклических редиректов
- ✅ Логирование запросов (morgan)
- ✅ Обработка ошибок (400/404/500)
- ✅ Базовые тесты (Jest + Supertest)
- ✅ Docker-compose