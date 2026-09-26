import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from './database.types';

import { publicSupabaseConfig } from './config';

type CookieWritePolicy = 'required' | 'best-effort';

/**
 * Клиент для серверных компонентов, экшенов и роут-хендлеров. Новый экземпляр
 * на каждый рендер: общий клиент между запросами смешал бы сессии.
 *
 * `getAll`/`setAll` обязательны — на устаревших `get`/`set`/`remove` библиотека
 * теряет часть кук и даёт случайные разлогины.
 *
 * `cookieWrites` по умолчанию `required`. Серверный компонент отдаёт куки
 * только на чтение и обязан попросить `best-effort` явно: молчаливое
 * проглатывание в экшене означало бы «письмо отправлено», хотя PKCE-verifier
 * до браузера не доехал и ссылка из письма не сработает.
 *
 * Заголовки запрета кэширования, которые библиотека передаёт вторым аргументом
 * `setAll`, здесь недоступны: ни серверный компонент, ни серверный экшен не
 * управляют заголовками ответа. Их выставляет proxy.ts, через который проходит
 * каждый такой запрос.
 */
export async function createServerSupabaseClient(
  { cookieWrites = 'required' }: { cookieWrites?: CookieWritePolicy } = {},
) {
  // cookies() читается первым намеренно: именно это обращение сообщает Next,
  // что маршрут динамический. Упади мы раньше на проверке конфига, сборка
  // попыталась бы пререндерить приватную страницу статически.
  const cookieStore = await cookies();
  const { anonKey, url } = publicSupabaseConfig();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, options, value } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch (error) {
          if (cookieWrites === 'required') {
            throw error;
          }
        }
      },
    },
  });
}
