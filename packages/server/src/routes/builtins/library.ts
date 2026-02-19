import { Context, Hono } from 'hono';
import {
  LibraryAddon,
  fromUrlSafeBase64,
  preWarmLibraryCaches,
  refreshLibraryCacheForService,
  decryptString,
  BuiltinServiceId,
  constants,
  Cache,
  createLogger,
} from '@aiostreams/core';
import { StaticFiles } from '../../app.js';
import { HonoEnv } from '../../types.js';

const app = new Hono<HonoEnv>();
const logger = createLogger('server');

// Rate limit: track last refresh time per service+credential combo
const lastRefreshMap = Cache.getInstance<string, number>(
  'library-refresh-rate-limit',
  1000
);
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

app.get('/:encodedConfig/manifest.json', async (c) => {
  const encodedConfig = c.req.param('encodedConfig');
  try {
    const config = encodedConfig
      ? JSON.parse(fromUrlSafeBase64(encodedConfig))
      : undefined;
    const addon = new LibraryAddon(config, c.get('userIp'));
    const manifest = addon.getManifest();

    // Pre-warm library caches in the background after responding
    if (config?.services) {
      preWarmLibraryCaches(config.services, c.get('userIp'), config.sources);
    }
    
    return c.json(manifest);
  } catch (error) {
    logger.error('Failed to get library manifest:', error);
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
    const addon = new LibraryAddon(
      encodedConfig ? JSON.parse(fromUrlSafeBase64(encodedConfig)) : undefined,
      c.get('userIp')
    );
    const catalog = await addon.getCatalog(type, id, extra);
    return c.json({ metas: catalog });
  } catch (error) {
    logger.error('Failed to get library catalog:', error);
    throw error;
  }
});

app.get('/:encodedConfig/meta/:type/:id', async (c) => {
  const encodedConfig = c.req.param('encodedConfig');
  const type = c.req.param('type');
  const id = c.req.param('id').replace(/\.json$/, '');
  try {
    const addon = new LibraryAddon(
      encodedConfig ? JSON.parse(fromUrlSafeBase64(encodedConfig)) : undefined,
      c.get('userIp')
    );
    const meta = await addon.getMeta(type, id);
    return c.json({ meta });
  } catch (error) {
    logger.error('Failed to get library meta:', error);
    throw error;
  }
});

app.get('/:encodedConfig/stream/:type/:id', async (c) => {
  const encodedConfig = c.req.param('encodedConfig');
  const type = c.req.param('type');
  const id = c.req.param('id').replace(/\.json$/, '');
  try {
    const addon = new LibraryAddon(
      encodedConfig ? JSON.parse(fromUrlSafeBase64(encodedConfig)) : undefined,
      c.get('userIp')
    );
    const streams = await addon.getStreams(type, id);
    return c.json({ streams });
  } catch (error) {
    logger.error('Failed to get library streams:', error);
    throw error;
  }
});

app.get('/refresh/:serviceId/:encryptedCredential', async (c) => {
  const serviceId = c.req.param('serviceId');
  const encryptedCredential = c.req.param('encryptedCredential');

  try {
    const decrypted = decryptString(decodeURIComponent(encryptedCredential));
    if (!decrypted.data) {
      return c.redirect(`/static/${StaticFiles.UNAUTHORIZED}`, 307);
    }

    const parsed = JSON.parse(decrypted.data);
    const svcId = parsed.id as BuiltinServiceId;
    const credential = parsed.credential as string;
    const sources = parsed.sources as ('torrent' | 'nzb')[] | undefined;

    if (
      svcId !== serviceId ||
      !constants.BUILTIN_SUPPORTED_SERVICES.includes(svcId as any)
    ) {
      return c.redirect(`/static/${StaticFiles.UNAUTHORIZED}`, 307);
    }

    // Rate limit: max once per 5 minutes per service+credential
    const rateKey = `${svcId}:${credential}`;
    const lastRefresh = await lastRefreshMap.get(rateKey);
    const now = Date.now();
    if (lastRefresh && now - lastRefresh < REFRESH_COOLDOWN_MS) {
      const timeElapsed = Math.floor((now - lastRefresh) / 1000);
      const remaining = Math.ceil(
        (REFRESH_COOLDOWN_MS - timeElapsed * 1000) / 1000
      );
      logger.info(
        `Refresh rate limited for ${svcId}, ${remaining}s remaining`
      );
      if (timeElapsed < 30) {
        return c.redirect(`/static/${StaticFiles.OK}`, 307);
      }
      return c.redirect(`/static/${StaticFiles.TOO_MANY_REQUESTS}`, 307);
    }

    await lastRefreshMap.set(rateKey, now, REFRESH_COOLDOWN_MS);
    logger.info(`Refreshing library cache for ${svcId} via stream action`);

    // Fire refresh in background, redirect immediately
    refreshLibraryCacheForService(
      svcId,
      credential,
      c.get('userIp'),
      sources
    ).catch((err) =>
      logger.error(`Background refresh failed for ${svcId}`, {
        error: err?.message,
      })
    );

    return c.redirect(`/static/${StaticFiles.OK}`, 307);
  } catch (error) {
    logger.error('Refresh endpoint error', { error });
    return c.redirect(`/static/${StaticFiles.INTERNAL_SERVER_ERROR}`, 307);
  }
});

export default app;
