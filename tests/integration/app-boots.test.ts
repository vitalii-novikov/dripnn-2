import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

// Гейт Этапа 0: приложение поднимается на свежесброшенной БД. Проверяем не
// «сервер отвечает 200», а что схема доехала и RLS уже работает: аноним,
// постучавшийся в базовую таблицу, обязан получить отказ.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

describe('the app boots against a freshly reset database', () => {
  it('has the local Supabase stack wired into the environment', () => {
    expect(SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL is missing').toBeTruthy();
    expect(ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing').toBeTruthy();
  });

  it('rejects an anonymous read of a base table', async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!);
    const { data, error } = await anon.from('items').select('id');

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  // Не «главная отдаёт 200»: с Этапа 2 она приватна, и fetch по умолчанию
  // пошёл бы по редиректу на /login, где слово «Гардероб» тоже есть. Такой
  // тест был бы зелёным независимо от того, работает ли защита.
  it('редиректит анонима с главной на логин', async () => {
    const response = await fetch('http://127.0.0.1:3000/', { redirect: 'manual' });

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get('location')).toContain('/login');
  });

  it('отдаёт страницу логина анониму', async () => {
    const response = await fetch('http://127.0.0.1:3000/login');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Вход в каталог');
  });
});
