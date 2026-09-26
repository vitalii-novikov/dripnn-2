/**
 * Origin, которым реально пользуется браузер.
 *
 * `request.url` для этого не годится: dev-сервер Next отдаёт в нём
 * `http://localhost:3000`, даже когда клиент пришёл на `127.0.0.1:3000`, а за
 * прокси Vercel там оказывается внутренний адрес. Редирект, построенный от
 * него, уводит пользователя на другой origin — и куки сессии, выставленные для
 * исходного, туда не едут. Снаружи это выглядит как «вошёл и сразу выкинуло».
 *
 * Авторитет — хост, а не заголовок `Origin`: последний присылает клиент, и для
 * роут-хендлера (в отличие от серверного экшена) Next его не сверяет. Доверять
 * ему значило бы получить редирект на чужой домен по запросу с подделанным
 * заголовком. `Origin` используется только чтобы уточнить протокол, и только
 * когда его хост совпадает с фактическим.
 */
export function originFromHeaders(requestHeaders: Headers): string {
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');

  if (!host) {
    throw new Error('Не удалось определить origin запроса');
  }

  return new URL(`${protocolFor(requestHeaders, host)}://${host}`).origin;
}

function protocolFor(requestHeaders: Headers, host: string): string {
  const forwarded = requestHeaders.get('x-forwarded-proto');

  if (forwarded) {
    return forwarded.split(',')[0]!.trim();
  }

  const origin = requestHeaders.get('origin');

  if (origin) {
    try {
      const parsed = new URL(origin);

      if (parsed.host === host) {
        return parsed.protocol.replace(':', '');
      }
    } catch {
      // Неразбираемый Origin — просто не подсказка, а не повод падать.
    }
  }

  return 'http';
}
