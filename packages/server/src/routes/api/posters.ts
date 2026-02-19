import { Hono } from 'hono';
import {
  APIError,
  constants,
  createLogger,
  formatZodError,
  createPosterServiceFromParams,
} from '@aiostreams/core';
import { createResponse } from '../../utils/responses.js';
import { z } from 'zod';
import { HonoEnv } from '../../types.js';

const app = new Hono<HonoEnv>();
const logger = createLogger('server');

const searchParams = z.object({
  id: z.string(),
  type: z.string(),
  fallback: z.string().optional(),
  apiKey: z.string(),
  profileId: z.string().optional(),
});

/**
 * Combined poster redirect handler.
 * Supports all poster services via /:service parameter.
 * e.g. /posters/rpdb, /posters/top-poster, /posters/aioratings
 */
app.get('/:service', async (c) => {
  try {
    const query = c.req.query();
    const { success, data, error } = searchParams.safeParse(query);
    if (!success) {
      return c.json(
        createResponse({
          success: false,
          detail: 'Invalid request',
          error: {
            code: constants.ErrorCode.BAD_REQUEST,
            message: formatZodError(error),
          },
        }),
        400
      );
    }

    const { id, type, fallback, apiKey, profileId } = data;
    const service = c.req.param('service');

    const posterService = createPosterServiceFromParams(service, apiKey, {
      profileId: profileId || 'default',
    });

    if (!posterService) {
      return c.json(
        createResponse({
          success: false,
          detail: `Unknown poster service: ${service}`,
          error: {
            code: constants.ErrorCode.BAD_REQUEST,
            message: `Unsupported poster service: ${service}`,
          },
        }),
        400
      );
    }

    let posterUrl: string | null = await posterService.getPosterUrl(type, id);
    posterUrl = posterUrl || fallback || null;

    if (!posterUrl) {
      return c.json(
        createResponse({
          success: false,
          detail: 'Not found',
        }),
        404
      );
    }

    return c.redirect(posterUrl, 301);
  } catch (error: any) {
    throw new APIError(
      constants.ErrorCode.INTERNAL_SERVER_ERROR,
      undefined,
      error.message
    );
  }
});

export default app;
