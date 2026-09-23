# Implementation Plan: Floor Map Wardrobe

> Источник: `.claude/PRPs/prds/floor-map-wardrobe.prd.md`
> Синтез: Claude (sovereign writer) + Codex (бэкенд) + Antigravity (фронтенд)
> Дата: 2026-09-23

## Task Type

- [x] Fullstack (Codex — бэкенд/БД/RLS, Antigravity — экраны/взаимодействие)

---

## 0. Что изменилось относительно PRD

Пять правок, каждая — следствие анализа, а не вкусовщины.

| # | PRD говорил | План говорит | Почему |
|---|---|---|---|
| 1 | Фазы 2→3→4: сначала карта, потом вещи | Сначала **ingestion на реальном iPhone**, карта — после | Обе модели независимо: узкое место не карта, а загрузка. Safari убивает вкладку при параллельном декоде 20 фото по 12 Мп (~1 ГБ RAM). Строить редактор зон до этого гейта — строить поверх непроверенного фундамента |
| 2 | Зона = прямоугольник с координатами | Зона = **имя** (обязательно) + **геометрия** (nullable, позже) | Развязывает ввод вещей от карты. 8 зон по имени создаются за минуту → вещи сразу падают в правильную кучку → рамки рисуются мышью потом. Иначе 150 операций «перенести вещь» |
| 3 | Bottom sheet на вещь с пикером | **Спид-рейтер** во весь экран, автопереход по тапу | 150 вещей × (2 тапа + 2 анимации) = 450 тапов и ~75 сек созерцания анимаций. Один тап с автопереходом — 150 тапов |
| 4 | `wardrobes.floor_photo_url`, перерисовка зон с нуля | `floor_map_revisions` с частичным unique-индексом на активную ревизию | Замена фото пола — разрушающая операция. Ревизия делает её транзакционной и тестируемой, а не «ну как-нибудь» |
| 5 | Публичный доступ = «одна RLS-политика» | Приватный бакет + серверная проекция по allowlist + короткоживущие подписи | Публичный бакет делает `is_public=false` фикцией: URL фото остаётся рабочим навсегда |

**Принятые решения владельца (не переоткрывать):**

- **D1. Цвета нет.** Ни колонки, ни тега, ни автоопределения. Следствие, которое надо назвать вслух: `/stats` отвечает «сколько вещей в каждой кучке» и «сколько в каждом tier», но **не отвечает на вопрос из Problem Statement про перекос в белое**. Метрика PRD «ответ на куда перекос» переопределяется как «самая крупная кучка по типу вещей».
- **D2. Приватный бакет + подписанные URL.**
- **D3. Тесты по глобальному правилу: 80% минимум, TDD, unit + integration + e2e.** Срок переезда — мягкий ориентир, не гейт. Следствие: primary-метрика PRD «≥40% отсеяно к дате переезда» может не измериться в срок; это принято.
- **D4. Редактор зон — только десктоп** (мышь, рамки). Тач-версия — после переезда.

---

## 1. Технические решения

**Стек** (версии проверены в npm на 2026-09-23):

| Пакет | Версия | Примечание |
|---|---|---|
| next | 16.3.6 | App Router. `params` — Promise, обязателен `await params` |
| react / react-dom | 19.3.0 | |
| @supabase/supabase-js | 2.117.0 | |
| @supabase/ssr | 0.12.7 | Паттерн обновления сессии обязателен |
| typescript | 5.x | `strict: true` |
| vitest + @vitest/coverage-v8 | latest | Порог 80% глобально |
| @playwright/test | latest | Проекты: desktop chromium + **mobile WebKit** |

**Next.js 16: `middleware.ts` переименован в `proxy.ts`**, экспортируемая функция — `proxy`, рантайм только `nodejs` (edge не поддерживается). Документация Supabase всё ещё показывает `middleware.ts` — её надо адаптировать, иначе сессия не обновляется и пользователь случайно разлогинивается.

**Ключевые инварианты, вынесенные в БД, а не в код:**

1. `owner_id` денормализован на каждую таблицу, связи — **составные FK** `(id, owner_id)`. Вещь физически не может сослаться на чужую зону.
2. `tier_events` append-only **на уровне грантов**: `SELECT` + `INSERT` есть, `UPDATE`/`DELETE` отозваны. Клиент не может передать ни `id`, ни `created_at` — колоночный грант на INSERT их не включает.
3. Текущий tier — вычисляемое представление, порядок `created_at DESC, id DESC`. Без тай-брейкера по `id` результат недетерминирован при одинаковых таймстемпах.
4. Пути в Storage валидируются триггером: `{owner_id}/items/{item_id}/photo.webp`. Путь, не принадлежащий владельцу вещи, отклоняется базой.
5. Активная ревизия карты пола — одна на владельца, через partial unique index.

**Что осознанно нарушает правило иммутабельности:** `items.archived_at` — изменяемый флаг. Событийная модель отсева (`item_disposition_events`) была бы консистентнее, но удваивает всю проблематику «текущего состояния» ради фичи, которая нужна один раз при переезде. Принято с открытыми глазами; в плане это единственное место, где состояние перезаписывается.

---

## 2. Схема БД

```sql
-- 0001_core_tables.sql
create table public.wardrobes (
  owner_id   uuid primary key references auth.users(id) on delete cascade,
  slug       text not null unique,
  title      text not null default 'Мой гардероб',
  is_public  boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  check (slug ~ '^[a-z0-9][a-z0-9-]{2,49}$'),
  check (length(trim(title)) between 1 and 120)
);

create table public.floor_map_revisions (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.wardrobes(owner_id) on delete cascade,
  photo_path text not null,
  width_px   integer not null check (width_px > 0),
  height_px  integer not null check (height_px > 0),
  created_at timestamptz not null default clock_timestamp(),
  retired_at timestamptz,
  unique (id, owner_id),
  check (length(photo_path) between 1 and 512)
);

-- ровно одна активная карта на владельца
create unique index one_active_floor_map_per_owner
  on public.floor_map_revisions (owner_id) where retired_at is null;

-- Зона: имя обязательно, геометрия — nullable и появляется позже (см. правку #2)
create table public.zones (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.wardrobes(owner_id) on delete cascade,
  map_revision_id uuid,
  name            text not null,
  x  double precision, y double precision,
  w  double precision, h double precision,
  sort_order integer not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  unique (id, owner_id),
  foreign key (map_revision_id, owner_id)
    references public.floor_map_revisions (id, owner_id),

  check (length(trim(name)) between 1 and 80),
  -- геометрия либо отсутствует целиком, либо валидна целиком
  check (
    (x is null and y is null and w is null and h is null and map_revision_id is null)
    or (
      map_revision_id is not null
      and x >= 0 and y >= 0 and w > 0 and h > 0
      and x + w <= 1 and y + h <= 1
    )
  )
);
create index zones_owner_sort_idx on public.zones (owner_id, sort_order, id);

create table public.items (
  id           uuid primary key,            -- генерируется клиентом: путь в Storage стабилен между ретраями
  owner_id     uuid not null references public.wardrobes(owner_id) on delete cascade,
  zone_id      uuid,
  display_name text,
  note         text,
  photo_path   text not null,
  cutout_path  text,
  created_at   timestamptz not null default clock_timestamp(),
  updated_at   timestamptz not null default clock_timestamp(),
  archived_at  timestamptz,

  unique (id, owner_id),
  foreign key (zone_id, owner_id) references public.zones (id, owner_id) on delete set null,
  check (display_name is null or length(display_name) <= 120),
  check (note is null or length(note) <= 2000),
  check (length(photo_path) between 1 and 512),
  check (cutout_path is null or length(cutout_path) between 1 and 512)
);
create index items_owner_zone_active_idx
  on public.items (owner_id, zone_id) where archived_at is null;

create table public.tier_events (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null,
  owner_id   uuid not null default auth.uid(),
  tier       text not null check (tier in ('S','A','B','C','D')),
  note       text check (note is null or length(note) <= 1000),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (item_id, owner_id) references public.items (id, owner_id)
);
create index tier_events_current_idx
  on public.tier_events (item_id, created_at desc, id desc);
```

Пять таблиц — ровно столько, сколько PRD обещал (Codex справедливо заметил, что перечислено было четыре).

```sql
-- 0003_views.sql
create view public.item_current_tiers
  with (security_invoker = true, security_barrier = true) as
select distinct on (te.item_id)
  te.item_id, te.owner_id, te.id as tier_event_id, te.tier, te.created_at
from public.tier_events te
order by te.item_id, te.created_at desc, te.id desc;

create view public.item_catalog
  with (security_invoker = true, security_barrier = true) as
select i.id, i.owner_id, i.zone_id, i.display_name, i.note,
       i.photo_path, i.cutout_path, i.archived_at, i.created_at,
       ct.tier as current_tier, ct.created_at as tiered_at
from public.items i
left join public.item_current_tiers ct on ct.item_id = i.id;
```

`LEFT JOIN` обязателен. `current_tier is null` — это валидное состояние «не оценено», и оно должно попадать в статистику отдельным ведром, иначе 90 неоценённых вещей просто исчезнут с `/stats`.

```sql
-- 0004_rls_grants_storage.sql (фрагмент)
revoke all on public.tier_events from anon, authenticated;
grant select on public.tier_events to authenticated;
grant insert (item_id, owner_id, tier, note) on public.tier_events to authenticated;
revoke delete on public.items from anon, authenticated;

create policy tier_events_owner_insert on public.tier_events
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.items i
                where i.id = item_id and i.owner_id = auth.uid())
  );
-- UPDATE/DELETE политик для tier_events НЕ СОЗДАЁТСЯ. Это и есть append-only.

-- Storage: приватный бакет, префикс = owner_id
-- bucket_id = 'wardrobe-private' and (storage.foldername(name))[1] = auth.uid()::text
-- только SELECT и INSERT; upsert запрещён, пути иммутабельны
```

Анонимных политик на базовые таблицы **нет ни одной**. Публичный доступ идёт только через серверную проекцию (Этап 9).

---

## 3. Этапы

Гейт этапа — это то, что доказывает готовность, а не ощущение готовности.

### Этап 0 — Исполняемый контракт проекта
**Цель:** скелет, в котором тесты и покрытие обязательны с первой фичи.
**Скоуп:** `git init` (каталог сейчас не репозиторий); Next 16 + TS strict; локальный Supabase; Vitest с порогом 80% по statements/branches/functions/lines; Playwright (chromium + mobile WebKit); pgTAP; CI: lint → typecheck → unit+coverage → `supabase db reset` + db-тесты → integration → build → e2e.
**Тесты сначала:** `CI падает при покрытии ниже 80% по веткам`; `приложение стартует на свежесброшенной БД`; `генерация типов БД не даёт диффа схемы`.
**Гейт:** чистый клон одной документированной последовательностью команд прогоняет все слои тестов и собирает прод-сборку.

### Этап 1 — Схема, RLS, граница Storage
**Цель:** владение, append-only и приватность — инварианты базы, а не договорённости.
**Скоуп:** миграции 0001–0004 выше; триггер валидации путей; триггер проверки, что зона принадлежит владельцу и лежит на активной ревизии; приватный бакет `wardrobe-private`.
**Тесты сначала (pgTAP + integration под тремя ролями: владелец / второй авторизованный / аноним):**
- `второй авторизованный не видит вещи владельца`
- `аноним не читает ни одну базовую таблицу`
- `вещь не может сослаться на чужую зону`
- `прямоугольник зоны отвергает координаты за пределами 0..1`
- `зона без геометрии допустима, зона с частичной геометрией — нет`
- `текущий tier возвращает событие с наибольшим created_at`
- `при равных created_at тай-брейкером выступает id`
- `вещь без оценок видна с current_tier = null`
- `клиент не может передать created_at события`
- `у authenticated нет привилегии UPDATE на tier_events`
- `у authenticated нет привилегии DELETE на tier_events`
- `владелец не может загрузить файл под чужим префиксом`
- `аноним не может прочитать приватный объект`

**Гейт:** все тесты зелёные после `supabase db reset`; попытка обойти приложение через PostgREST/Storage напрямую падает с ожидаемой ошибкой авторизации.

### Этап 2 — Auth и границы сервер/клиент
**Скоуп:** браузерный и серверный Supabase-клиенты; `proxy.ts` (не `middleware.ts`) с обновлением сессии; защищённый layout; service-role строго в `*.server.ts`; централизованное отображение ошибок PostgREST/Storage.
**Тесты сначала:** `защищённый маршрут редиректит анонима на логин`; `истёкший access token обновляется, cookie доезжают до ответа`; `клиентский бандл не содержит service-role ключ`.
**Гейт:** сессия переживает истечение токена и навигацию без случайных разлогинов; magic link проверен **на проде Vercel с телефона**, а не только локально.

### Этап 3 — 🚦 ГЕЙТ: реальный iPhone, 20 фото
Самый важный этап плана. До его прохождения редактор карты не начинается.

**Скоуп:** узкий `/capture/spike`, использующий **боевые** модули компрессии и очереди, а не одноразовый код.
**Тесты сначала:** `сжимает файлы строго по одному`; `переиспользует один canvas на все задания`; `закрывает каждый ImageBitmap после кодирования`; `отзывает каждый preview object URL`; `сохраняет портретную ориентацию из EXIF`; `не запускает больше трёх загрузок одновременно`; `один упавший файл не роняет остальную пачку`.
**Гейт (ручной, на личном iPhone):** 20 фото одним выбором без перезагрузки вкладки Safari, без перевёрнутых фото, без зависания UI, при падении одного файла остальные 19 доезжают. **Зафиксировать в плане фактические цифры:** медианный размер после сжатия, общее время, поведение ретрая. Оценка PRD «120 КБ на фото» — гипотеза, а не факт.

### Этап 4 — Боевая очередь загрузки
**Скоуп:** выбор зоны, включая явную «Без кучки»; стейт-машина на файл (`queued → compressing → ready → uploading → saving → done | failed`); клиентский UUID вещи, чтобы путь в Storage был стабилен между ретраями; **сначала загрузка в Storage, потом INSERT строки**; ретрай с той фазы, где упало; сводка «19 из 20» как частичный успех, а не как провал; серверный скрипт отчёта по осиротевшим объектам (удаление — отдельным явным режимом).
**Тесты сначала:** `строка вещи не вставляется до успешной загрузки объекта`; `падение загрузки сохраняет сжатый blob для ретрая`; `падение INSERT сохраняет путь объекта для ретрая только в БД`; `ретрай после падения INSERT сохраняет тот же item id и путь`; `завершение пачки не стирает упавшие записи`.
**Гейт:** повтор прогона 20 фото на боевом экране с принудительным падением одной загрузки и одного INSERT — без дублей вещей и без дублей объектов.

### Этап 5 — Галереи зон и перенос вещей
**Скоуп:** вертикальная галерея зоны; галерея «Без кучки»; подписанные URL для приватного бакета; **перенос вещи между зонами** (поднят из Could в Must — первая разбивка по кучкам будет неправильной); архивирование без жёсткого удаления.
**Тесты сначала:** `галерея зоны возвращает только активные вещи владельца`; `перенос в чужую зону падает`; `архивированная вещь уходит из активной галереи, но сохраняет историю оценок`; `ошибка подписи URL не скрывает метаданные вещи`.

### Этап 6 — Спид-рейтер и история
**Цель:** оценить ~150 вещей быстрее, чем кончится терпение.
**Скоуп:** полноэкранный экран «фото сверху, пять кнопок снизу»; один тап → `INSERT` + автопереход; предзагрузка следующих двух фото; тосты с Undo на 5 сек (Undo возвращает вещь в кадр, **не удаляя событие** — история неприкосновенна); отдельный лист истории оценок с датами; фильтры «все / зона / неоценённые».
**Доступность:** каждый tier — буква + собственная геометрическая форма (★ ◆ ● ■ ▲), не только цвет; тач-цели ≥48×48 px с зазором 8 px; `navigator.vibrate(15)` как тактильное подтверждение.
**Тесты сначала:** `пять кнопок имеют тач-цель не меньше 48px`; `каждый tier несёт уникальную форму помимо цвета`; `тап переводит к следующей вещи быстрее 50 мс`; `три оценки одной вещи создают три строки в tier_events`; `Undo возвращает вещь в кадр, не удаляя событие`.
**Гейт:** 30 вещей оценены за <60 сек на реальном iPhone без пропусков событий. **Здесь продукт впервые пригоден**: можно вводить, листать, исправлять кучки и оценивать.

### Этап 7 — Десктопный редактор карты
**Скоуп:** загрузка фото пола (создаёт ревизию с `width_px/height_px`); рисование рамок мышью; нормализация драга из любого угла; клэмп в 0..1; порог 10 px против случайных кликов; привязка рамок к **уже существующим** зонам; замена фото пола — двухшаговое подтверждение, транзакционно ретаящее старую ревизию и обнуляющее геометрию зон (сами зоны и вещи выживают); на тач-экране маршрут показывает баннер «откройте с ноутбука».
**Тесты сначала (чистая геометрия — до любого UI):** `клэмпит координаты за границами холста в 0..1`; `драг справа-налево нормализуется в положительные w/h`; `игнорирует драг меньше 10px`; `замена фото пола сохраняет вещи и обнуляет геометрию зон`.

### Этап 8 — Карта пола и сверенная статистика
**Скоуп:** главный экран — фото пола с SVG-оверлеем; счётчики на зонах; текстовый список зон как доступная альтернатива оверлею; `/stats` — всего, разбивка по зонам (включая «Без кучки»), разбивка по tier (включая «Не оценено»), прогресс отсева.
**Ловушка леттербоксинга:** контейнер жёстко получает `aspect-ratio: width_px / height_px` из ревизии карты, изображение — `w-full h-full object-cover block`, SVG — `viewBox="0 0 1000 1000"` с `preserveAspectRatio="none"` в том же боксе. Нормализованные координаты сами по себе проблему не решают — решает совпадение бокса изображения и бокса оверлея.
**Формула отсева — только архив:** `archived / (active + archived)`. Tier D — это *кандидат* на вылет, а не отсеянная вещь; складывать их в одну метрику нельзя.
**Тесты сначала:** `сумма по зонам равна общему итогу`; `сумма по tier равна общему итогу`; `неоценённые вещи посчитаны`; `вещи без кучки посчитаны`; `повторная оценка не увеличивает итог`; `статистика не содержит измерения по цвету`.
**Гейт:** на ~150 засеянных вещах (включая неоценённые и без кучки) оба независимых суммирования сходятся с отображаемым итогом.

### Этап 9 — Публичная ссылка
**Скоуп:** `/w/[slug]` read-only; переключатель `is_public`; серверная проекция через `security definer`-функцию с `set search_path = ''`, доступную **только** `service_role`; подписанные URL с TTL 60 сек; ответ с явным allowlist полей и `Cache-Control: private, no-store`.
**Честная формулировка гарантии:** после `is_public=false` следующий запрос проекции отдаёт 404 немедленно, но **уже выданный подписанный URL живёт до конца своего TTL**. Мгновенный отзыв картинок потребовал бы стриминга через проверяющий эндпоинт — в v1 не делаем, ограничиваемся 60 секундами.
**Публичный allowlist:** заголовок гардероба, фото пола, имена зон и счётчики, фото вещи, текущий tier. **Приватны по умолчанию:** заметки, история оценок, архивированные вещи, owner_id, пути в Storage.
**Тесты сначала:** `публичный ответ содержит ровно заданный набор ключей`; `ответ не содержит owner id, заметки и путь в Storage`; `приватный гардероб неотличим от несуществующего`; `аноним не может вызвать функцию проекции напрямую`; `аноним не может прочитать приватный объект`.

### Этап 10 — Закалка и релиз
**Скоуп:** e2e-сценарии целиком; фабрика фикстур (владелец, второй юзер, аноним, 150 вещей, неоценённые, история оценок); a11y-проверки; структурные логи без подписанных URL и токенов; репетиция бэкапа и восстановления БД; чек-лист деплоя.
**Гейт:** unit + database + integration + e2e зелёные вместе после свежего `supabase db reset`; полный сценарий пройден на десктопе, в mobile WebKit и на личном iPhone.

---

## 4. Зависимости этапов

```
0 ──► 1 ──► 2 ──► 3 ⛔ГЕЙТ──► 4 ──► 5 ──► 6 ──► 7 ──► 8 ──► 9 ──► 10
                             │                    ▲
Фаза 0 PRD (AI-стилизация) ──┴────────────────────┘
        (ручная, вне кода; нужна только к Этапу 7, а не к старту)
```

Побочная выгода переупорядочивания: AI-стилизация фото пола перестаёт блокировать старт. Она нужна к Этапу 7, то есть к моменту, когда вещи уже в базе.

Единственная настоящая параллель: **8 ∥ 9** (разные страницы, общий только read-путь). Этапы 3→4→5→6 строго последовательны.

---

## 5. Структура файлов

Организация по фичам. 200–400 строк на файл (максимум 800), функции <50 строк.

```
dripnn-2/
├── app/
│   ├── layout.tsx                       # только метаданные и провайдеры
│   ├── (auth)/login/{page.tsx,actions.ts}
│   ├── (app)/
│   │   ├── layout.tsx                   # аутентифицированная оболочка
│   │   ├── page.tsx                     # карта пола (главный экран)
│   │   ├── capture/page.tsx             # мобильный ввод вещей
│   │   ├── rate/page.tsx                # спид-рейтер
│   │   ├── zones/[zoneId]/page.tsx      # галерея зоны
│   │   ├── zones/unassigned/page.tsx    # вещи без кучки
│   │   ├── editor/page.tsx              # десктопный редактор (D4)
│   │   └── stats/page.tsx
│   ├── w/[slug]/page.tsx                # публичная read-only страница
│   └── api/public/[slug]/route.ts       # проекция + подписи
│
├── features/
│   ├── ingestion/                       # types, reducer, compression, upload-workers,
│   │                                    # persistence, use-ingestion-queue, capture-screen
│   ├── catalog/                         # queries, move-item, gallery, item-card
│   ├── rating/                          # queries, speed-rater, tier-controls, history-sheet
│   ├── floor-map/                       # geometry, map-viewer, zone-overlay,
│   │                                    # editor-state, rectangle-editor, replace-floor
│   ├── stats/                           # queries, aggregate, stats-view
│   └── sharing/                         # public-projection.server, response-schema
│
├── lib/
│   ├── supabase/{browser,server,service.server,session-refresh,database.types}.ts
│   ├── errors/{application-error,map-supabase-error}.ts
│   └── constants/tiers.ts               # буква + форма + класс + горячая клавиша
│
├── supabase/
│   ├── migrations/0001..0005_*.sql
│   ├── tests/database/*.sql             # pgTAP
│   └── seed.sql
│
├── tests/
│   ├── integration/                     # harness с тремя ролями + rls/storage/sharing
│   └── e2e/                             # ingestion, rating, map-editor, stats, sharing
│
├── scripts/{verify-generated-types,report-orphan-objects}.mjs
├── proxy.ts                             # Next 16: НЕ middleware.ts
├── vitest.config.ts  playwright.config.ts  next.config.ts
```

---

## 6. Псевдокод там, где ошибка дорога

### 6.1 Последовательное сжатие (защита от падения Safari)

```ts
// features/ingestion/compression.ts
const MAX_DIMENSION = 1200;   // из PRD
const QUALITY = 0.82;
const GC_YIELD_MS = 16;

class SerialCompressor {
  private canvas: HTMLCanvasElement | null = null;   // ровно один на сессию

  async compress(file: File): Promise<Blob> {
    const { canvas, ctx } = this.acquireCanvas();
    // imageOrientation: 'from-image' снимает вопрос EXIF-поворота
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const { width, height } = fitWithin(bitmap, MAX_DIMENSION);
      canvas.width = width; canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      return await toBlobOrThrow(canvas, 'image/webp', QUALITY);   // fallback: image/jpeg
    } finally {
      bitmap.close();                       // КРИТИЧНО: освободить распакованный битмап
      canvas.width = 1; canvas.height = 1;  // отпустить поверхность canvas
      await yieldToEventLoop(GC_YIELD_MS);  // дать движку собрать мусор
    }
  }
}
```

Параллелизм здесь равен единице не из осторожности, а из арифметики: 20 фото × 12 Мп × 4 байта ≈ 1 ГБ распакованных данных при лимите вкладки Safari заметно ниже.

### 6.2 Конвейер: сжатие 1, загрузка 3, сначала Storage — потом БД

```text
для каждого файла:
  itemId = uuid()                                  # клиентский, чтобы путь пережил ретрай
  path   = `${ownerId}/items/${itemId}/photo.webp`

  compressing → ready       (пропускная способность 1)
  uploading   → saving      (пропускная способность 3, upsert: false)
  saving:
     insert items(id=itemId, owner_id, zone_id, photo_path=path)
     при успехе → done
     при ошибке → failed{failedAt:'saving', path}  # ретрай не перезагружает файл
```

Порядок «сначала объект, потом строка» выбран так, чтобы база никогда не ссылалась на несуществующий файл. Обратная ошибка — осиротевший объект — безвредна и чистится скриптом-отчётом.

### 6.3 Сверка статистики

```text
zone_key = zone_id ?? 'unassigned'
tier_key = current_tier ?? 'unrated'

assert sum(ведра по зонам) == total
assert sum(ведра по tier)  == total
```

Оба утверждения обязаны выполняться при любой доле оценённых вещей. Один запрос с проекцией, а не два независимых `count` — иначе на экране окажутся два несогласованных снимка.

---

## 7. Риски и митигация

| Риск | Митигация |
|---|---|
| **Владелец сдастся на 80-й вещи** (главный риск PRD, не технический) | Этап 3 доказывает скорость ввода до того, как построен хоть один красивый экран; спид-рейтер убирает 300 анимаций; ноль обязательных полей; вещи можно вводить в зону без геометрии |
| Safari убивает вкладку на пачке фото | Последовательное сжатие, один canvas, `bitmap.close()`, ручной гейт на личном телефоне |
| EXIF-поворот: снятое камерой и выбранное из галереи ведут себя по-разному | `createImageBitmap(..., {imageOrientation:'from-image'})` + фикстуры портрет/ландшафт + 5 реальных снимков |
| Оверлей зон едет относительно фото на другой ширине | Бокс изображения и бокс SVG — один и тот же; `aspect-ratio` из `width_px/height_px` ревизии; чистые тесты геометрии до UI |
| RLS выглядит корректной, потому что тестировалась под админом | Каждый тест политики прогоняется под тремя ролями: владелец, второй авторизованный, аноним |
| Публичная проекция протечёт при добавлении колонки | Тест на точный набор ключей ответа, а не на отсутствие конкретных полей |
| `is_public=false` не отзывает уже выданный URL | TTL 60 сек + гарантия сформулирована явно, а не подразумевается |
| Неоценённые вещи молча выпадают из статистики | `LEFT JOIN`, явное ведро `unrated`, два инварианта сверки |
| Ретрай плодит дубли | Клиентский UUID вещи → стабильный путь; `upsert: false`; тест с принудительным падением INSERT |
| Замена фото пола осиротит зоны | Транзакционное ретайрование ревизии + двухшаговое подтверждение + pgTAP-тест до реализации UI |
| service-role ключ утечёт в бандл | Только в `*.server.ts`; тест границы импорта + скан бандла |
| Покрытие растёт, авторизация остаётся дырявой | pgTAP и per-role integration — отдельные обязательные джобы CI, не засчитываются процентом покрытия |
| Переезд наступит раньше готовности | Принято (D3). После Этапа 6 продукт уже пригоден; отсев можно делать, глядя на C и D в галерее |

---

## 8. Открытые вопросы, не блокирующие старт

- Реальное число вещей неизвестно (~150 — допущение). Выяснится на Этапе 4 и само по себе является результатом продукта.
- Реальный размер фото после сжатия — гипотеза. Измеряется на Этапе 3, цифра подставляется обратно в этот план.
- Правильность разбиения на 8 кучек проверяется только практикой. Перенос вещи между зонами уже в Must именно поэтому.
- Вопрос PRD «куда перекос» в v1 закрывается только по типам вещей (D1). Если после переезда захочется цвета — дешевле всего добавить `items.lightness` и считать её на канвасе в момент сжатия, это не потребует переразметки.

---

## SESSION_ID (для `/ecc:multi-execute`)

- **CODEX_SESSION (анализ):** `01a0cd53-e9b8-7942-973b-871a7547cbfe`
- **CODEX_SESSION (план):** `01a0cd5d-7bb7-70c0-9cae-6c12b1021cd1`
- **ANTIGRAVITY_SESSION:** не выдан — `agy` вызывался напрямую, минуя обёртку (см. примечание ниже)

> **Примечание по инструментам.** `~/.claude/bin/codeagent-wrapper` не отработал ни на одном бэкенде:
> `codex` требует `--skip-git-repo-check` вне git-репозитория, а у `agy` порядок флагов
> `--print --mode plan` приводит к тому, что CLI принимает `--mode` за текст промпта.
> Обе модели вызваны напрямую; обёртку стоит починить до следующего multi-запуска.
