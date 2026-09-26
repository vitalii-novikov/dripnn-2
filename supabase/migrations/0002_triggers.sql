-- Триггеры закрывают инварианты, которые не выражаются констрейнтом: форму пути
-- в Storage и связь зоны с активной ревизией карты.

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger wardrobes_touch_updated_at
before update on public.wardrobes
for each row execute function public.touch_updated_at();

create trigger zones_touch_updated_at
before update on public.zones
for each row execute function public.touch_updated_at();

create trigger items_touch_updated_at
before update on public.items
for each row execute function public.touch_updated_at();

-- Путь вещи выводится из владельца и id, а не принимается на веру. Строка,
-- заявляющая чужой префикс, отклоняется базой, даже если объект туда не доехал.
create function public.validate_item_storage_paths()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  prefix text := new.owner_id::text || '/items/' || new.id::text || '/';
begin
  if new.photo_path <> prefix || 'photo.webp' then
    raise exception using
      errcode = '23514',
      message = 'item photo_path must be {owner_id}/items/{item_id}/photo.webp';
  end if;

  if new.cutout_path is not null and new.cutout_path <> prefix || 'cutout.webp' then
    raise exception using
      errcode = '23514',
      message = 'item cutout_path must be {owner_id}/items/{item_id}/cutout.webp';
  end if;

  return new;
end;
$$;

create trigger items_validate_storage_paths
before insert or update of id, owner_id, photo_path, cutout_path
on public.items
for each row execute function public.validate_item_storage_paths();

create function public.validate_floor_map_storage_path()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.photo_path <> new.owner_id::text || '/floor-maps/' || new.id::text || '/photo.webp' then
    raise exception using
      errcode = '23514',
      message = 'floor map photo_path must be {owner_id}/floor-maps/{revision_id}/photo.webp';
  end if;

  return new;
end;
$$;

create trigger floor_map_revisions_validate_storage_path
before insert or update of id, owner_id, photo_path
on public.floor_map_revisions
for each row execute function public.validate_floor_map_storage_path();

-- Геометрия зоны имеет смысл только относительно конкретного снимка пола.
-- Привязка к ретайрнутой ревизии означала бы рамки поверх фото, которого больше нет.
create function public.assert_zone_uses_active_floor_map()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.map_revision_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.floor_map_revisions as revision
    where revision.id = new.map_revision_id
      and revision.owner_id = new.owner_id
      and revision.retired_at is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'zone geometry must reference the owner''s active floor map revision';
  end if;

  return new;
end;
$$;

create trigger zones_assert_active_floor_map
before insert or update of owner_id, map_revision_id, x, y, w, h
on public.zones
for each row execute function public.assert_zone_uses_active_floor_map();
