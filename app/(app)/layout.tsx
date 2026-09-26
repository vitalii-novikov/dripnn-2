import type { ReactNode } from 'react';

import { requireAuthenticatedUser } from '@/lib/supabase/require-user';

/**
 * Оболочка всего приватного раздела. Проверка здесь, а не в proxy: маршрут,
 * случайно выпавший из matcher'а, не должен становиться публичным.
 */
export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  await requireAuthenticatedUser();

  return children;
}
