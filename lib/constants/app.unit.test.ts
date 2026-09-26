import { describe, expect, it } from 'vitest';

import { floorMapPhotoPath, itemPhotoPath, STORAGE_BUCKET } from './app';

const OWNER_ID = '10000000-0000-0000-0000-000000000001';
const ITEM_ID = '14000000-0000-0000-0000-000000000001';
const REVISION_ID = '12000000-0000-0000-0000-000000000001';

describe('storage paths', () => {
  it('derives the item photo path from owner and item id', () => {
    expect(itemPhotoPath(OWNER_ID, ITEM_ID)).toBe(`${OWNER_ID}/items/${ITEM_ID}/photo.webp`);
  });

  it('derives the floor map photo path from owner and revision id', () => {
    expect(floorMapPhotoPath(OWNER_ID, REVISION_ID)).toBe(
      `${OWNER_ID}/floor-maps/${REVISION_ID}/photo.webp`,
    );
  });

  it('keeps the owner id as the first path segment, which storage policies key on', () => {
    expect(itemPhotoPath(OWNER_ID, ITEM_ID).split('/')[0]).toBe(OWNER_ID);
    expect(floorMapPhotoPath(OWNER_ID, REVISION_ID).split('/')[0]).toBe(OWNER_ID);
  });

  it('names the private bucket', () => {
    expect(STORAGE_BUCKET).toBe('wardrobe-private');
  });
});
