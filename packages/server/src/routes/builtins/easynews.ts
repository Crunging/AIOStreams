import { Context, Hono } from 'hono';
import {
  EasynewsSearchAddon,
  EasynewsApi,
  EasynewsNzbParamsSchema,
  EasynewsAuthSchema,
  fromUrlSafeBase64,
  createLogger,
  NzbProxyManager,
  APIError,
  constants,
} from '@aiostreams/core';
import { easynewsNzbRateLimiter } from '../../middlewares/index.js';
import { createResponse } from '../../utils/responses.js';
import { HonoEnv } from '../../types.js';

const app = new Hono<HonoEnv>();
const logger = createLogger('server');

app.get('/:encodedConfig/manifest.json', async (c) => {
  const encodedConfig = c.req.param('encodedConfig');
  try {
    const manifest = new EasynewsSearchAddon(
      encodedConfig ? JSON.parse(fromUrlSafeBase64(encodedConfig)) : undefined,
      c.get('userIp')
    ).getManifest();
    return c.json(manifest);
  } catch (error) {
    logger.error('Failed to get easynews manifest:', error);
    throw error;
  }
});

app.get('/:encodedConfig/stream/:type/:id', async (c) => {
  const encodedConfig = c.req.param('encodedConfig');
  const type = c.req.param('type');
  const id = c.req.param('id').replace('.json', '');
  try {
    const addon = new EasynewsSearchAddon(
      encodedConfig ? JSON.parse(fromUrlSafeBase64(encodedConfig)) : undefined,
      c.get('userIp')
    );
    const streams = await addon.getStreams(type, id!);
    return c.json({ streams });
  } catch (error) {
    logger.error('Failed to get easynews streams:', error);
    throw error;
  }
});

/**
 * NZB endpoint - fetches NZB from Easynews and serves it
 * This endpoint is needed because Easynews requires a POST request to fetch NZBs
 */
app.get(
  '/nzb/:encodedAuth/:encodedParams/:aiostreamsAuth?/:filename',
  easynewsNzbRateLimiter,
  async (c) => {
    const encodedAuth = c.req.param('encodedAuth');
    const encodedParams = c.req.param('encodedParams');
    const encodedAiostreamsAuth = c.req.param('aiostreamsAuth');

    try {
      // Decode and validate auth credentials
      let auth;
      try {
        const decodedAuth = fromUrlSafeBase64(encodedAuth);
        auth = EasynewsAuthSchema.parse(JSON.parse(decodedAuth));
      } catch (e) {
        logger.warn('Failed to decode/parse Easynews auth');
        throw new APIError(
          constants.ErrorCode.BAD_REQUEST,
          undefined,
          'Invalid authentication'
        );
      }

      // Decode and validate NZB params
      let nzbParams;
      try {
        nzbParams = EasynewsNzbParamsSchema.parse(
          JSON.parse(fromUrlSafeBase64(encodedParams))
        );
      } catch (e) {
        logger.warn('Failed to decode/parse NZB params');
        throw new APIError(
          constants.ErrorCode.BAD_REQUEST,
          undefined,
          'Invalid NZB parameters'
        );
      }

      // Parse optional AIOStreams auth for bypass
      let aiostreamsAuth: { username: string; password: string } | undefined;
      if (encodedAiostreamsAuth) {
        try {
          const decoded = fromUrlSafeBase64(encodedAiostreamsAuth);
          const [username, password] = decoded.split(':');
          if (username && password) {
            aiostreamsAuth = { username, password };
          }
        } catch (e) {
          logger.debug(
            'Invalid AIOStreams auth in URL, continuing without bypass'
          );
        }
      }

      // Check if Easynews NZB proxy is enabled
      if (!NzbProxyManager.isEasynewsProxyEnabled(aiostreamsAuth)) {
        return c.json(
          createResponse({
            error: {
              code: 'NZB_PROXY_DISABLED',
              message: 'Easynews NZB proxying is disabled',
            },
            success: false,
          }),
          503
        );
      }

      // Check rate limits
      const userKey = NzbProxyManager.getUserKey(auth.username);
      const rateLimitCheck = NzbProxyManager.checkRateLimit(
        userKey,
        aiostreamsAuth
      );
      if (!rateLimitCheck.allowed) {
        logger.warn('Rate limit exceeded for Easynews NZB fetch', {
          userKey,
          reason: rateLimitCheck.reason,
        });
        throw new APIError(
          constants.ErrorCode.RATE_LIMIT_EXCEEDED,
          undefined,
          rateLimitCheck.reason || 'Rate limit exceeded'
        );
      }

      const api = new EasynewsApi(auth.username, auth.password);
      const { content, filename } = await api.fetchNzb(nzbParams);

      const sizeCheck = NzbProxyManager.checkSizeLimit(
        content.length,
        aiostreamsAuth
      );
      if (!sizeCheck.allowed) {
        logger.warn('NZB size limit exceeded', {
          size: content.length,
          reason: sizeCheck.reason,
        });
        return c.json(
          createResponse({
            error: {
              code: 'NZB_SIZE_LIMIT_EXCEEDED',
              message: sizeCheck.reason || 'NZB size limit exceeded',
            },
            success: false,
          }),
          413
        );
      }

      if (!rateLimitCheck.authorised) {
        NzbProxyManager.incrementRateLimit(userKey);
      }

      // Set headers for NZB download
      c.header('Content-Type', 'application/x-nzb');
      c.header(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"`
      );
      c.header('Content-Length', content.length.toString());

      return c.body(content as any);
    } catch (error) {
      logger.error(
        `Failed to fetch NZB: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }
);

export default app;
