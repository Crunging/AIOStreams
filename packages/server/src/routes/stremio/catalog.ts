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
    let idRaw = c.req.param('id.json') || c.req.param('id');
    let extraRaw = c.req.param('extra.json') || c.req.param('extra');
    
    let id: string = '';
    let extra: string | undefined = undefined;
    
    if (extraRaw !== undefined) {
      extra = extraRaw.replace(/\.json$/, '');
      id = idRaw;
    } else if (idRaw !== undefined) {
      id = idRaw.replace(/\.json$/, '');
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
