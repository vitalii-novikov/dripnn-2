import { expect, test } from '@playwright/test';

import {
  expireStoredSession,
  signInWithMagicLink,
  storedSessionExpiry,
  uniqueEmail,
} from './auth-helpers';

test('защищённый маршрут редиректит анонима на логин', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole('heading', { name: 'Вход в каталог' })).toBeVisible();
});

test('вход по одноразовой ссылке доводит до приватного раздела', async ({ page }) => {
  await signInWithMagicLink(page, uniqueEmail());

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Гардероб');
});

test('истёкший access token обновляется, cookie доезжают до ответа', async ({
  page,
  context,
}) => {
  await signInWithMagicLink(page, uniqueEmail());

  const expiredValue = await expireStoredSession(context);
  expect(await storedSessionExpiry(context)).toBeLessThan(Date.now() / 1000);

  // Навигация после истечения токена — ровно тот момент, в котором проявляется
  // случайный разлогин, если proxy не донёс обновлённые куки до ответа.
  await page.goto('/');

  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Гардероб');

  // Сравнивать надо с подменённым значением, а не с исходным: подмену сделал
  // сам тест, поэтому «изменилось относительно начала» было бы зелёным и без
  // всякого обновления токена.
  const refreshed = await context.cookies();
  const refreshedValue = refreshed
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/u.test(cookie.name))
    .map((cookie) => cookie.value)
    .join('');

  expect(refreshedValue).not.toBe(expiredValue);
  expect(await storedSessionExpiry(context)).toBeGreaterThan(Date.now() / 1000);
});

test('сессия переживает несколько навигаций без разлогина', async ({ page }) => {
  await signInWithMagicLink(page, uniqueEmail());

  for (let visit = 0; visit < 3; visit += 1) {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/u);
  }

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Гардероб');
});

// Регрессия на находку аудита: флаг «пользователь редактирует» никто не
// сбрасывал, и после смены адреса экран навсегда оставался формой — письма
// уходили, а подтверждение не возвращалось.
test('смена адреса и повторная отправка возвращают подтверждение', async ({ page }) => {
  await page.goto('/login');

  await page.getByLabel('Электронная почта').fill(uniqueEmail());
  await page.getByRole('button', { name: 'Получить ссылку для входа' }).click();
  await expect(page.getByRole('heading', { name: 'Проверьте почту' })).toBeVisible();

  await page.getByRole('button', { name: 'Указать другую почту' }).click();
  await expect(page.getByLabel('Электронная почта')).toBeVisible();

  const second = uniqueEmail();
  await page.getByLabel('Электронная почта').fill(second);
  await page.getByRole('button', { name: 'Получить ссылку для входа' }).click();

  await expect(page.getByRole('heading', { name: 'Проверьте почту' })).toBeVisible();
  await expect(page.getByText(second)).toBeVisible();
});

test('неудачный повтор показывает ошибку внутри подтверждения, а не выбрасывает в форму', async ({
  page,
}) => {
  await page.goto('/login');

  await page.getByLabel('Электронная почта').fill(uniqueEmail());
  await page.getByRole('button', { name: 'Получить ссылку для входа' }).click();
  await expect(page.getByRole('heading', { name: 'Проверьте почту' })).toBeVisible();

  // Мгновенный повтор упирается в ограничение частоты писем — удобный
  // детерминированный способ получить ошибку на этом экране.
  await page.getByRole('button', { name: 'Отправить ещё раз' }).click();

  // Именно баннер формы: getByRole('alert') совпадает ещё и со служебным
  // анонсером маршрутов Next.
  await expect(page.locator('#login-error-message')).toContainText(
    /Слишком много попыток|Не удалось/u,
  );
  await expect(page.getByRole('heading', { name: 'Проверьте почту' })).toBeVisible();
  await expect(page.getByLabel('Электронная почта')).toHaveCount(0);
});

test('успешный повтор подтверждает отправку', async ({ page }) => {
  await page.goto('/login');

  await page.getByLabel('Электронная почта').fill(uniqueEmail());
  await page.getByRole('button', { name: 'Получить ссылку для входа' }).click();
  await expect(page.getByRole('heading', { name: 'Проверьте почту' })).toBeVisible();

  // Пауза длиннее ограничения частоты: иначе проверялась бы ошибка, а не успех.
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Отправить ещё раз' }).click();

  await expect(page.getByText('Ссылка отправлена ещё раз.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Проверьте почту' })).toBeVisible();
});
