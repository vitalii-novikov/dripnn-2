import 'server-only';

import { createClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

/**
 * Клиент, обходящий RLS. Живёт только в файлах `*.server.ts`: попадание
 * service-role ключа в клиентский бандл отдаёт весь гардероб любому, кто
 * откроет DevTools. Границу стережёт тест tests/bundle.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY обязательны',
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
