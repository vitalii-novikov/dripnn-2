# Модель данных

Пять таблиц: `wardrobes`, `floor_map_revisions`, `zones`, `items`, `tier_events`.
Полный DDL — в плане в `.claude/PRPs/plans/`.

## Инварианты в базе, а не в коде

**Владение — составные FK.** `owner_id` продублирован на каждой таблице, связи
идут по `(id, owner_id)`. Вещь не может сослаться на чужую зону.

**Append-only — гранты.** У `tier_events` есть `SELECT` и `INSERT`; `UPDATE` и
`DELETE` отозваны. Колоночный грант на `INSERT` не включает `id` и `created_at` —
клиентские часы до порядка событий не дотянутся.

**Пути валидирует триггер:** `{owner_id}/items/{item_id}/photo.webp` и
`{owner_id}/floor-maps/{revision_id}/photo.webp`. Бакет приватный; upsert и
удаление невозможны, потому что политик на UPDATE и DELETE нет (см. D12 —
гранты здесь ничего не решают). Прямой DELETE дополнительно отбивает
storage-триггер `protect_delete`.

**FK вещи на зону — `on delete set null (zone_id)`** (список колонок, Postgres
15+). Без списка Postgres занулял бы и `owner_id`, который `not null`, и удаление
зоны падало бы.

**Одна активная карта** — partial unique index по
`(owner_id) where retired_at is null`. Замена фото ретаит ревизию и обнуляет
геометрию зон; сами зоны и вещи выживают.

## Текущий tier

Не хранится полем. `item_current_tiers` (`security_invoker`, `security_barrier`)
берёт `distinct on (item_id)` с порядком `created_at desc, id desc`. Тай-брейкер
по `id` не косметика: без него при равных таймстемпах порядок недетерминирован.

`item_catalog` джойнит его через **`LEFT JOIN`**. `current_tier is null` — это
«не оценено», отдельное ведро в статистике: иначе неоценённые вещи исчезнут.

## Зоны

Имя обязательно, геометрия (`x, y, w, h`, `map_revision_id`) — nullable: либо её
нет целиком, либо она валидна целиком (см. D6).

## Статистика

Один запрос с проекцией, не два `count`; суммы по зонам и по tier обязаны
сходиться с итогом. Отсев — **только по архиву**: `archived / (active + archived)`.
