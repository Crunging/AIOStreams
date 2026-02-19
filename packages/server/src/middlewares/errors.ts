import { Context } from 'hono';
import {
  createLogger,
  APIError,
  constants,
  StremioTransformer,
} from '@aiostreams/core';
import { createResponse } from '../utils/responses.js';
import { ZodError } from 'zod';
import { HonoEnv } from '../types.js';

const logger = createLogger('server');

export const errorMiddleware = (
  err: Error,
  c: Context<HonoEnv>
) => {
  let error;
  if (!(err instanceof APIError) && !(err instanceof ZodError)) {
    // log unexpected errors
    logger.error(err);
    logger.error(err.stack);
    error = new APIError(constants.ErrorCode.INTERNAL_SERVER_ERROR);
  } else {
    error = err;
  }

  if (error instanceof ZodError) {
    return c.json(
      createResponse({
        success: false,
        error: {
          code: constants.ErrorCode.BAD_REQUEST,
          message: 'Invalid Request',
          issues: error.issues,
        },
      }),
      400
    );
  }

  if (error instanceof APIError && error.code === constants.ErrorCode.RATE_LIMIT_EXCEEDED) {
    const stremioResourceRequestRegex =
      /^\/stremio\/[0-9a-fA-F-]{36}\/[A-Za-z0-9+/=]+\/(stream|meta|addon_catalog|subtitles|catalog)\/[^/]+\/[^/]+(?:\/[^/]+)?\.json\/?$/;
    const resource = stremioResourceRequestRegex.exec(new URL(c.req.url).pathname);
    if (resource) {
      return c.json(
        StremioTransformer.createDynamicError(
          resource[1] as
            | 'stream'
            | 'meta'
            | 'addon_catalog'
            | 'subtitles'
            | 'catalog',
          {
            errorDescription: 'Rate Limit Exceeded',
          }
        )
      );
    }
  }

  const statusCode = error instanceof APIError ? error.statusCode : 500;
  const code = error instanceof APIError ? error.code : constants.ErrorCode.INTERNAL_SERVER_ERROR;

  return c.json(
    createResponse({
      success: false,
      error: {
        code: code,
        message: error.message,
      },
    }),
    statusCode as any
  );
};
