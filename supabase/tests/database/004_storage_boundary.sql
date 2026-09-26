-- Граница Storage: приватный бакет, префикс равен owner_id, upsert невозможен.
--
-- Все утверждения здесь — поведенческие, а не про привилегии. Причина: сервис
-- storage-api переназначает гранты на storage.objects при каждом старте, поэтому
-- has_table_privilege проверял бы то, чем защита не является. Защищает RLS.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

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

select results_eq(
  $$ select public from storage.buckets where id = 'wardrobe-private' $$,
  array[false],
  'бакет wardrobe-private приватный'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('wardrobe-private',
             '10000000-0000-0000-0000-000000000001/items/14000000-0000-0000-0000-000000000001/photo.webp') $$,
  'владелец загружает файл под своим префиксом'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('wardrobe-private',
             '20000000-0000-0000-0000-000000000002/items/14000000-0000-0000-0000-000000000009/photo.webp') $$,
  '42501',
  null,
  'владелец не может загрузить файл под чужим префиксом'
);

-- Политики на UPDATE нет, поэтому апдейт не находит ни одной строки — даже
-- своей. Это и есть запрет upsert: путь, однажды записанный, неизменен.
select is_empty(
  $$ with attempted as (
       update storage.objects set name = name || '.tampered'
       where bucket_id = 'wardrobe-private'
       returning id
     )
     select id from attempted $$,
  'upsert невозможен: UPDATE не затрагивает ни одной строки'
);

-- Прямое удаление отбивает триггер storage.protect_delete: он бросает 42501,
-- а не молча не находит строк. Защита строже, чем отсутствие политики.
select throws_ok(
  $$ delete from storage.objects where bucket_id = 'wardrobe-private' $$,
  '42501',
  null,
  'прямое удаление объекта из storage отбивается'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is_empty(
  $$ select id from storage.objects where bucket_id = 'wardrobe-private' $$,
  'второй авторизованный не видит объекты владельца'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is_empty(
  $$ select id from storage.objects where bucket_id = 'wardrobe-private' $$,
  'аноним не видит приватные объекты'
);

select * from finish();
rollback;
