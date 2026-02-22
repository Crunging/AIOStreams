import { Context } from 'hono';
import {
  AIOStreams,
  Env,
  createLogger,
  StremioTransformer,
} from '@aiostreams/core';
import { HonoEnv } from '../../types.js';

const logger = createLogger('server');

export const stream = async (c: Context<HonoEnv>) => {
  const userData = c.get('userData');
  const requestIp = c.get('requestIp');

  // Check if we have user data (set by middleware in authenticated routes)
  if (!userData) {
    // Return a response indicating configuration is needed
    return c.json(
      StremioTransformer.createDynamicError('stream', {
        errorDescription: 'Please configure the addon first',
      })
    );
  }
  const transformer = new StremioTransformer(userData);

  const provideStreamData =
    Env.PROVIDE_STREAM_DATA !== undefined
      ? typeof Env.PROVIDE_STREAM_DATA === 'boolean'
        ? Env.PROVIDE_STREAM_DATA
        : requestIp
          ? (Array.isArray(Env.PROVIDE_STREAM_DATA)
              ? Env.PROVIDE_STREAM_DATA
              : String(Env.PROVIDE_STREAM_DATA).split(',')
            )
              .map((ip: string) => ip.trim())
              .filter(Boolean)
              .includes(requestIp)
          : false
      : (c.req.header('user-agent')?.includes('AIOStreams/') ?? false);

  try {
    const type = c.req.param('type');
    const idRaw = c.req.param('id.json') ?? c.req.param('id');
    const id = (idRaw ?? '').replace(/\.json$/, '');

    const aiostreams = await new AIOStreams(userData).initialise();

    const disableAutoplay = await aiostreams.shouldStopAutoPlay(type, id);

    const response = await aiostreams.getStreams(id, type);
    const streamContext = aiostreams.getStreamContext();

    if (!streamContext) {
      throw new Error('Stream context not available');
    }

    return c.json(
      await transformer.transformStreams(
        response,
        streamContext.toFormatterContext(response.data.streams),
        { provideStreamData, disableAutoplay }
      )
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errors = [
      {
        description: errorMessage,
      },
    ];
    if (transformer.showError('stream', errors)) {
      logger.error(
        `Unexpected error during stream retrieval: ${errorMessage}`,
        error
      );
      return c.json(
        StremioTransformer.createDynamicError('stream', {
          errorDescription: errorMessage,
        })
      );
    }
    logger.debug(`Re-throwing suppressed stream error: ${errorMessage}`);
    throw error;
  }
};
