/**
 * Тип и начальное состояние формы живут отдельно от actions.ts: файл с
 * 'use server' может экспортировать только асинхронные функции, и константа
 * в нём ломает загрузку всего модуля экшенов.
 */
export type LoginFormState = Readonly<{
  status: 'idle' | 'sent' | 'error';
  message?: string;
  email?: string;
  /** Отметка конкретной отправки; меняется при каждой успешной. */
  sentAt?: number;
}>;

export const INITIAL_LOGIN_STATE: LoginFormState = { status: 'idle' };
