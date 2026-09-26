export const APPLICATION_ERROR_CODES = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  CONFLICT: 'CONFLICT',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  UNAVAILABLE: 'UNAVAILABLE',
  UNEXPECTED: 'UNEXPECTED',
} as const;

export type ApplicationErrorCode =
  (typeof APPLICATION_ERROR_CODES)[keyof typeof APPLICATION_ERROR_CODES];

/**
 * Ошибка с двумя аудиториями: `publicMessage` показывается человеку,
 * `cause` и `context` остаются в логах. Разделение нужно, чтобы текст
 * PostgREST с именами таблиц и колонок не утёк на экран.
 */
export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly publicMessage: string;
  readonly retryable: boolean;
  readonly status: number;
  readonly context: string;

  constructor(options: {
    code: ApplicationErrorCode;
    publicMessage: string;
    retryable: boolean;
    status: number;
    context: string;
    cause?: unknown;
  }) {
    super(`${options.code} while ${options.context}`, { cause: options.cause });
    this.name = 'ApplicationError';
    this.code = options.code;
    this.publicMessage = options.publicMessage;
    this.retryable = options.retryable;
    this.status = options.status;
    this.context = options.context;
  }
}

export function isApplicationError(value: unknown): value is ApplicationError {
  return value instanceof ApplicationError;
}
