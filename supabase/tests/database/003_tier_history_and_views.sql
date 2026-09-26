-- Append-only история и вычисляемый текущий tier.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
        'owner@example.test', '', clock_timestamp(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        clock_timestamp(), clock_timestamp());

insert into public.wardrobes (owner_id, slug)
values ('10000000-0000-0000-0000-000000000001', 'owner-wardrobe');

insert into public.items (id, owner_id, photo_path) values
  ('14000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001/items/14000000-0000-0000-0000-000000000001/photo.webp'),
  ('14000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001/items/14000000-0000-0000-0000-000000000002/photo.webp'),
  ('14000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001/items/14000000-0000-0000-0000-000000000003/photo.webp');

-- Три оценки одной вещи с разным временем: побеждает последняя по created_at.
insert into public.tier_events (item_id, owner_id, tier, created_at) values
  ('14000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'D', '2026-01-01T10:00:00Z'),
  ('14000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'C', '2026-01-02T10:00:00Z'),
  ('14000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'S', '2026-01-03T10:00:00Z');

-- Одинаковый created_at: тай-брейкером обязан выступить больший id.
insert into public.tier_events (id, item_id, owner_id, tier, created_at) values
  ('15000000-0000-0000-0000-00000000000a', '14000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001', 'B', '2026-01-05T10:00:00Z'),
  ('15000000-0000-0000-0000-00000000000f', '14000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001', 'A', '2026-01-05T10:00:00Z');

select results_eq(
  $$ select current_tier from public.item_catalog
     where id = '14000000-0000-0000-0000-000000000001' $$,
  array['S'::text],
  'текущий tier возвращает событие с наибольшим created_at'
);

select results_eq(
  $$ select current_tier from public.item_catalog
     where id = '14000000-0000-0000-0000-000000000002' $$,
  array['A'::text],
  'при равных created_at тай-брейкером выступает id'
);

-- Именно results_eq, а не is_empty: пустая выборка удовлетворила бы is_empty и
-- тогда тест был бы зелёным как раз в случае «вещь выпала из каталога».
select results_eq(
  $$ select count(*)::bigint from public.item_catalog
     where id = '14000000-0000-0000-0000-000000000003' and current_tier is null $$,
  array[1::bigint],
  'вещь без оценок видна с current_tier = null'
);

select results_eq(
  $$ select count(*)::bigint from public.tier_events
     where item_id = '14000000-0000-0000-0000-000000000001' $$,
  array[3::bigint],
  'три оценки одной вещи создают три строки в tier_events'
);

-- Append-only — это гранты, а не политики: отозванную привилегию не обойти.
select ok(
  not has_column_privilege('authenticated', 'public.tier_events', 'created_at', 'INSERT'),
  'клиент не может передать created_at события'
);

select ok(
  not has_column_privilege('authenticated', 'public.tier_events', 'id', 'INSERT'),
  'клиент не может передать id события'
);

select ok(
  not has_table_privilege('authenticated', 'public.tier_events', 'UPDATE'),
  'у authenticated нет привилегии UPDATE на tier_events'
);

select ok(
  not has_table_privilege('authenticated', 'public.tier_events', 'DELETE'),
  'у authenticated нет привилегии DELETE на tier_events'
);

select * from finish();
rollback;
