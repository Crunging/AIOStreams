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
    const id = c.req.param('id').replace('.json', '');
    logger.debug('Addon catalog request received', {
      type,
      id,
    });
    return c.json(
      transformer.transformAddonCatalog(
        await (
          await new AIOStreams(userData).initialise()
        ).getAddonCatalog(type, id)
      )
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errors = [
      {
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
