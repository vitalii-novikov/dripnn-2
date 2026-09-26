# dripnn-2 — Floor Map Wardrobe

Мобильный веб-каталог гардероба: главный экран — фото пола с кучками одежды,
кучки кликабельны. Продукт и решения описаны в [docs/](docs/).

## Требования

- Node.js ≥ 20.9
- Docker (для локального стека Supabase)
- Supabase CLI ставится как devDependency — отдельная установка не нужна

## Чистый клон → все слои тестов → прод-сборка

Одна последовательность, она же гейт Этапа 0:

```bash
npm ci
npm run e2e:install        # браузеры Playwright, один раз на машину
npm exec -- supabase start
npm run verify
```

`npm run verify` последовательно прогоняет: lint → typecheck → unit с порогом
покрытия 80% → `supabase db reset` → pgTAP → сверку сгенерированных типов →
integration под тремя ролями → прод-сборку → e2e на chromium и mobile WebKit.

## Отдельные шаги

```bash
npm run dev                # локальная разработка
npm run lint               # eslint
npm run typecheck          # tsc --noEmit
npm run test               # unit + покрытие (порог 80%)
npm run db:reset           # миграции с нуля
npm run test:db            # pgTAP под тремя ролями
npm run verify:types       # типы БД не разошлись со схемой
npm run test:integration   # integration
npm run e2e:install        # браузеры Playwright (один раз)
npm run test:e2e           # chromium + mobile WebKit
npm run build              # прод-сборка
```

## Границы, которые стоит знать до первого коммита

- `middleware.ts` в Next 16 называется **`proxy.ts`**, экспорт — `proxy`,
  рантайм только `nodejs`. Документация Supabase показывает старое имя.
- Service-role ключ живёт **только** в файлах `*.server.ts`.
- Покрытие меряется по unit-слою. pgTAP и integration — отдельные обязательные
  джобы CI и процентом покрытия не засчитываются.
- Прямой push в `main` разрешён, пока проект маленький (D11).
