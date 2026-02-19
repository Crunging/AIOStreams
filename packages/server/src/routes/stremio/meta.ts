import { Context } from 'hono';
import {
  AIOStreams,
  MetaResponse,
  createLogger,
  StremioTransformer,
} from '@aiostreams/core';
import { HonoEnv } from '../../types.js';

const logger = createLogger('server');

export const meta = async (c: Context<HonoEnv>) => {
  const userData = c.get('userData');
  if (!userData) {
    return c.json({
      meta: StremioTransformer.createErrorMeta({
        errorDescription: 'Please configure the addon first',
      }),
    });
  }
  const transformer = new StremioTransformer(userData);
  try {
    const type = c.req.param('type');
    const id = c.req.param('id').replace(/\.json$/, '');
    logger.debug('Meta request received', {
      type,
      id,
      userData,
    });

    if (id.startsWith('aiostreamserror.')) {
      return c.json({
        meta: StremioTransformer.createErrorMeta(
          JSON.parse(decodeURIComponent(id.split('.').slice(1).join('.')))
        ),
      });
    }

    const aiostreams = new AIOStreams(userData);
    await aiostreams.initialise();

    const meta = await aiostreams.getMeta(type, id);
    const streamContext = aiostreams.getStreamContext();

    const transformed = await transformer.transformMeta(
      meta,
      streamContext?.toFormatterContext(),
      {
        provideStreamData: true,
      }
    );
    if (!transformed) {
      return c.notFound();
    }
    return c.json(transformed);
  } catch (error) {
    logger.error('Error in meta route:', error);
    throw error;
  }
};
