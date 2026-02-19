import { Hono } from 'hono';
import { createLogger, fromUrlSafeBase64, GDriveAddon } from '@aiostreams/core';
import { HonoEnv } from '../../types.js';

const app = new Hono<HonoEnv>();
const logger = createLogger('server');

app.get('/manifest.json', async (c) => {
  return c.json(GDriveAddon.getManifest());
});

app.get('/:encodedConfig/manifest.json', async (c) => {
  const encodedConfig = c.req.param('encodedConfig');
  try {
    const config = JSON.parse(fromUrlSafeBase64(encodedConfig));
    const manifest = new GDriveAddon(config).getManifest();
    return c.json(manifest);
  } catch (error) {
    logger.error(`Failed to generate gdrive manifest: ${error}`);
    throw error;
  }
});

app.get('/:encodedConfig/meta/:type/:id', async (c) => {
  const encodedConfig = c.req.param('encodedConfig');
  const type = c.req.param('type');
  const id = c.req.param('id').replace(/\.json$/, '');
  try {
    const config = JSON.parse(fromUrlSafeBase64(encodedConfig));
    const addon = new GDriveAddon(config);
    const meta = await addon.getMeta(type, id!);
    return c.json({ meta });
  } catch (error) {
    logger.error(`Failed to get gdrive meta: ${error}`);
    throw error;
  }
});

app.get('/:encodedConfig/catalog/:type/:id/:extra?', async (c) => {
  const encodedConfig = c.req.param('encodedConfig');
  const type = c.req.param('type');
  let id = c.req.param('id');
  let extra = c.req.param('extra');

  if (extra) {
    extra = extra.replace(/\.json$/, '');
  } else {
    id = id.replace(/\.json$/, '');
  }

  try {
    const config = JSON.parse(fromUrlSafeBase64(encodedConfig));
    const addon = new GDriveAddon(config);
    const catalog = await addon.getCatalog(type, id!, extra);
    return c.json({ metas: catalog });
  } catch (error) {
    logger.error(`Failed to get gdrive catalog: ${error}`);
    throw error;
  }
});

app.get('/:encodedConfig/stream/:type/:id', async (c) => {
  const encodedConfig = c.req.param('encodedConfig');
  const type = c.req.param('type');
  const id = c.req.param('id').replace(/\.json$/, '');
  try {
    const config = JSON.parse(fromUrlSafeBase64(encodedConfig));
    const addon = new GDriveAddon(config);
    const streams = await addon.getStreams(type, id!);
    return c.json({ streams });
  } catch (error) {
    logger.error(`Failed to get gdrive streams: ${error}`);
    throw error;
  }
});

export default app;
