import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const redirect = vi.fn(() => {
  throw new Error('NEXT_REDIRECT');
});

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('./server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser } }),
}));

const { LOGIN_PATH, requireAuthenticatedUser } = await import('./require-user');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireAuthenticatedUser', () => {
  it('возвращает пользователя, когда сессия валидна', async () => {
    const user = { id: 'user-1' };
    getUser.mockResolvedValue({ data: { user }, error: null });

    await expect(requireAuthenticatedUser()).resolves.toBe(user);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('редиректит на логин, когда сессии нет', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthSessionMissingError', status: 400 },
    });

    await expect(requireAuthenticatedUser()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith(LOGIN_PATH);
  });

  it('редиректит на логин при отклонённом токене', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });

    await expect(requireAuthenticatedUser()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith(LOGIN_PATH);
  });

  it('редиректит, когда пользователя нет и ошибки тоже нет', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(requireAuthenticatedUser()).rejects.toThrow('NEXT_REDIRECT');
  });

  // Главное различие: сбой инфраструктуры нельзя показывать как разлогин,
  // иначе владелец пойдёт заново запрашивать письмо вместо повтора запроса.
  it('пробрасывает ошибку, когда Supabase недоступен, а не редиректит', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });

    await expect(requireAuthenticatedUser()).rejects.toMatchObject({
      name: 'ApplicationError',
      code: 'UNAVAILABLE',
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('пробрасывает ошибку без статуса и имени', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('сеть отвалилась') });

    await expect(requireAuthenticatedUser()).rejects.toMatchObject({
      name: 'ApplicationError',
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});
