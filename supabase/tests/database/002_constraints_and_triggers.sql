-- Инварианты, вынесенные в базу: чужая зона, границы прямоугольника,
-- целостность геометрии и форма пути в Storage.
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

insert into public.wardrobes (owner_id, slug) values
  ('10000000-0000-0000-0000-000000000001', 'owner-wardrobe'),
  ('20000000-0000-0000-0000-000000000002', 'second-wardrobe');

insert into public.floor_map_revisions (id, owner_id, photo_path, width_px, height_px)
values (
  '12000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001/floor-maps/12000000-0000-0000-0000-000000000001/photo.webp',
  3024, 4032
);

-- Зона второго владельца — мишень для попытки перекрёстной ссылки.
insert into public.zones (id, owner_id, name)
values ('13000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000002', 'Чужая кучка');

select lives_ok(
  $$ insert into public.zones (id, owner_id, name)
     values ('13000000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000001', 'Кучка без рамки') $$,
  'зона без геометрии допустима — вещи вводятся до рисования карты'
);

select throws_ok(
  $$ insert into public.zones (owner_id, name, x)
     values ('10000000-0000-0000-0000-000000000001', 'Половина рамки', 0.1) $$,
  '23514',
  null,
  'зона с частичной геометрией отвергается'
);

select throws_ok(
  $$ insert into public.zones (owner_id, map_revision_id, name, x, y, w, h)
     values ('10000000-0000-0000-0000-000000000001',
             '12000000-0000-0000-0000-000000000001', 'За краем', 0.8, 0.1, 0.5, 0.2) $$,
  '23514',
  null,
  'прямоугольник зоны отвергает координаты за пределами 0..1'
);

select throws_ok(
  $$ insert into public.zones (owner_id, map_revision_id, name, x, y, w, h)
     values ('10000000-0000-0000-0000-000000000001',
             '12000000-0000-0000-0000-000000000001', 'Отрицательная', -0.1, 0.1, 0.2, 0.2) $$,
  '23514',
  null,
  'прямоугольник зоны отвергает отрицательные координаты'
);

select throws_ok(
  $$ insert into public.items (id, owner_id, zone_id, photo_path)
     values ('14000000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000001',
             '13000000-0000-0000-0000-000000000002',
             '10000000-0000-0000-0000-000000000001/items/14000000-0000-0000-0000-000000000001/photo.webp') $$,
  '23503',
  null,
  'вещь не может сослаться на чужую зону'
);

select throws_ok(
  $$ insert into public.items (id, owner_id, photo_path)
     values ('14000000-0000-0000-0000-000000000003',
             '10000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000002/items/14000000-0000-0000-0000-000000000003/photo.webp') $$,
  '23514',
  null,
  'путь вещи под чужим префиксом отвергается триггером'
);

select throws_ok(
  $$ insert into public.items (id, owner_id, photo_path, cutout_path)
     values ('14000000-0000-0000-0000-000000000004',
             '10000000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000001/items/14000000-0000-0000-0000-000000000004/photo.webp',
             '10000000-0000-0000-0000-000000000001/items/wrong/cutout.webp') $$,
  '23514',
  null,
  'путь выреза, не выведенный из id вещи, отвергается'
);

select throws_ok(
  $$ insert into public.floor_map_revisions (id, owner_id, photo_path, width_px, height_px)
     values ('12000000-0000-0000-0000-000000000009',
             '10000000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000001/floor-maps/12000000-0000-0000-0000-000000000009/photo.webp',
             1000, 1000) $$,
  '23505',
  null,
  'вторая активная карта пола у одного владельца отвергается'
);

-- Ретайрим ревизию и убеждаемся, что рамки к ней больше не привязываются.
update public.floor_map_revisions
set retired_at = clock_timestamp()
where id = '12000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ insert into public.zones (owner_id, map_revision_id, name, x, y, w, h)
     values ('10000000-0000-0000-0000-000000000001',
             '12000000-0000-0000-0000-000000000001', 'На мёртвой карте', 0.1, 0.1, 0.2, 0.2) $$,
  '23514',
  null,
  'геометрия зоны не привязывается к ретайрнутой ревизии карты'
);

select * from finish();
rollback;
