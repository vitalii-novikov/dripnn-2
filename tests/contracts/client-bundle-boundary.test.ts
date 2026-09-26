import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

// Читаем собранный клиентский бандл, а не исходники. Grep по исходникам ловит
// только прямое упоминание переменной; утечка же происходит транзитивно —
// когда серверный модуль случайно импортируется клиентским компонентом.
const CLIENT_CHUNK_DIR = path.resolve('.next/static/chunks');

// Канарейка: собираем с заведомо узнаваемым «ключом» и ищем именно его.
// Проверка только по имени переменной пропустила бы конфигурацию, которая
// подставляет значение секрета, убирая само имя.
const CANARY_SERVICE_ROLE_KEY = 'canary-service-role-key-8f2b41d0';
const FORBIDDEN = ['SUPABASE_SERVICE_ROLE_KEY', 'service_role', CANARY_SERVICE_ROLE_KEY] as const;

function collectClientChunks(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);

    return statSync(absolute).isDirectory()
      ? collectClientChunks(absolute)
      : absolute.endsWith('.js')
        ? [absolute]
        : [];
  });
}

// Сборка выполняется всегда, а не «если каталога нет»: устаревший .next
// означал бы, что тест аттестует не тот код, который мы только что изменили.
beforeAll(() => {
  execFileSync('npm', ['run', 'build'], {
    stdio: 'ignore',
    env: {
      ...process.env,
      SUPABASE_SERVICE_ROLE_KEY: CANARY_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'anon-key',
    },
  });
}, 600_000);

describe('граница service-role', () => {
  it('находит клиентские чанки, иначе пустой проход был бы неотличим от успеха', () => {
    expect(collectClientChunks(CLIENT_CHUNK_DIR).length).toBeGreaterThan(0);
  });

  it('не пропускает service-role ключ ни в один клиентский чанк', () => {
    const leaks = collectClientChunks(CLIENT_CHUNK_DIR).flatMap((file) => {
      const source = readFileSync(file, 'utf8');

      return FORBIDDEN.filter((marker) => source.includes(marker)).map((marker) => ({
        file: path.relative(process.cwd(), file),
        marker,
      }));
    });

    expect(leaks).toEqual([]);
  });
});
