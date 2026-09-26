import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type CookieHandlers = {
  getAll: () => unknown;
  setAll: (items: { name: string; value: string; options: object }[]) => void;
};

const createBrowserClient = vi.fn((_url: string, _key: string) => ({ kind: 'browser' }));
const createServerClient = vi.fn(
  (_url: string, _key: string, _options: { cookies: CookieHandlers }) => ({ kind: 'server' }),
);
const createClient = vi.fn((_url: string, _key: string, _options: object) => ({
  kind: 'service',
}));
const cookieStore = { getAll: vi.fn(() => []), set: vi.fn() };

vi.mock('@supabase/ssr', () => ({ createBrowserClient, createServerClient }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));

const { createBrowserSupabaseClient } = await import('./browser');
const { createServerSupabaseClient } = await import('./server');
const { createServiceRoleClient } = await import('./service.server');

const ENV_SNAPSHOT = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
});

afterEach(() => {
  process.env = { ...ENV_SNAPSHOT };
});

describe('createBrowserSupabaseClient', () => {
  it('использует только публичный ключ', () => {
    createBrowserSupabaseClient();

    expect(createBrowserClient).toHaveBeenCalledWith('http://127.0.0.1:54321', 'anon-key');
  });
});

describe('createServerSupabaseClient', () => {
  it('передаёт getAll и setAll, а не устаревшие get/set/remove', async () => {
    await createServerSupabaseClient();

    const options = createServerClient.mock.calls[0]![2];

    expect(Object.keys(options.cookies).sort()).toEqual(['getAll', 'setAll']);
  });

  it('записывает каждую куку, которую просит библиотека', async () => {
    await createServerSupabaseClient();

    const options = createServerClient.mock.calls[0]![2];
    options.cookies.setAll([
      { name: 'sb-a', value: '1', options: {} },
      { name: 'sb-b', value: '2', options: {} },
    ]);

    expect(cookieStore.set).toHaveBeenCalledTimes(2);
  });

  // Серверные компоненты отдают куки только на чтение. Падение здесь уронило бы
  // весь рендер ради работы, которую всё равно делает proxy.
  it('переживает запрет записи кук, когда об этом попросили явно', async () => {
    cookieStore.set.mockImplementationOnce(() => {
      throw new Error('Cookies can only be modified in a Server Action');
    });
    await createServerSupabaseClient({ cookieWrites: 'best-effort' });

    const options = createServerClient.mock.calls[0]![2];

    expect(() => options.cookies.setAll([{ name: 'sb-a', value: '1', options: {} }])).not.toThrow();
  });

  // По умолчанию — наоборот. Проглоченная ошибка записи в экшене логина дала бы
  // «письмо отправлено» при том, что PKCE-verifier до браузера не доехал.
  it('по умолчанию пробрасывает ошибку записи кук', async () => {
    cookieStore.set.mockImplementationOnce(() => {
      throw new Error('Cookies can only be modified in a Server Action');
    });
    await createServerSupabaseClient();

    const options = createServerClient.mock.calls[0]![2];

    expect(() => options.cookies.setAll([{ name: 'sb-a', value: '1', options: {} }])).toThrow();
  });
});

describe('createServiceRoleClient', () => {
  it('не сохраняет сессию и не обновляет токен: клиент живёт один запрос', () => {
    createServiceRoleClient();

    expect(createClient).toHaveBeenCalledWith('http://127.0.0.1:54321', 'service-key', {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  });

  it('падает без service-role ключа, а не создаёт клиент с anon-правами', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => createServiceRoleClient()).toThrow(/обязательны/u);
  });
});
