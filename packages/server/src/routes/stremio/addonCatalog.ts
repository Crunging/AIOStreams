import { Context } from 'hono';
import {
  AddonCatalogResponse,
  AIOStreams,
  createLogger,
  StremioTransformer,
} from '@aiostreams/core';
import { HonoEnv } from '../../types.js';

const logger = createLogger('server');

export const addonCatalog = async (c: Context<HonoEnv>) => {
  const userData = c.get('userData');
  if (!userData) {
    return c.json({
      addons: [
        StremioTransformer.createErrorAddonCatalog({
          errorDescription: 'Please configure the addon first',
        }),
      ],
    });
  }
  const transformer = new StremioTransformer(userData);

  try {
    const type = c.req.param('type');
    const idRaw = c.req.param('id.json') || c.req.param('id') || '';
    const id = idRaw.replace(/\.json$/, '');
    logger.debug('Addon catalog request received', {
      type,
      id,
    });
    const aiostreams = new AIOStreams(userData);
    await aiostreams.initialise();
    const addonCatalog = await aiostreams.getAddonCatalog(type, id);
    return c.json(transformer.transformAddonCatalog(addonCatalog));
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errors = [
      {
        title: 'Addon Catalog Error',
        description: errorMsg,
      },
    ];
    if (transformer.showError('addon_catalog', errors)) {
      logger.error(
        `Unexpected error during addon catalog retrieval: ${errorMsg}`
      );
      return c.json(
        transformer.transformAddonCatalog({
          success: false,
          data: [],
          errors,
        })
      );
    }
    throw error;
  }
};
