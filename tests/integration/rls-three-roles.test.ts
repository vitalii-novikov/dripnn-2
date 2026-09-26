import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { itemPhotoPath, STORAGE_BUCKET } from '@/lib/constants/app';

// Тот же набор инвариантов, что и pgTAP, но через PostgREST и Storage — то есть
// по тому пути, которым реально ходит приложение. pgTAP доказывает, что политика
// написана; этот слой доказывает, что её не обойти снаружи.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const PASSWORD = 'integration-password-1';

interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createUser(email: string): Promise<TestUser> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`could not create ${email}: ${error?.message}`);
  }

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signIn.error) {
    throw new Error(`could not sign in ${email}: ${signIn.error.message}`);
  }

  return { id: data.user.id, email, client };
}

function uniqueEmail(role: string): string {
  return `${role}-${crypto.randomUUID()}@example.test`;
}

let owner: TestUser;
let intruder: TestUser;
let ownerItemId: string;

const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

beforeAll(async () => {
  owner = await createUser(uniqueEmail('owner'));
  intruder = await createUser(uniqueEmail('intruder'));

  for (const user of [owner, intruder]) {
    const { error } = await user.client
      .from('wardrobes')
      .insert({ owner_id: user.id, slug: `w-${user.id.slice(0, 8)}` });
    if (error) throw new Error(`wardrobe for ${user.email}: ${error.message}`);
  }

  ownerItemId = crypto.randomUUID();
  const { error } = await owner.client.from('items').insert({
    id: ownerItemId,
    owner_id: owner.id,
    photo_path: itemPhotoPath(owner.id, ownerItemId),
  });
  if (error) throw new Error(`owner item: ${error.message}`);
}, 60_000);

afterAll(async () => {
  for (const user of [owner, intruder]) {
    if (user?.id) await admin.auth.admin.deleteUser(user.id);
  }
});

describe('роль: владелец', () => {
  it('видит свою вещь', async () => {
    const { data, error } = await owner.client.from('items').select('id');

    expect(error).toBeNull();
    expect(data?.map((row) => row.id)).toContain(ownerItemId);
  });

  it('оценивает свою вещь и получает текущий tier из каталога', async () => {
    const inserted = await owner.client
      .from('tier_events')
      .insert({ item_id: ownerItemId, owner_id: owner.id, tier: 'B' });
    expect(inserted.error).toBeNull();

    const { data } = await owner.client
      .from('item_catalog')
      .select('current_tier')
      .eq('id', ownerItemId)
      .single();

    expect(data?.current_tier).toBe('B');
  });

  it('не может передать created_at события — колонка вне гранта', async () => {
    const { error } = await owner.client.from('tier_events').insert({
      item_id: ownerItemId,
      owner_id: owner.id,
      tier: 'S',
      created_at: '2000-01-01T00:00:00Z',
    });

    expect(error).not.toBeNull();
  });

  it('не может изменить историю оценок', async () => {
    const { error } = await owner.client
      .from('tier_events')
      .update({ tier: 'S' })
      .eq('item_id', ownerItemId);

    expect(error).not.toBeNull();
  });

  it('не может удалить вещь — только архивировать', async () => {
    const deletion = await owner.client.from('items').delete().eq('id', ownerItemId);
    expect(deletion.error).not.toBeNull();

    const archival = await owner.client
      .from('items')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', ownerItemId);
    expect(archival.error).toBeNull();

    // История переживает архивирование: отсев не стирает оценки.
    const { data } = await owner.client
      .from('tier_events')
      .select('id')
      .eq('item_id', ownerItemId);
    expect(data?.length).toBeGreaterThan(0);

    await owner.client.from('items').update({ archived_at: null }).eq('id', ownerItemId);
  });

  it('не может загрузить файл под чужим префиксом', async () => {
    const foreignPath = itemPhotoPath(intruder.id, crypto.randomUUID());
    const { error } = await owner.client.storage
      .from(STORAGE_BUCKET)
      .upload(foreignPath, new Blob([new Uint8Array([1])], { type: 'image/webp' }));

    expect(error).not.toBeNull();
  });
});

describe('роль: второй авторизованный', () => {
  it('не видит вещи владельца', async () => {
    const { data, error } = await intruder.client.from('items').select('id');

    expect(error).toBeNull();
    expect(data?.map((row) => row.id)).not.toContain(ownerItemId);
  });

  it('не видит историю оценок владельца', async () => {
    const { data } = await intruder.client
      .from('tier_events')
      .select('id')
      .eq('item_id', ownerItemId);

    expect(data).toEqual([]);
  });

  it('не может привязать свою вещь к зоне владельца', async () => {
    const zone = await owner.client
      .from('zones')
      .insert({ owner_id: owner.id, name: 'Кучка владельца' })
      .select('id')
      .single();
    expect(zone.error).toBeNull();

    const intruderItemId = crypto.randomUUID();
    const { error } = await intruder.client.from('items').insert({
      id: intruderItemId,
      owner_id: intruder.id,
      zone_id: zone.data!.id,
      photo_path: itemPhotoPath(intruder.id, intruderItemId),
    });

    expect(error).not.toBeNull();
  });
});

describe('роль: аноним', () => {
  it.each(['wardrobes', 'floor_map_revisions', 'zones', 'items', 'tier_events'])(
    'не читает %s',
    async (table) => {
      const { data, error } = await anon.from(table).select('*');

      expect(data).toBeNull();
      expect(error).not.toBeNull();
    },
  );

  it('не читает приватный объект по прямому пути', async () => {
    const { error } = await anon.storage
      .from(STORAGE_BUCKET)
      .download(itemPhotoPath(owner.id, ownerItemId));

    expect(error).not.toBeNull();
  });
});
