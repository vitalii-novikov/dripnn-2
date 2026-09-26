alter table public.wardrobes           enable row level security;
alter table public.floor_map_revisions enable row level security;
alter table public.zones               enable row level security;
alter table public.items               enable row level security;
alter table public.tier_events         enable row level security;

-- Гранты сбрасываются целиком и выдаются заново: дефолты Supabase щедрее,
-- чем нужно, и «забыли отозвать» здесь стоит дороже, чем лишние три строки.
revoke all on table public.wardrobes           from anon, authenticated;
revoke all on table public.floor_map_revisions from anon, authenticated;
revoke all on table public.zones               from anon, authenticated;
revoke all on table public.items               from anon, authenticated;
revoke all on table public.tier_events         from anon, authenticated;
revoke all on table public.item_current_tiers  from anon, authenticated;
revoke all on table public.item_catalog        from anon, authenticated;

grant select, insert, update, delete on table public.wardrobes           to authenticated;
grant select, insert, update, delete on table public.floor_map_revisions to authenticated;
grant select, insert, update, delete on table public.zones               to authenticated;

-- Вещи не удаляются, а архивируются: жёсткое удаление унесло бы с собой историю оценок.
grant select, insert, update on table public.items to authenticated;

-- Append-only на уровне привилегий, а не политик. Колоночный грант не включает
-- id и created_at, поэтому клиентские часы до порядка событий не дотягиваются.
grant select on table public.tier_events to authenticated;
grant insert (item_id, owner_id, tier, note) on table public.tier_events to authenticated;

grant select on table public.item_current_tiers to authenticated;
grant select on table public.item_catalog       to authenticated;

create policy wardrobes_owner_select on public.wardrobes
  for select to authenticated using (owner_id = auth.uid());
create policy wardrobes_owner_insert on public.wardrobes
  for insert to authenticated with check (owner_id = auth.uid());
create policy wardrobes_owner_update on public.wardrobes
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy wardrobes_owner_delete on public.wardrobes
  for delete to authenticated using (owner_id = auth.uid());

create policy floor_map_revisions_owner_select on public.floor_map_revisions
  for select to authenticated using (owner_id = auth.uid());
create policy floor_map_revisions_owner_insert on public.floor_map_revisions
  for insert to authenticated with check (owner_id = auth.uid());
create policy floor_map_revisions_owner_update on public.floor_map_revisions
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy floor_map_revisions_owner_delete on public.floor_map_revisions
  for delete to authenticated using (owner_id = auth.uid());

create policy zones_owner_select on public.zones
  for select to authenticated using (owner_id = auth.uid());
create policy zones_owner_insert on public.zones
  for insert to authenticated with check (owner_id = auth.uid());
create policy zones_owner_update on public.zones
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy zones_owner_delete on public.zones
  for delete to authenticated using (owner_id = auth.uid());

create policy items_owner_select on public.items
  for select to authenticated using (owner_id = auth.uid());
create policy items_owner_insert on public.items
  for insert to authenticated with check (owner_id = auth.uid());
create policy items_owner_update on public.items
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy tier_events_owner_select on public.tier_events
  for select to authenticated using (owner_id = auth.uid());
create policy tier_events_owner_insert on public.tier_events
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.items as item
      where item.id = tier_events.item_id and item.owner_id = auth.uid()
    )
  );
-- Приватный бакет, префикс равен owner_id. Публичный бакет сделал бы
-- is_public = false фикцией: URL фото остался бы рабочим навсегда (D2).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wardrobe-private',
  'wardrobe-private',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public             = false,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Гранты на storage.objects здесь НЕ трогаем, и это не небрежность: сервис
-- storage-api переназначает их себе при каждом старте, так что любой revoke
-- отсюда живёт до первого перезапуска стека и создаёт ложное чувство
-- защищённости. Единственный устойчивый уровень принуждения для Storage — RLS.
-- Ниже ровно две политики, INSERT и SELECT по своему префиксу. Отсутствие
-- политик на UPDATE и DELETE и есть запрет upsert и удаления: привилегия у роли
-- остаётся, но под неё не подпадает ни одна строка.

create policy wardrobe_private_owner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'wardrobe-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy wardrobe_private_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'wardrobe-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Отсутствие политик здесь — тоже проектное решение, а не упущение:
--   * ни одной anon-политики на базовых таблицах — публичный доступ пойдёт
--     через серверную проекцию (Этап 9), а не через дыру в RLS;
--   * ни UPDATE, ни DELETE на tier_events — это и есть append-only;
--   * ни DELETE на items — архивирование вместо удаления;
--   * ни UPDATE, ни DELETE на storage.objects — upsert и удаление невозможны,
--     пути иммутабельны.
