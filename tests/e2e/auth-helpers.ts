import { type BrowserContext, type Page, expect } from '@playwright/test';

const MAILPIT_URL = 'http://127.0.0.1:54324';
const MAIL_POLL_ATTEMPTS = 40;
const MAIL_POLL_INTERVAL_MS = 250;

interface MailpitSummary {
  messages: { ID: string; To: { Address: string }[] }[];
}

async function waitForMagicLink(page: Page, email: string): Promise<string> {
  for (let attempt = 0; attempt < MAIL_POLL_ATTEMPTS; attempt += 1) {
    const listing = await page.request.get(`${MAILPIT_URL}/api/v1/messages?limit=50`);
    const summary = (await listing.json()) as MailpitSummary;
    const message = summary.messages.find((candidate) =>
      candidate.To.some((recipient) => recipient.Address.toLowerCase() === email),
    );

    if (message) {
      const details = await page.request.get(`${MAILPIT_URL}/api/v1/message/${message.ID}`);
      const body = (await details.json()) as { Text?: string; HTML?: string };
      // Класс символов исключает кавычки и угловые скобки: в HTML-письме ссылка
      // стоит внутри href="...">Sign in, и жадный \S+ утащил бы хвост разметки
      // в значение redirect_to.
      const link = /https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]*/u.exec(
        `${body.Text ?? ''} ${body.HTML ?? ''}`,
      );

      if (link) {
        return link[0].replace(/&amp;/gu, '&');
      }
    }

    await page.waitForTimeout(MAIL_POLL_INTERVAL_MS);
  }

  throw new Error(`Письмо со ссылкой для ${email} не пришло в Mailpit`);
}

export function uniqueEmail(): string {
  return `e2e-${crypto.randomUUID()}@example.test`;
}

/** Полный боевой путь входа: форма → письмо → переход по ссылке → приватный раздел. */
export async function signInWithMagicLink(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByRole('button', { name: 'Получить ссылку для входа' }).click();
  await expect(page.getByRole('heading', { name: 'Проверьте почту' })).toBeVisible();

  await page.goto(await waitForMagicLink(page, email));
  await expect(page).toHaveURL(/\/$/u);
}

interface StoredSession {
  expires_at?: number;
  [key: string]: unknown;
}

const BASE64_PREFIX = 'base64-';
// Предел, после которого @supabase/ssr режет куку на части .0, .1, ...
const MAX_COOKIE_CHUNK = 3180;

/**
 * Кук с подстрокой `auth-token` несколько: помимо сессии рядом лежат
 * code-verifier'ы PKCE. Склеивать их вместе нельзя — получится не JSON.
 */
function isSessionCookie(name: string): boolean {
  return /^sb-.+-auth-token(\.\d+)?$/u.test(name);
}

function chunkIndex(name: string): number {
  const suffix = /\.(\d+)$/u.exec(name);
  return suffix ? Number.parseInt(suffix[1]!, 10) : 0;
}

/**
 * Сдвигает срок жизни сессии в прошлое прямо в куке. supabase-js решает,
 * пора ли обновляться, по сохранённому `expires_at`, поэтому подделывать
 * подпись токена не нужно — путь обновления запускается по-настоящему.
 */
export async function expireStoredSession(context: BrowserContext): Promise<string> {
  const cookies = await context.cookies();
  const sessionCookies = cookies
    .filter((cookie) => isSessionCookie(cookie.name))
    .sort((left, right) => chunkIndex(left.name) - chunkIndex(right.name));

  if (sessionCookies.length === 0) {
    throw new Error('Кука сессии не найдена — вход не выполнен');
  }

  const raw = sessionCookies.map((cookie) => cookie.value).join('');

  if (!raw.startsWith(BASE64_PREFIX)) {
    throw new Error(`Неожиданный формат куки сессии: ${raw.slice(0, 20)}`);
  }

  const session = JSON.parse(
    Buffer.from(raw.slice(BASE64_PREFIX.length), 'base64url').toString('utf8'),
  ) as StoredSession;

  session.expires_at = Math.floor(Date.now() / 1000) - 60;

  const encoded =
    BASE64_PREFIX +
    Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');

  const template = sessionCookies[0]!;
  const baseName = template.name.replace(/\.\d+$/u, '');
  const chunks =
    encoded.length <= MAX_COOKIE_CHUNK
      ? [{ name: baseName, value: encoded }]
      : (encoded.match(new RegExp(`.{1,${MAX_COOKIE_CHUNK}}`, 'gu')) ?? []).map(
          (value, index) => ({ name: `${baseName}.${index}`, value }),
        );

  await context.addCookies(
    chunks.map((chunk) => ({
      ...chunk,
      domain: template.domain,
      path: template.path,
      httpOnly: template.httpOnly,
      secure: template.secure,
      sameSite: template.sameSite,
    })),
  );

  return encoded;
}

/** Читает `expires_at` из текущей куки сессии — чтобы убедиться, что он ожил. */
export async function storedSessionExpiry(context: BrowserContext): Promise<number> {
  const cookies = await context.cookies();
  const raw = cookies
    .filter((cookie) => isSessionCookie(cookie.name))
    .sort((left, right) => chunkIndex(left.name) - chunkIndex(right.name))
    .map((cookie) => cookie.value)
    .join('');

  const session = JSON.parse(
    Buffer.from(raw.slice(BASE64_PREFIX.length), 'base64url').toString('utf8'),
  ) as StoredSession;

  return session.expires_at ?? 0;
}
