import { MiddlewareHandler } from 'hono';
import { timingSafeEqual } from 'crypto';
import { createResponse } from '../utils/responses.js';
import { constants, Env } from '@aiostreams/core';
import { HonoEnv } from '../types.js';

const WHITELIST = ['/easynews/nzb', '/library/refresh'];

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export const internalMiddleware: MiddlewareHandler<HonoEnv> = async (
  c,
  next
) => {
  const path = c.req.path;

  if (WHITELIST.some((p) => path === p || path.startsWith(`${p}/`))) {
    await next();
    return;
  }

  const internalSecret = c.req.header(constants.INTERNAL_SECRET_HEADER);
  if (
    (!internalSecret ||
      !safeCompare(internalSecret, Env.INTERNAL_SECRET ?? '')) &&
    Env.NODE_ENV !== 'development'
  ) {
    return c.json(
      createResponse({
        success: false,
        detail: 'Forbidden',
      }),
      403
    );
  }

  await next();
};
