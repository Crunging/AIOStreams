import { Hono } from 'hono';
import {
  APIError,
  constants,
  createLogger,
  RegexAccess,
  SelAccess,
  UserRepository,
} from '@aiostreams/core';
import { z } from 'zod';
import { createResponse } from '../../utils/responses.js';
import { HonoEnv } from '../../types.js';

const app = new Hono<HonoEnv>();
const logger = createLogger('server');

const ResolveSyncedSchema = z.object({
  regexUrls: z.array(z.string().url()).max(10).optional(),
  selUrls: z.array(z.string().url()).max(10).optional(),
  uuid: z.string().optional(),
  password: z.string().optional(),
});

app.post('/resolve', async (c) => {
  const body = await c.req.json();
  const parsed = ResolveSyncedSchema.safeParse(body);
  if (!parsed.success) {
    throw new APIError(
      constants.ErrorCode.MISSING_REQUIRED_FIELDS,
      undefined,
      'regexUrls and selUrls must be arrays of valid URLs (max 10 each)'
    );
  }

  const { regexUrls, selUrls, uuid, password } = parsed.data;

  if (!regexUrls?.length && !selUrls?.length) {
    throw new APIError(
      constants.ErrorCode.MISSING_REQUIRED_FIELDS,
      undefined,
      'At least one of regexUrls or selUrls must be provided'
    );
  }

  try {
    const userData =
      (uuid && password
        ? await UserRepository.getUser(uuid, password)
        : undefined) ?? undefined;

    const [regexResults, selResults] = await Promise.all([
      regexUrls?.length
        ? RegexAccess.resolvePatternsWithErrors(regexUrls, userData)
        : Promise.resolve(undefined),
      selUrls?.length
        ? SelAccess.resolveExpressionsWithErrors(selUrls, userData)
        : Promise.resolve(undefined),
    ]);

    // Flatten successful items
    const patterns = regexResults?.flatMap((r) => r.items);
    const expressions = selResults?.flatMap((r) => r.items);

    // Collect per-URL errors
    const errors: { url: string; error: string }[] = [];
    if (regexResults) {
      for (const r of regexResults) {
        if (r.error) errors.push({ url: r.url, error: r.error });
      }
    }
    if (selResults) {
      for (const r of selResults) {
        if (r.error) errors.push({ url: r.url, error: r.error });
      }
    }

    return c.json(
      createResponse({
        success: true,
        detail:
          errors.length > 0
            ? `Resolved with ${errors.length} error(s)`
            : 'Synced items resolved successfully',
        data: {
          ...(patterns !== undefined && { patterns }),
          ...(expressions !== undefined && { expressions }),
          ...(errors.length > 0 && { errors }),
        },
      })
    );
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    } else {
      logger.error(error);
      throw new APIError(constants.ErrorCode.INTERNAL_SERVER_ERROR);
    }
  }
});

export default app;
