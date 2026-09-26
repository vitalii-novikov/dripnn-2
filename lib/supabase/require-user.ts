import 'server-only';

import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

import { mapSupabaseError } from '@/lib/errors/map-supabase-error';

import { createServerSupabaseClient } from './server';

export const LOGIN_PATH = '/login';

const MISSING_SESSION_ERROR = 'AuthSessionMissingError';
const UNAUTHENTICATED_STATUSES: ReadonlySet<number> = new Set([400, 401, 403]);

/**
 * Отличает «нет сессии» от «Supabase не ответил». Разница не косметическая:
 * редирект на логин при сетевом сбое выглядел бы как разлогин и заставил бы
 * владельца заново запрашивать письмо вместо того, чтобы повторить запрос.
 */
function isUnauthenticated(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as { name?: unknown; status?: unknown };

  if (candidate.name === MISSING_SESSION_ERROR) {
    return true;
  }

  return (
    typeof candidate.status === 'number' && UNAUTHENTICATED_STATUSES.has(candidate.status)
  );
}

/**
 * Настоящая проверка доступа. Proxy только продлевает сессию и по замыслу
 * Next.js является оптимистичной проверкой — полагаться на него как на
 * авторизацию нельзя.
 */
export async function requireAuthenticatedUser(): Promise<User> {
  // Проверка идёт из layout, то есть из серверного компонента: запись кук
  // там запрещена, а обновлённую сессию всё равно сохранит proxy.ts.
  const supabase = await createServerSupabaseClient({ cookieWrites: 'best-effort' });
  const { data, error } = await supabase.auth.getUser();

  if (data.user) {
    return data.user;
  }

  if (error && !isUnauthenticated(error)) {
    throw mapSupabaseError(error, 'проверка текущего пользователя');
  }

  redirect(LOGIN_PATH);
}
