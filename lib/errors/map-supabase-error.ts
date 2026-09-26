import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
  type ApplicationErrorCode,
} from './application-error';

type ErrorDefinition = Readonly<{
  code: ApplicationErrorCode;
  publicMessage: string;
  retryable: boolean;
  status: number;
}>;

const AUTH_REQUIRED: ErrorDefinition = {
  code: APPLICATION_ERROR_CODES.AUTH_REQUIRED,
  publicMessage: 'Сессия истекла. Войдите снова.',
  retryable: false,
  status: 401,
};

const FORBIDDEN: ErrorDefinition = {
  code: APPLICATION_ERROR_CODES.FORBIDDEN,
  publicMessage: 'Недостаточно прав для этого действия.',
  retryable: false,
  status: 403,
};

const NOT_FOUND: ErrorDefinition = {
  code: APPLICATION_ERROR_CODES.NOT_FOUND,
  publicMessage: 'Запись не найдена.',
  retryable: false,
  status: 404,
};

const CONFLICT: ErrorDefinition = {
  code: APPLICATION_ERROR_CODES.CONFLICT,
  publicMessage: 'Данные изменились. Обновите страницу и повторите.',
  retryable: false,
  status: 409,
};

const INVALID_INPUT: ErrorDefinition = {
  code: APPLICATION_ERROR_CODES.INVALID_INPUT,
  publicMessage: 'Данные не прошли проверку.',
  retryable: false,
  status: 422,
};

// Storage отвечает 413 на превышение лимита бакета. Общее «что-то пошло не
// так» здесь бесполезно: человек не поймёт, что делать с фотографией.
const PAYLOAD_TOO_LARGE: ErrorDefinition = {
  code: APPLICATION_ERROR_CODES.PAYLOAD_TOO_LARGE,
  publicMessage: 'Фотография слишком большая. Попробуйте снимок меньшего размера.',
  retryable: false,
  status: 413,
};

const RATE_LIMITED: ErrorDefinition = {
  code: APPLICATION_ERROR_CODES.RATE_LIMITED,
  publicMessage: 'Слишком много попыток. Подождите немного.',
  retryable: true,
  status: 429,
};

const UNAVAILABLE: ErrorDefinition = {
  code: APPLICATION_ERROR_CODES.UNAVAILABLE,
  publicMessage: 'Сервис временно недоступен. Повторите попытку.',
  retryable: true,
  status: 503,
};

const UNEXPECTED: ErrorDefinition = {
  code: APPLICATION_ERROR_CODES.UNEXPECTED,
  publicMessage: 'Что-то пошло не так. Повторите попытку.',
  retryable: false,
  status: 500,
};

// Коды Postgres, до которых приложение реально может дотянуться через RLS и
// констрейнты Этапа 1. 42501 приходит и от политики, и от триггера
// storage.protect_delete — для пользователя это один и тот же «нельзя».
const BY_DATABASE_CODE: Readonly<Record<string, ErrorDefinition>> = {
  '23502': INVALID_INPUT,
  '23503': CONFLICT,
  '23505': CONFLICT,
  '23514': INVALID_INPUT,
  '42501': FORBIDDEN,
  PGRST116: NOT_FOUND,
  PGRST301: AUTH_REQUIRED,
};

const BY_STATUS: Readonly<Record<number, ErrorDefinition>> = {
  400: INVALID_INPUT,
  401: AUTH_REQUIRED,
  403: FORBIDDEN,
  404: NOT_FOUND,
  409: CONFLICT,
  413: PAYLOAD_TOO_LARGE,
  422: INVALID_INPUT,
  429: RATE_LIMITED,
  500: UNEXPECTED,
  502: UNAVAILABLE,
  503: UNAVAILABLE,
  504: UNAVAILABLE,
};

function readCode(source: Record<string, unknown>): string | null {
  const code = source.code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

function readStatus(source: Record<string, unknown>): number | null {
  for (const key of ['status', 'statusCode'] as const) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && /^\d+$/u.test(value)) {
      return Number.parseInt(value, 10);
    }
  }
  return null;
}

function definitionFor(error: unknown): ErrorDefinition {
  if (typeof error !== 'object' || error === null) {
    return UNEXPECTED;
  }

  const source = error as Record<string, unknown>;

  const byCode = readCode(source);
  if (byCode && byCode in BY_DATABASE_CODE) {
    return BY_DATABASE_CODE[byCode]!;
  }

  const status = readStatus(source);
  if (status !== null && status in BY_STATUS) {
    return BY_STATUS[status]!;
  }

  return UNEXPECTED;
}

/**
 * Единственная точка перевода ошибок PostgREST, Storage и GoTrue в доменную
 * ошибку. Оригинал сохраняется в `cause`: детали нужны в логе, но не на экране.
 */
export function mapSupabaseError(error: unknown, context: string): ApplicationError {
  const definition = definitionFor(error);

  return new ApplicationError({
    ...definition,
    cause: error,
    context,
  });
}
