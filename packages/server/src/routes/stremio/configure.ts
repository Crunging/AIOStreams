import { Context } from 'hono';
import path from 'path';
import fs from 'fs';
import { frontendRoot } from '../../app.js';
import { staticRateLimiter } from '../../middlewares/ratelimit.js';

export const configure = async (c: Context) => {
  // staticRateLimiter is applied at the router level in app.ts
  const html = fs.readFileSync(path.join(frontendRoot, 'index.html'), 'utf-8');
  return c.html(html);
};
