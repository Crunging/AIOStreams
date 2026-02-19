import { Hono } from 'hono';
import {
  NewznabAddon,
  createLogger,
  fromUrlSafeBase64,
} from '@aiostreams/core';
import { HonoEnv } from '../../types.js';

const app = new Hono<HonoEnv>();
const logger = createLogger('server');

app.get('/:encodedConfig/manifest.json', async (c) => {
  const encodedConfig = c.req.param('encodedConfig');
  try {
    const manifest = new NewznabAddon(
      encodedConfig ? JSON.parse(fromUrlSafeBase64(encodedConfig)) : undefined,
      c.get('userIp')
    ).getManifest();
    return c.json(manifest);
  } catch (error) {
    logger.error('Failed to get newznab manifest:', error);
    throw error;
  }
});

app.get('/:encodedConfig/stream/:type/:id', async (c) => {
  const encodedConfig = c.req.param('encodedConfig');
  const type = c.req.param('type');
  const id = c.req.param('id').replace('.json', '');
  try {
    const addon = new NewznabAddon(
      encodedConfig ? JSON.parse(fromUrlSafeBase64(encodedConfig)) : undefined,
      c.get('userIp')
    );
    const streams = await addon.getStreams(type, id!);
    return c.json({ streams });
  } catch (error) {
    logger.error('Failed to get newznab streams:', error);
    throw error;
  }
});

export default app;
