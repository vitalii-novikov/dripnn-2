type PublicConfig = Readonly<{ anonKey: string; url: string }>;

/**
 * Валидация на границе: отсутствующая переменная окружения должна падать при
 * старте с внятным текстом, а не превращаться в загадочный 401 в рантайме.
 */
export function publicSupabaseConfig(): PublicConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY обязательны',
    );
  }

  return { anonKey, url };
}
