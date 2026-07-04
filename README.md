# Система учёта и склада — боевая версия (Vite + React)

Каркас Этапа 1: вход через Supabase, экраны (главная, товары, движения), роли по логину,
серверная функция Люси (`/api/lucy`) с ключами под капотом. Деплой — Vercel.

## Как запустить (через веб, без локалки)

### 1. Залить в GitHub
Создай репозиторий и загрузи все файлы этой папки (кнопка **Add file → Upload files**, можно перетащить всю папку).

### 2. Импортировать в Vercel
- vercel.com → **Add New → Project** → выбери свой репозиторий → **Import**.
- Framework Preset определится как **Vite** автоматически. Нажми **Deploy** (первый деплой может упасть без env — это ок, добавим переменные и передеплоим).

### 3. Переменные окружения (Vercel → Project → Settings → Environment Variables)
Клиентские (публичные):
- `VITE_SUPABASE_URL` — Project URL из Supabase
- `VITE_SUPABASE_ANON_KEY` — anon public key из Supabase

Серверные (секретные, БЕЗ префикса VITE_):
- `GEMINI_API_KEY` — ключ Google AI Studio (для Люси)
- `GROQ_API_KEY` — ключ console.groq.com (запасной мозг)
- `SUPABASE_SERVICE_ROLE_KEY` — service_role key из Supabase (понадобится позже для записи актов)

После добавления — **Deployments → Redeploy**.

### 4. Первый пользователь и роль admin
- Supabase → Authentication → Add user (email + пароль). При первом входе автоматически создастся профиль с ролью `employee`.
- Чтобы сделать себя админом, в Supabase → SQL Editor выполни:
  ```sql
  update profiles set role = 'admin' where email = 'ТВОЙ_EMAIL';
  ```

## Что дальше (следующие слои)
- RLS-политики по ролям/филиалам
- Полноценная Люси в интерфейсе (голос, function calling через /api/lucy)
- Облачный слух (STT) и офлайн-Whisper
- Акты (формирование, подпись, PDF, нумерация)
