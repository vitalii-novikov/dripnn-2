# Floor Map Wardrobe (dripnn-2)

Мобильный веб-каталог гардероба: главный экран — фото пола с кучками одежды,
кучки кликабельны. У вещи есть tier S–D, хранимый append-only историей оценок.
Цель — отсеять ≥40% вещей перед переездом.

Стек: Next.js 16 + Supabase + Vercel. Кода пока нет.

## Документация

- [docs/overview.md](docs/overview.md) — продукт, метрики
- [docs/architecture.md](docs/architecture.md) — стек, структура
- [docs/data-model.md](docs/data-model.md) — схема, RLS, Storage
- [docs/decisions.md](docs/decisions.md) — решения и причины
- [docs/workflow.md](docs/workflow.md) — процесс, тесты, git

PRD и планы — в `.claude/PRPs/`.

## Правила

- **Финальный шаг любого плана — актуализация `docs/`.** План не закрыт, пока
  документация не отражает сделанное.
- Файл в `docs/` — до 500 токенов.
- Прямой push в `main` разрешён, пока проект маленький.
- Решения — в `docs/decisions.md`, не в коде.
