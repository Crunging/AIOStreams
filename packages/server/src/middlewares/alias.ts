import { Context, Next } from 'hono';
import { Env } from '@aiostreams/core';
import { HonoEnv } from '../types.js';

// Resolves alias to UUID for user API routes.
// If the provided value is not a UUID and matches a known alias, replaces it with the real UUID.
export async function resolveUuidAliasForUserApi(c: Context<HonoEnv>, next: Next) {
  const uuidRegex =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

  const method = c.req.method.toUpperCase();

  if (method === 'GET' || method === 'HEAD') {
    const value = c.req.query('uuid');
    if (typeof value === 'string' && !uuidRegex.test(value)) {
      const configuration = Env.ALIASED_CONFIGURATIONS.get(value);
      if (configuration?.uuid) {
        c.set('uuid', configuration.uuid);
      }
    }
  } else if (method === 'POST') {
    try {
      const body = await c.req.json();
      c.set('parsedBody', body);
      const value = body.uuid;
      if (typeof value === 'string' && !uuidRegex.test(value)) {
        const configuration = Env.ALIASED_CONFIGURATIONS.get(value);
        if (configuration?.uuid) {
          body.uuid = configuration.uuid;
        }
      }
    } catch {}
  } else if (method === 'PUT' || method === 'DELETE') {
    try {
      const body = await c.req.json();
      c.set('parsedBody', body);
      const value = body.uuid;
      if (typeof value === 'string' && !uuidRegex.test(value)) {
        const configuration = Env.ALIASED_CONFIGURATIONS.get(value);
        if (configuration?.uuid) {
          c.set('uuid', configuration.uuid);
        }
      }
    } catch {}
  }

  await next();
}
