import { describe, expect, it } from 'vitest';

import { originFromHeaders } from './request-origin';

describe('originFromHeaders', () => {
  it('берёт хост из заголовка Host', () => {
    expect(originFromHeaders(new Headers({ host: '127.0.0.1:3000' }))).toBe(
      'http://127.0.0.1:3000',
    );
  });

  // Ровно тот случай, из-за которого ломался вход: за прокси реальный хост
  // приходит в x-forwarded-host.
  it('за прокси берёт x-forwarded-host и x-forwarded-proto', () => {
    const headers = new Headers({
      host: 'internal.vercel',
      'x-forwarded-host': 'wardrobe.example',
      'x-forwarded-proto': 'https',
    });

    expect(originFromHeaders(headers)).toBe('https://wardrobe.example');
  });

  it('берёт первый протокол из цепочки x-forwarded-proto', () => {
    const headers = new Headers({ host: 'wardrobe.example', 'x-forwarded-proto': 'https, http' });

    expect(originFromHeaders(headers)).toBe('https://wardrobe.example');
  });

  // Заголовок Origin присылает клиент. Если бы он определял хост, запрос с
  // подделанным Origin увёл бы пользователя на чужой домен.
  it('игнорирует Origin с чужим хостом', () => {
    const headers = new Headers({
      host: 'wardrobe.example',
      origin: 'https://attacker.example',
    });

    expect(originFromHeaders(headers)).toBe('http://wardrobe.example');
  });

  it('уточняет протокол по Origin, только когда хост совпадает', () => {
    const headers = new Headers({
      host: 'wardrobe.example',
      origin: 'https://wardrobe.example',
    });

    expect(originFromHeaders(headers)).toBe('https://wardrobe.example');
  });

  it('переживает неразбираемый Origin', () => {
    const headers = new Headers({ host: 'wardrobe.example', origin: 'not-a-url' });

    expect(originFromHeaders(headers)).toBe('http://wardrobe.example');
  });

  it('падает, когда хост определить нечем, вместо молчаливой подстановки', () => {
    expect(() => originFromHeaders(new Headers())).toThrow(/origin/u);
  });
});
