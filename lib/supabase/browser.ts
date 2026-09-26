import { createBrowserClient } from '@supabase/ssr';

import type { Database } from './database.types';

import { publicSupabaseConfig } from './config';

/**
 * Клиент для клиентских компонентов. Ключ здесь — только anon: он публичен по
 * замыслу, а всё, что он может, ограничено RLS.
 */
export function createBrowserSupabaseClient() {
  const { anonKey, url } = publicSupabaseConfig();

  return createBrowserClient<Database>(url, anonKey);
}
