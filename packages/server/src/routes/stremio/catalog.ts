import { Context } from 'hono';
import {
  AIOStreams,
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
    
    const normalizeParam = (value?: string) =>
      value?.replace(/\.json$/, '') ?? '';
    const id = normalizeParam(idRaw);
    const extra = extraRaw !== undefined ? normalizeParam(extraRaw) : undefined;

    const aiostreams = new AIOStreams(userData);
    await aiostreams.initialise();
    const catalog = await aiostreams.getCatalog(type, id, extra);
    return c.json(transformer.transformCatalog(catalog));
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
    logger.debug(`Re-throwing suppressed catalog error: ${errorMsg}`);
    throw error;
  }
};
