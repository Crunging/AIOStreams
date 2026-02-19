import { Context } from 'hono';
import {
  AIOStreams,
  createLogger,
  StremioTransformer,
} from '@aiostreams/core';
import { HonoEnv } from '../../types.js';

const logger = createLogger('server');

export const subtitle = async (c: Context<HonoEnv>) => {
  const userData = c.get('userData');
  if (!userData) {
    return c.json(
      StremioTransformer.createDynamicError('subtitles', {
        errorDescription: 'Please configure the addon first',
      })
    );
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

    const aiostreams = new AIOStreams(userData);
    await aiostreams.initialise();
    const subtitles = await aiostreams.getSubtitles(type, id, extra);

    return c.json(transformer.transformSubtitles(subtitles));
  } catch (error) {
    let errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    let errors = [
      {
        description: errorMessage,
      },
    ];
    if (transformer.showError('subtitles', errors)) {
      logger.error(
        `Unexpected error during subtitle retrieval: ${errorMessage}`
      );
      return c.json(
        StremioTransformer.createDynamicError('subtitles', {
          errorDescription: errorMessage,
        })
      );
    }
    throw error;
  }
};
