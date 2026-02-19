import { Hono } from 'hono';
import { createResponse } from '../../utils/responses.js';
import {
  APIError,
  constants,
  createLogger,
  formatZodError,
  AnimeDatabase,
  IdType,
  ID_TYPES,
} from '@aiostreams/core';
import { z, ZodError } from 'zod';
import { animeApiRateLimiter } from '../../middlewares/ratelimit.js';
import { HonoEnv } from '../../types.js';

const app = new Hono<HonoEnv>();
const logger = createLogger('server');

app.use('*', animeApiRateLimiter);

app.get('/', async (c) => {
  try {
    const query = c.req.query();
    const {
      idType,
      idValue,
      season,
      episode,
    } = z
      .object({
        idType: z.enum(ID_TYPES),
        idValue: z.union([z.string(), z.coerce.number()]),
        season: z.coerce.number().optional(),
        episode: z.coerce.number().optional(),
      })
      .parse(query);

    const mappingEntry = AnimeDatabase.getInstance().getEntryById(
      idType,
      idValue,
      season,
      episode
    );
    return c.json(
      createResponse({ success: true, detail: 'OK', data: mappingEntry })
    );
  } catch (error: any) {
    if (error instanceof ZodError) {
      throw new APIError(
        constants.ErrorCode.BAD_REQUEST,
        400,
        formatZodError(error)
      );
    }
    logger.error(`Mapping check failed: ${error.message}`);
    throw new APIError(
      constants.ErrorCode.INTERNAL_SERVER_ERROR,
      undefined,
      error.message
    );
  }
});

export default app;
