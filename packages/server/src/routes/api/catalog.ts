import { Hono } from 'hono';
import { createResponse } from '../../utils/responses.js';
import { catalogApiRateLimiter } from '../../middlewares/ratelimit.js';
import {
  createLogger,
  UserData,
  AIOStreams,
  validateConfig,
  APIError,
  constants,
} from '@aiostreams/core';
import { HonoEnv } from '../../types.js';

const app = new Hono<HonoEnv>();
const logger = createLogger('server');

app.use('*', catalogApiRateLimiter);

app.post('/', async (c) => {
  const { userData } = await c.req.json();
  try {
    let validatedUserData: UserData;
    try {
      validatedUserData = await validateConfig(userData, {
        skipErrorsFromAddonsOrProxies: false,
        decryptValues: true,
        increasedManifestTimeout: true,
        bypassManifestCache: true,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Invalid addon password')
      ) {
        error.message =
          'Please make sure the addon password is provided and correct by attempting to create/save a user first';
      }
      throw new APIError(
        constants.ErrorCode.USER_INVALID_CONFIG,
        undefined,
        error instanceof Error ? error.message : undefined
      );
    }
    validatedUserData.catalogModifications = undefined;

    const aio = new AIOStreams(validatedUserData);
    await aio.initialise();
    
    // return minimal catalog data
    const catalogs = aio.getCatalogs().map((catalog: any) => ({
      id: catalog.id,
      name: catalog.name,
      type: catalog.type,
      addonName: aio.getAddon(catalog.id.split('.')[0])?.name,

      hideable: catalog.extra
        ? catalog.extra.every((e: any) => !e.isRequired)
        : true,
      searchable: catalog.extra
        ? catalog.extra?.findIndex(
            (e: any) => e.name === 'search' && !e.isRequired
          ) !== -1
        : false,
    }));
    return c.json(createResponse({ success: true, data: catalogs }));
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    } else {
      throw new APIError(constants.ErrorCode.INTERNAL_SERVER_ERROR);
    }
  }
});

export default app;
