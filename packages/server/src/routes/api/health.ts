import { Hono } from 'hono';
import { createResponse } from '../../utils/responses.js';
import {
  APIError,
  constants,
  createLogger,
  UserRepository,
} from '@aiostreams/core';
import { HonoEnv } from '../../types.js';

const app = new Hono<HonoEnv>();
const logger = createLogger('server');

app.get('/', async (c) => {
  try {
    await UserRepository.getUserCount();
    return c.json(createResponse({ success: true, detail: 'OK' }));
  } catch (error: any) {
    logger.error(`Health check failed: ${error.message}`);
    throw new APIError(constants.ErrorCode.INTERNAL_SERVER_ERROR, error.message);
  }
});

export default app;
