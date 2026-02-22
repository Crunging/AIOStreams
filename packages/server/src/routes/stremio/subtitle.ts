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
    const idRaw = c.req.param('id.json') ?? c.req.param('id');
    const extraRaw = c.req.param('extra.json') ?? c.req.param('extra');

    const id = (idRaw ?? '').replace(/\.json$/, '');
    const extra =
      extraRaw && extraRaw.length > 0
        ? extraRaw.replace(/\.json$/, '')
        : undefined;

    const aiostreams = new AIOStreams(userData);
    await aiostreams.initialise();
    const subtitles = await aiostreams.getSubtitles(type, id, extra);

    return c.json(transformer.transformSubtitles(subtitles));
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const errors = [
      {
        title: 'Subtitles Error',
        description: errorMessage,
      },
    ];
    if (transformer.showError('subtitles', errors)) {
      logger.error(
        `Unexpected error during subtitle retrieval: ${errorMessage}`,
        error
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
