# Гардероб 3×3 — Google Apps Script

Ветка `impl/google-workspace`. План и решения: `.claude/PRPs/plans/wardrobe-grid.plan.md`.
Деплой делает владелец: `deploy.md`.

## Продукт
- Главный экран: сводка по тирам + сетка 3×3 блоков; экран блока: сводка, «Добавить вещь», карточки.
- Вещь добавляется только через Google Form владельца (`Блок`, `Фото`, `Size`, `Name`, `Tier`),
  привязанную к таблице. Приложение: тир S–E, удаление, переименование блоков.

## Код — только `CODE_Apps_Script/`, без сборки, npm и тестов
- `Code.gs` — сервер: точки входа (`doGet`, `setup`, RPC `getData/setTier/deleteItem/renameBlocks`)
  и хелперы с `_` в конце (не видны через `google.script.run`).
- `Index.html` — вся страница: стили + клиентский скрипт (vanilla JS).
- `appsscript.json` — `MYSELF` / `USER_DEPLOYING`, scopes: spreadsheets, drive, forms.

## Данные
- Лист ответов формы — только чтение; находится по заголовкам `Блок/Block` и `Фото/Photo`.
- `Blocks`: `slot | name | aliases`; `State`: `itemId | tier | deleted | shared | updatedAt`.
- id вещи = Drive-id фото. `State.tier`: `''` — действует тир из формы, `none` — сброшен в приложении.

## Правила
- Держать код минимальным: владелец хочет «просто UI над своими данными».
- В web app нет `getActiveSpreadsheet()`: таблица открывается по id, который запомнил `setup`.
- Никакого `innerHTML` с данными: только `h()` в `Index.html`.
- Лист ответов формы не редактировать; всё состояние приложения — в `State`.
- Каждый `google.script.run` — с таймаутом: при нескольких аккаунтах ответа может не быть.
- Запись в лист: сначала новые строки, потом очистка лишних (`overwrite_`).
- Код под Apps Script проверять на реальном деплое: локальных тестов в репо нет.
