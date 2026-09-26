-- Изоляция владения под тремя ролями. Политика, проверенная только под админом,
-- не проверена: admin обходит RLS и всегда видит всё.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'owner@example.test', '', clock_timestamp(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   clock_timestamp(), clock_timestamp()),
  ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'second@example.test', '', clock_timestamp(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   clock_timestamp(), clock_timestamp());

insert into public.wardrobes (owner_id, slug)
values ('10000000-0000-0000-0000-000000000001', 'owner-wardrobe');

insert into public.items (id, owner_id, display_name, photo_path)
values (
  '14000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Куртка',
  '10000000-0000-0000-0000-000000000001/items/14000000-0000-0000-0000-000000000001/photo.webp'
);

insert into public.tier_events (item_id, owner_id, tier)
values ('14000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001', 'A');

-- Роль 1: владелец
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$ select count(*)::bigint from public.items $$,
  array[1::bigint],
  'владелец видит свою вещь'
);

-- Роль 2: второй авторизованный
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select results_eq(
  $$ select count(*)::bigint from public.items $$,
  array[0::bigint],
  'второй авторизованный не видит вещи владельца'
);

select results_eq(
  $$ select count(*)::bigint from public.tier_events $$,
  array[0::bigint],
  'второй авторизованный не видит историю оценок владельца'
);

-- Роль 3: аноним. Ни одной anon-политики нет, поэтому падать должно на
-- привилегии, а не на пустой выборке.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok($$ select * from public.wardrobes $$, '42501', null, 'аноним не читает wardrobes');
select throws_ok($$ select * from public.floor_map_revisions $$, '42501', null, 'аноним не читает floor_map_revisions');
select throws_ok($$ select * from public.zones $$, '42501', null, 'аноним не читает zones');
select throws_ok($$ select * from public.items $$, '42501', null, 'аноним не читает items');
select throws_ok($$ select * from public.tier_events $$, '42501', null, 'аноним не читает tier_events');
select throws_ok($$ select * from public.item_catalog $$, '42501', null, 'аноним не читает item_catalog');

select * from finish();
rollback;
