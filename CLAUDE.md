# Floor Map Wardrobe (dripnn-2)

Мобильный веб-каталог гардероба: главный экран — фото пола с кучками одежды,
кучки кликабельны. У вещи есть tier S–D, хранимый append-only историей оценок.
Цель — отсеять ≥40% вещей перед переездом.

Стек: Next.js 16.3.6 + React 19.3 + Supabase + Vercel, TypeScript strict.

## Состояние

Этапы 0–1 плана закрыты, Этап 2 готов по коду. **Читай
[docs/status.md](docs/status.md) перед любой работой** — там текущая точка,
незакрытые гейты и следующий шаг.

Запуск: `npm ci && npm run e2e:install && npm exec -- supabase start && npm run verify`.
Зависимости ставь через `npm ci` — почему, см. `docs/workflow.md`.

## Документация

- [docs/status.md](docs/status.md) — где мы, что дальше
- [docs/overview.md](docs/overview.md) — продукт, метрики
- [docs/architecture.md](docs/architecture.md) — стек, структура, ловушки
- [docs/data-model.md](docs/data-model.md) — схема, RLS, Storage
- [docs/decisions.md](docs/decisions.md) — решения и причины
- [docs/workflow.md](docs/workflow.md) — процесс, тесты, git

PRD и планы — в `.claude/PRPs/` (под git).

## Правила

- **Финальный шаг любого плана — актуализация `docs/`.** План не закрыт, пока
  документация не отражает сделанное.
- Файл в `docs/` — до 500 токенов.
- Прямой push в `main` разрешён, пока проект маленький.
- Решения — в `docs/decisions.md`, не в коде.
- Гейт, требующий реального телефона или прода, закрывает владелец, не агент.
