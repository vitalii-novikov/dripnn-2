# Архитектура

## Стек

Next.js 16.3.6 (App Router; `params` — Promise, нужен `await params`),
React 19.3.0, TypeScript strict, `@supabase/supabase-js` 2.117.0,
`@supabase/ssr` 0.12.7. Тесты: vitest (порог 80%) и Playwright на chromium
и **mobile WebKit**. Хостинг Vercel; БД, Storage и auth — Supabase.

## Ловушки

**Next 16 ломает привычки.** Сверяйся с `node_modules/next/dist/docs/` — там
документация именно установленной версии, а не той, что помнит модель.

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

**Файл с `'use server'`** экспортирует только асинхронные функции. Константа в
нём ломает загрузку всего модуля экшенов — поэтому типы и начальные состояния
живут отдельно.

**`additional_redirect_urls` — список точных URL.** Без шаблона GoTrue молча
срезает путь и параметры `redirect_to` и откатывается на `site_url`: ссылка из
письма ведёт на главную вместо `/auth/callback`.

## Структура

```
app/        (auth)/login, (app)/*, w/[slug], api/public/[slug]
features/   ingestion, catalog, rating, floor-map, stats, sharing
lib/        supabase/, errors/, constants/
supabase/   migrations/, tests/database/ (pgTAP)
tests/      contracts/, integration/ (три роли), e2e/
scripts/    with-supabase-env.mjs, verify-generated-types.mjs
```

Организация по фичам, не по типам.

## Слои тестов

Покрытие 80% меряется **только по unit-слою** (`vitest.config.mts`). pgTAP и
integration — отдельные обязательные джобы CI и процентом покрытия не
засчитываются: иначе дырявая авторизация спрячется за красивой цифрой.

`tests/contracts/` проверяет сам механизм порога: прогоняет заведомо
недопокрытую фикстуру и требует ненулевого кода возврата. Порог ценен ровно
настолько, насколько он роняет сборку.
