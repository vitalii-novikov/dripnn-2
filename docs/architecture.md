# Архитектура

## Стек

Next.js 16.3.6 (App Router; `params` — Promise, нужен `await params`),
React 19.3.0, TypeScript strict, `@supabase/supabase-js` 2.117.0,
`@supabase/ssr` 0.12.7. Тесты: vitest (порог 80%) и Playwright на chromium
и **mobile WebKit**. Хостинг Vercel; БД, Storage и auth — Supabase.

## Ловушки

**`middleware.ts` → `proxy.ts`.** В Next.js 16 файл переименован, экспорт зовётся
`proxy`, рантайм только `nodejs`. Документация Supabase показывает старое имя —
скопируешь как есть, получишь случайные разлогины.

**Память Safari.** 20 фото по 12 Мп — ~1 ГБ распакованных битмапов, вкладка
умирает молча. Сжатие строго последовательное: один переиспользуемый canvas,
`createImageBitmap(file, {imageOrientation:'from-image'})`, обязательный
`bitmap.close()`. Загрузок не больше трёх параллельно.

**Леттербоксинг оверлея.** Нормализованные координаты не спасают — спасает
совпадение бокса изображения и бокса SVG: контейнеру `aspect-ratio` из
`width_px/height_px` ревизии, изображению `object-cover`, SVG
`viewBox="0 0 1000 1000"` + `preserveAspectRatio="none"`.

**Порядок записи.** Сначала объект в Storage, потом строка в БД; `id` вещи
генерирует клиент, чтобы путь пережил ретрай.

## Структура

```
app/        (auth)/login, (app)/*, w/[slug], api/public/[slug]
features/   ingestion, catalog, rating, floor-map, stats, sharing
lib/        supabase/, errors/, constants/
supabase/   migrations/, tests/database/ (pgTAP)
tests/      integration/ (три роли), e2e/
```

Организация по фичам, не по типам.
