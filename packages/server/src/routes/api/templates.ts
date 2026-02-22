import { Hono } from 'hono';
import { createResponse } from '../../utils/responses.js';
import {
  APIError,
  constants,
  createLogger,
  TemplateManager,
} from '@aiostreams/core';
import { HonoEnv } from '../../types.js';

const app = new Hono<HonoEnv>();
const logger = createLogger('server');

app.get('/', async (c) => {
  try {
    const templates = TemplateManager.getTemplates();
    return c.json(createResponse({ success: true, data: templates }));
  } catch (error: any) {
    logger.error(`Failed to load templates: ${error.message}`);
    throw new APIError(
      constants.ErrorCode.INTERNAL_SERVER_ERROR,
      undefined,
      error.message
    );
  }
});

export default app;
