import { afterEach, describe, expect, it } from 'vitest';

import { publicSupabaseConfig } from './config';

const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_KEY;
});

describe('publicSupabaseConfig', () => {
  it('возвращает адрес и публичный ключ', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

    expect(publicSupabaseConfig()).toEqual({
      url: 'http://127.0.0.1:54321',
      anonKey: 'anon-key',
    });
  });

  it.each([
    ['без адреса', undefined, 'anon-key'],
    ['без ключа', 'http://127.0.0.1:54321', undefined],
    ['с пустым адресом', '', 'anon-key'],
  ])('падает %s, а не отдаёт полусобранную конфигурацию', (_case, url, anonKey) => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey;
    if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (anonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(() => publicSupabaseConfig()).toThrow(/обязательны/u);
  });
});
