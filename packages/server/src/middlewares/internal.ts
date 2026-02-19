import { MiddlewareHandler } from 'hono';
import { createResponse } from '../utils/responses.js';
import { constants, Env } from '@aiostreams/core';
import { HonoEnv } from '../types.js';

const WHIELIST = ['/easynews/nzb', '/library/refresh'];

export const internalMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const url = new URL(c.req.url);
  const path = url.pathname;
  
  if (WHIELIST.some((p) => path.startsWith(p))) {
    await next();
    return;
  }
  
  const internalSecret = c.req.header(constants.INTERNAL_SECRET_HEADER);
  if (
    internalSecret !== Env.INTERNAL_SECRET &&
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
