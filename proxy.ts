import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import type { Database } from '@/lib/supabase/database.types';
import { publicSupabaseConfig } from '@/lib/supabase/config';

/**
 * Единственная задача proxy — продлить сессию и донести обновлённые куки до
 * ответа. Авторизацией он не занимается: документация Next 16 прямо называет
 * proxy оптимистичной проверкой и требует проверять доступ внутри самих
 * серверных функций. Настоящая проверка живёт в app/(app)/layout.tsx.
 *
 * Рантайм задавать нельзя: в Next 16 proxy всегда nodejs, а `export const
 * runtime` в этом файле бросает ошибку.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { anonKey, url } = publicSupabaseConfig();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      // Второй аргумент — не опциональное украшение: библиотека передаёт в нём
      // запрет кэширования. Ответ с Set-Cookie, осевший в CDN, отдаст сессию
      // одного человека другому.
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        // Ответ пересоздаётся поверх изменённого запроса: иначе обновлённые
        // куки увидит серверный рендер, но не увидит браузер, и на следующей
        // навигации сессия окажется старой.
        response = NextResponse.next({ request });

        for (const { name, options, value } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }

        for (const [header, value] of Object.entries(headers)) {
          response.headers.set(header, value);
        }
      },
    },
  });

  // Клиент инициализируется лениво, поэтому без обращения к auth обновление
  // токена просто не произойдёт.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
