import { describe, expect, it } from 'vitest';

import { APPLICATION_ERROR_CODES, isApplicationError } from './application-error';
import { mapSupabaseError } from './map-supabase-error';

const CONTEXT = 'загрузка вещей';

describe('mapSupabaseError', () => {
  it('переводит нарушение уникальности в конфликт', () => {
    const mapped = mapSupabaseError({ code: '23505' }, CONTEXT);

    expect(mapped.code).toBe(APPLICATION_ERROR_CODES.CONFLICT);
    expect(mapped.status).toBe(409);
    expect(mapped.retryable).toBe(false);
  });

  it('переводит отказ политики RLS в запрет', () => {
    expect(mapSupabaseError({ code: '42501' }, CONTEXT).code).toBe(
      APPLICATION_ERROR_CODES.FORBIDDEN,
    );
  });

  it('переводит истёкший JWT PostgREST в требование входа', () => {
    expect(mapSupabaseError({ code: 'PGRST301' }, CONTEXT).code).toBe(
      APPLICATION_ERROR_CODES.AUTH_REQUIRED,
    );
  });

  it('помечает превышение лимита как повторяемое', () => {
    const mapped = mapSupabaseError({ status: 429 }, CONTEXT);

    expect(mapped.code).toBe(APPLICATION_ERROR_CODES.RATE_LIMITED);
    expect(mapped.retryable).toBe(true);
  });

  it('объясняет превышение размера файла, а не прячет его в общую ошибку', () => {
    const mapped = mapSupabaseError({ status: 413 }, CONTEXT);

    expect(mapped.code).toBe(APPLICATION_ERROR_CODES.PAYLOAD_TOO_LARGE);
    expect(mapped.publicMessage).toMatch(/большая/u);
  });

  it('помечает недоступность сервиса как повторяемую', () => {
    expect(mapSupabaseError({ status: 503 }, CONTEXT).retryable).toBe(true);
  });

  it('читает статус, пришедший строкой в statusCode', () => {
    expect(mapSupabaseError({ statusCode: '404' }, CONTEXT).code).toBe(
      APPLICATION_ERROR_CODES.NOT_FOUND,
    );
  });

  it('отдаёт приоритет коду базы над HTTP-статусом', () => {
    const mapped = mapSupabaseError({ code: '23514', status: 500 }, CONTEXT);

    expect(mapped.code).toBe(APPLICATION_ERROR_CODES.INVALID_INPUT);
  });

  it.each([null, undefined, 'строка', 42, {}, { code: '' }, { status: 418 }])(
    'сводит неизвестную форму %p к UNEXPECTED',
    (input) => {
      expect(mapSupabaseError(input, CONTEXT).code).toBe(APPLICATION_ERROR_CODES.UNEXPECTED);
    },
  );

  it('не выносит текст исходной ошибки в сообщение для пользователя', () => {
    const mapped = mapSupabaseError(
      { code: '42501', message: 'permission denied for table items' },
      CONTEXT,
    );

    expect(mapped.publicMessage).not.toContain('items');
    expect(mapped.publicMessage).not.toContain('permission denied');
  });

  it('сохраняет оригинал в cause и контекст в сообщении для лога', () => {
    const original = { code: '23503' };
    const mapped = mapSupabaseError(original, CONTEXT);

    expect(mapped.cause).toBe(original);
    expect(mapped.context).toBe(CONTEXT);
    expect(mapped.message).toContain(CONTEXT);
    expect(isApplicationError(mapped)).toBe(true);
  });

  it('не считает произвольную ошибку доменной', () => {
    expect(isApplicationError(new Error('обычная'))).toBe(false);
  });
});
