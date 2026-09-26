import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import { originFromHeaders } from '@/lib/http/request-origin';
import type { Database } from '@/lib/supabase/database.types';
import { publicSupabaseConfig } from '@/lib/supabase/config';

const LOGIN_PATH = '/login';
const AUTHENTICATED_HOME = '/';

/**
 * Куда угодно, лишь бы внутрь приложения. `next` приходит из ссылки в письме,
 * то есть из данных, которые можно подделать: абсолютный URL или `//host`
 * превратили бы вход в открытый редирект на чужой сайт.
 */
function safeDestination(value: string | null): string {
  if (!value || !value.startsWith('/')) {
    return AUTHENTICATED_HOME;
  }

  if (value.startsWith('//') || value.startsWith('/\\')) {
    return AUTHENTICATED_HOME;
  }

  return value;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = originFromHeaders(request.headers);
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  const loginUrl = new URL(LOGIN_PATH, origin);
  loginUrl.searchParams.set('error', 'callback');

  if (!code) {
    return NextResponse.redirect(loginUrl);
  }

  // Куки и заголовки копятся отдельно от ответа: при неудачном обмене ответ
  // меняется на редирект к логину, и всё, что библиотека успела выставить,
  // обязано переехать вместе с ним — иначе на следующей попытке останется
  // протухший verifier.
  const pendingCookies: { name: string; value: string; options: object }[] = [];
  const pendingHeaders: Record<string, string> = {};

  const { anonKey, url } = publicSupabaseConfig();
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value);
          pendingCookies.push(cookie);
        }

        Object.assign(pendingHeaders, headers);
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('Обмен кода на сессию не удался', { cause: error });
  }

  const destination = error
    ? loginUrl
    : new URL(safeDestination(requestUrl.searchParams.get('next')), origin);
  const response = NextResponse.redirect(destination);

  for (const { name, options, value } of pendingCookies) {
    response.cookies.set(name, value, options);
  }

  for (const [header, value] of Object.entries(pendingHeaders)) {
    response.headers.set(header, value);
  }

  return response;
}
