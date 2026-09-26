export const APP_NAME = 'Гардероб';

export const STORAGE_BUCKET = 'wardrobe-private';

/** Путь вещи выводится из владельца и id: он обязан пережить ретрай загрузки. */
export function itemPhotoPath(ownerId: string, itemId: string): string {
  return `${ownerId}/items/${itemId}/photo.webp`;
}

/** Путь ревизии карты пола — тот же принцип, другой префикс. */
export function floorMapPhotoPath(ownerId: string, revisionId: string): string {
  return `${ownerId}/floor-maps/${revisionId}/photo.webp`;
}
