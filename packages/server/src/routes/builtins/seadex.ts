import { Hono } from 'hono';
import { createLogger, SeaDexAddon, fromUrlSafeBase64 } from '@aiostreams/core';
import { HonoEnv } from '../../types.js';

const app = new Hono<HonoEnv>();
const logger = createLogger('server');

app.get('/:encodedConfig/manifest.json', async (c) => {
  const encodedConfig = c.req.param('encodedConfig');
  try {
    const config = encodedConfig
      ? JSON.parse(fromUrlSafeBase64(encodedConfig))
      : undefined;
    const manifest = new SeaDexAddon(config, c.get('userIp')).getManifest();
    return c.json(manifest);
  } catch (error) {
    logger.error('Failed to get manifest:', error);
    throw error;
  }
});

app.get('/:encodedConfig/stream/:type/:id', async (c) => {
  const encodedConfig = c.req.param('encodedConfig');
  const type = c.req.param('type');
  const id = c.req.param('id').replace('.json', '');
  try {
    const config = encodedConfig
      ? JSON.parse(fromUrlSafeBase64(encodedConfig))
      : undefined;
    const streams = await new SeaDexAddon(config, c.get('userIp')).getStreams(
      type,
      id!
    );
    return c.json({ streams });
  } catch (error) {
    logger.error('Failed to get streams:', error);
    throw error;
  }
});

export default app;
