-- Владение денормализовано: owner_id лежит на каждой таблице, а все связи идут
-- составными внешними ключами (id, owner_id). Вещь физически не может сослаться
-- на чужую зону — это инвариант базы, а не договорённость кода.

create table public.wardrobes (
  owner_id   uuid primary key references auth.users (id) on delete cascade,
  slug       text not null unique,
  title      text not null default 'Мой гардероб',
  is_public  boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint wardrobes_slug_check
    check (slug ~ '^[a-z0-9][a-z0-9-]{2,49}$'),
  constraint wardrobes_title_check
    check (length(trim(title)) between 1 and 120)
);

create table public.floor_map_revisions (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.wardrobes (owner_id) on delete cascade,
  photo_path text not null,
  width_px   integer not null,
  height_px  integer not null,
  created_at timestamptz not null default clock_timestamp(),
  retired_at timestamptz,

  unique (id, owner_id),

  constraint floor_map_revisions_width_check  check (width_px > 0),
  constraint floor_map_revisions_height_check check (height_px > 0),
  constraint floor_map_revisions_photo_path_check
    check (length(photo_path) between 1 and 512),
  constraint floor_map_revisions_retired_at_check
    check (retired_at is null or retired_at >= created_at)
);

-- Ровно одна активная карта на владельца. Замена фото пола ретаит предыдущую
-- ревизию в той же транзакции, поэтому индекс частичный, а не полный.
create unique index one_active_floor_map_per_owner
  on public.floor_map_revisions (owner_id)
  where retired_at is null;

-- Зона: имя обязательно, геометрия появляется позже (D6). Это развязывает ввод
-- вещей от редактора карты — иначе первые 150 вещей пришлось бы переносить руками.
create table public.zones (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.wardrobes (owner_id) on delete cascade,
  map_revision_id uuid,
  name            text not null,
  x               double precision,
  y               double precision,
  w               double precision,
  h               double precision,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default clock_timestamp(),
  updated_at      timestamptz not null default clock_timestamp(),

  unique (id, owner_id),

  constraint zones_map_revision_fk
    foreign key (map_revision_id, owner_id)
    references public.floor_map_revisions (id, owner_id),

  constraint zones_name_check
    check (length(trim(name)) between 1 and 80),

  -- Геометрия либо отсутствует целиком, либо валидна целиком. Частичная
  -- геометрия — это молча сломанный оверлей, поэтому её отвергает база.
  constraint zones_geometry_check
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
  -- id генерирует клиент: путь в Storage обязан пережить ретрай загрузки,
  -- иначе повтор создаёт второй объект и вторую вещь.
  id           uuid primary key,
  owner_id     uuid not null references public.wardrobes (owner_id) on delete cascade,
  zone_id      uuid,
  display_name text,
  note         text,
  photo_path   text not null,
  cutout_path  text,
  created_at   timestamptz not null default clock_timestamp(),
  updated_at   timestamptz not null default clock_timestamp(),
  archived_at  timestamptz,

  unique (id, owner_id),

  -- set null только по zone_id: зануление owner_id нарушило бы not null (PG 15+).
  constraint items_zone_fk
    foreign key (zone_id, owner_id)
    references public.zones (id, owner_id)
    on delete set null (zone_id),

  constraint items_display_name_check
    check (display_name is null or length(display_name) <= 120),
  constraint items_note_check
    check (note is null or length(note) <= 2000),
  constraint items_photo_path_check
    check (length(photo_path) between 1 and 512),
  constraint items_cutout_path_check
    check (cutout_path is null or length(cutout_path) between 1 and 512),
  constraint items_archived_at_check
    check (archived_at is null or archived_at >= created_at)
);

create index items_owner_zone_active_idx
  on public.items (owner_id, zone_id)
  where archived_at is null;

-- История оценок. Append-only обеспечивается грантами (0004), а не триггером:
-- отозванная привилегия не обходится, в отличие от условия в коде.
create table public.tier_events (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null,
  owner_id   uuid not null default auth.uid(),
  tier       text not null,
  note       text,
  created_at timestamptz not null default clock_timestamp(),

  constraint tier_events_item_fk
    foreign key (item_id, owner_id)
    references public.items (id, owner_id),

  constraint tier_events_tier_check
    check (tier in ('S', 'A', 'B', 'C', 'D')),
  constraint tier_events_note_check
    check (note is null or length(note) <= 1000)
);

-- Тай-брейкер по id не косметика: без него при равных created_at порядок
-- событий недетерминирован и текущий tier «прыгает» между запросами.
create index tier_events_current_idx
  on public.tier_events (item_id, created_at desc, id desc);
