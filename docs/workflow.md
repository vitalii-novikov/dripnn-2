# Процесс

## Цикл фичи

Спека/PRD → план со стейджами → чистый контекст → исполнение по шагам →
актуализация `docs/` → план в `.claude/PRPs/plans/completed/`.

PRD в `.claude/PRPs/prds/`, планы в `.claude/PRPs/plans/`, подробные доки только
в `docs/`. **План не закрыт, пока `docs/` не отражает сделанное.**

## Ручные гейты

Два гейта не заменяются автотестами:

- **20 фото на личном iPhone** одним выбором: без перезагрузки вкладки Safari,
  без перевёрнутых фото, при падении одного файла остальные доезжают. До этого
  гейта редактор карты не начинается.
- **30 вещей оценены за <60 сек** на реальном телефоне, без пропусков событий.

## Тесты

Пирамида: 55–65% unit, 20–30% integration (БД, RLS, Storage, проекция), 10–15%
e2e. Покрытие 80%, TDD — RED → GREEN → REFACTOR.

**Каждый тест политики прогоняется под тремя ролями**: владелец, второй
авторизованный, аноним. Политика, проверенная только под админом, не проверена.
pgTAP и per-role integration — отдельные джобы CI, не засчитываются покрытием.

## Git

Прямой push в `main` разрешён (D11). Коммит: `<type>: <description>`, типы
`feat|fix|refactor|docs|test|chore|perf|ci`. Атрибуция отключена глобально.

## Команды

```bash
npm ci                     # только npm ci, не npm install (см. ниже)
npm run e2e:install        # браузеры Playwright, один раз на машину
npm exec -- supabase start # локальный стек, нужен Docker
npm run verify             # весь конвейер целиком
```

Отдельными шагами:

```bash
npm run lint
npm run typecheck
npm run test               # unit + покрытие, порог 80%
npm run db:reset           # миграции с нуля
npm run test:db            # pgTAP под тремя ролями
npm run verify:types       # типы БД не разошлись со схемой
npm run test:integration   # три роли через PostgREST и Storage
npm run build
npm run test:e2e           # chromium + mobile WebKit
```

**Ставь зависимости через `npm ci`.** Инкрементальный `npm install` теряет
платформенную optional-зависимость нативного биндинга (баг npm #4828) — vitest
падает с «Cannot find native binding». Лечится удалением `node_modules` и
`package-lock.json`. После любого `npm install` перепрогоняй тесты: предыдущий
зелёный прогон уже ничего не гарантирует.
