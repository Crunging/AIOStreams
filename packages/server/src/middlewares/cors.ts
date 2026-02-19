import { MiddlewareHandler } from 'hono';
import { HonoEnv } from '../types.js';

export const corsMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  c.res.headers.set('Access-Control-Allow-Origin', '*');
  c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, HEAD, OPTIONS');
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  c.res.headers.set('Access-Control-Allow-Credentials', 'true');
  
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }
  
  await next();
};
