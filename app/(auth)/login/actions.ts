'use server';

import { headers } from 'next/headers';

import { originFromHeaders } from '@/lib/http/request-origin';
import { mapSupabaseError } from '@/lib/errors/map-supabase-error';
import { createServerSupabaseClient } from '@/lib/supabase/server';

import type { LoginFormState } from './state';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CALLBACK_PATH = '/auth/callback';
const AUTHENTICATED_HOME = '/';

function normalizedEmail(formData: FormData): string | null {
  const value = formData.get('email');

  if (typeof value !== 'string') {
    return null;
  }

  const email = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

async function callbackUrl(): Promise<string> {
  const callback = new URL(CALLBACK_PATH, originFromHeaders(await headers()));
  callback.searchParams.set('next', AUTHENTICATED_HOME);

  return callback.toString();
}

export async function requestMagicLink(
  _previousState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = normalizedEmail(formData);

  if (!email) {
    return {
      status: 'error',
      message: 'Введите корректный адрес электронной почты.',
    };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: await callbackUrl() },
    });

    if (error) {
      const mapped = mapSupabaseError(error, 'отправка ссылки для входа');
      console.error(mapped.message, { cause: mapped.cause });

      return { status: 'error', message: mapped.publicMessage, email };
    }

    // sentAt отличает каждую отправку от предыдущей: без него повторная
    // отправка того же адреса не отличима от старого состояния, и экран
    // не может ни вернуться к подтверждению, ни сообщить об успехе.
    return { status: 'sent', email, sentAt: Date.now() };
  } catch (error) {
    const mapped = mapSupabaseError(error, 'отправка ссылки для входа');
    console.error(mapped.message, { cause: mapped.cause });

    return { status: 'error', message: mapped.publicMessage, email };
  }
}
