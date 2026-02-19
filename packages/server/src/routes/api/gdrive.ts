import { Hono } from 'hono';
import { createResponse } from '../../utils/responses.js';
import {
  APIError,
  constants,
  createLogger,
  GoogleOAuth,
} from '@aiostreams/core';
import { HonoEnv } from '../../types.js';

const app = new Hono<HonoEnv>();
const logger = createLogger('server');

app.post('/', async (c) => {
  try {
    const { code } = await c.req.json();
    if (!code) {
      throw new APIError(
        constants.ErrorCode.BAD_REQUEST,
        undefined,
        'Code is required'
      );
    }
    const { access_token, refresh_token } =
      await GoogleOAuth.exchangeAuthorisationCode(code);
    return c.json(
      createResponse({
        success: true,
        data: {
          accessToken: access_token,
          refreshToken: refresh_token,
        },
      })
    );
  } catch (error: any) {
    logger.error(`GDrive authorisation failed: ${error.message}`);
    throw new APIError(
      constants.ErrorCode.INTERNAL_SERVER_ERROR,
      undefined,
      error.message
    );
  }
});

export default app;
