-- Текущий tier не хранится полем: поле пришлось бы поддерживать в согласии
-- с историей, а история и есть источник истины.
create view public.item_current_tiers
with (security_invoker = true, security_barrier = true)
as
select distinct on (event.item_id)
  event.item_id,
  event.owner_id,
  event.id as tier_event_id,
  event.tier,
  event.note,
  event.created_at
from public.tier_events as event
order by event.item_id, event.created_at desc, event.id desc;

-- LEFT JOIN обязателен: current_tier is null — это валидное состояние
-- «не оценено». С INNER JOIN неоценённые вещи молча исчезли бы из статистики.
create view public.item_catalog
with (security_invoker = true, security_barrier = true)
as
select
  item.id,
  item.owner_id,
  item.zone_id,
  item.display_name,
  item.note,
  item.photo_path,
  item.cutout_path,
  item.archived_at,
  item.created_at,
  current_tier.tier_event_id,
  current_tier.tier       as current_tier,
  current_tier.created_at as tiered_at
from public.items as item
left join public.item_current_tiers as current_tier
  on current_tier.item_id = item.id
 and current_tier.owner_id = item.owner_id;
