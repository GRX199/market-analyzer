import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import { isSafeConfiguredSecret } from '@/lib/trading/validation';

const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

export class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 | 415
  ) {
    super(message);
    this.name = 'RequestBodyError';
  }
}

export async function readJsonBody(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES
): Promise<unknown> {
  const contentType = request.headers.get('content-type');
  if (contentType?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestBodyError('Content-Type must be application/json', 415);
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes < 0 ||
      declaredBytes > maxBytes
    ) {
      throw new RequestBodyError('Request body is too large', 413);
    }
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new RequestBodyError('Request body is too large', 413);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestBodyError('Request body must be valid JSON', 400);
  }
}

export function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  return match?.[1] ?? null;
}

export function safeSecretEqual(
  presentedSecret: string,
  expectedSecret: string
): boolean {
  const presentedHash = createHash('sha256').update(presentedSecret).digest();
  const expectedHash = createHash('sha256').update(expectedSecret).digest();
  return timingSafeEqual(presentedHash, expectedHash);
}

export type SecretAuthorization =
  | { authorized: true }
  | { authorized: false; misconfigured: boolean };

export function authorizeBearerRequest(
  request: Request,
  expectedSecrets: Array<string | undefined>
): SecretAuthorization {
  const configuredSecrets = expectedSecrets
    .map((secret) => secret?.trim())
    .filter(isSafeConfiguredSecret);

  if (configuredSecrets.length === 0) {
    return { authorized: false, misconfigured: true };
  }

  const presentedSecret = getBearerToken(request);
  if (
    presentedSecret === null ||
    !configuredSecrets.some((secret) =>
      safeSecretEqual(presentedSecret, secret)
    )
  ) {
    return { authorized: false, misconfigured: false };
  }

  return { authorized: true };
}

export function authorizeWorkerRequest(request: Request): SecretAuthorization {
  return authorizeBearerRequest(request, [
    process.env.TRADING_WORKER_TOKEN,
  ]);
}
