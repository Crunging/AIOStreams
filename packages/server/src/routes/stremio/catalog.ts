import { Context } from 'hono';
import {
  AIOStreams,
  CatalogResponse,
  createLogger,
  StremioTransformer,
} from '@aiostreams/core';
import { HonoEnv } from '../../types.js';

const logger = createLogger('server');

export const catalog = async (c: Context<HonoEnv>) => {
  const userData = c.get('userData');
  if (!userData) {
    return c.json({
      metas: [],
      hasMore: false,
      errors: [{ description: 'Please configure the addon first' }],
    });
  }
  const transformer = new StremioTransformer(userData);

  try {
    const type = c.req.param('type');
    let id = c.req.param('id');
    let extra = c.req.param('extra');

    if (extra) {
      extra = extra.replace(/\.json$/, '');
    } else {
      id = id.replace(/\.json$/, '');
    }

    return c.json(
      transformer.transformCatalog(
        await (
          await new AIOStreams(userData).initialise()
        ).getCatalog(type, id, extra)
      )
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errors = [
      {
        description: errorMsg,
      },
    ];
    if (transformer.showError('catalog', errors)) {
      logger.error(`Unexpected error during catalog retrieval: ${errorMsg}`);
      return c.json(
        transformer.transformCatalog({
          success: false,
          data: [],
          errors,
        })
      );
    }
    throw error;
  }
};
