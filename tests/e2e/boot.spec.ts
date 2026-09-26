import { expect, test } from '@playwright/test';

// Смоук Этапа 0: приложение рендерится в обоих браузерах. Целится в /login,
// потому что с Этапа 2 главная страница приватна и аноним до неё не доходит.
test('публичная страница рендерится на десктопе и в mobile WebKit одинаково', async ({
  page,
}) => {
  await page.goto('/login');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Вход в каталог');
  await expect(page.getByLabel('Электронная почта')).toBeVisible();
});
