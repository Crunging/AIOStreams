import { MiddlewareHandler } from 'hono';
import {
  Env,
  createLogger,
  constants,
  APIError,
  Cache,
  REDIS_PREFIX,
  StremioTransformer,
} from '@aiostreams/core';
import { HonoEnv } from '../types.js';

const logger = createLogger('server');

// Simplified rate limiter for Hono using Hono's built-in memory or custom storage
const createRateLimiter = (
  windowMs: number,
  maxRequests: number,
  prefix: string = ''
) => {
  if (Env.DISABLE_RATE_LIMITS) {
    return async (c: any, next: any) => await next();
  }

  // Very basic in-memory rate limiter for now, 
  // in production we should use a proper Hono rate limiter package or custom Redis implementation
  const memoryStore = new Map<string, { count: number; resetTime: number }>();

  return async (c: any, next: any) => {
    const ip = c.get('requestIp') || c.get('userIp') || 'unknown';
    const key = `${prefix}:${ip}`;
    const now = Date.now();
    
    let record = memoryStore.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 0, resetTime: now + windowMs };
    }
    
    record.count++;
    memoryStore.set(key, record);

    if (record.count > maxRequests) {
      const timeRemaining = record.resetTime - now;
      logger.warn(
        `${prefix} rate limit exceeded for IP: ${ip} - Time remaining: ${timeRemaining}ms`
      );
      
      const stremioResourceRequestRegex =
        /^\/stremio\/[0-9a-fA-F-]{36}\/[A-Za-z0-9+/=]+\/(stream|meta|addon_catalog|subtitles|catalog)\/[^/]+\/[^/]+(?:\/[^/]+)?\.json\/?$/;
      const resource = stremioResourceRequestRegex.exec(new URL(c.req.url).pathname);
      
      if (resource) {
        return c.json(
          StremioTransformer.createDynamicError(
            resource[1] as any,
            { errorDescription: 'Rate Limit Exceeded' }
          )
        );
      }
      
      throw new APIError(constants.ErrorCode.RATE_LIMIT_EXCEEDED);
    }
    
    await next();
  };
};

// ... (exports remain the same, just created with the new function)
export const userApiRateLimiter = createRateLimiter(
  Env.USER_API_RATE_LIMIT_WINDOW * 1000,
  Env.USER_API_RATE_LIMIT_MAX_REQUESTS,
  'user-api'
);

export const streamApiRateLimiter = createRateLimiter(
  Env.STREAM_API_RATE_LIMIT_WINDOW * 1000,
  Env.STREAM_API_RATE_LIMIT_MAX_REQUESTS,
  'stream-api'
);

export const formatApiRateLimiter = createRateLimiter(
  Env.FORMAT_API_RATE_LIMIT_WINDOW * 1000,
  Env.FORMAT_API_RATE_LIMIT_MAX_REQUESTS,
  'format-api'
);

export const catalogApiRateLimiter = createRateLimiter(
  Env.CATALOG_API_RATE_LIMIT_WINDOW * 1000,
  Env.CATALOG_API_RATE_LIMIT_MAX_REQUESTS,
  'catalog-api'
);

export const animeApiRateLimiter = createRateLimiter(
  Env.ANIME_API_RATE_LIMIT_WINDOW * 1000,
  Env.ANIME_API_RATE_LIMIT_MAX_REQUESTS,
  'anime-api'
);

export const stremioStreamRateLimiter = createRateLimiter(
  Env.STREMIO_STREAM_RATE_LIMIT_WINDOW * 1000,
  Env.STREMIO_STREAM_RATE_LIMIT_MAX_REQUESTS,
  'stremio-stream'
);

export const stremioCatalogRateLimiter = createRateLimiter(
  Env.STREMIO_CATALOG_RATE_LIMIT_WINDOW * 1000,
  Env.STREMIO_CATALOG_RATE_LIMIT_MAX_REQUESTS,
  'stremio-catalog'
);

export const stremioManifestRateLimiter = createRateLimiter(
  Env.STREMIO_MANIFEST_RATE_LIMIT_WINDOW * 1000,
  Env.STREMIO_MANIFEST_RATE_LIMIT_MAX_REQUESTS,
  'stremio-manifest'
);

export const stremioSubtitleRateLimiter = createRateLimiter(
  Env.STREMIO_SUBTITLE_RATE_LIMIT_WINDOW * 1000,
  Env.STREMIO_SUBTITLE_RATE_LIMIT_MAX_REQUESTS,
  'stremio-subtitle'
);

export const stremioMetaRateLimiter = createRateLimiter(
  Env.STREMIO_META_RATE_LIMIT_WINDOW * 1000,
  Env.STREMIO_META_RATE_LIMIT_MAX_REQUESTS,
  'stremio-meta'
);

export const staticRateLimiter = createRateLimiter(
  Env.STATIC_RATE_LIMIT_WINDOW * 1000,
  Env.STATIC_RATE_LIMIT_MAX_REQUESTS,
  'static'
);

export const easynewsNzbRateLimiter = createRateLimiter(
  Env.EASYNEWS_NZB_RATE_LIMIT_WINDOW * 1000,
  Env.EASYNEWS_NZB_RATE_LIMIT_MAX_REQUESTS,
  'easynews-nzb'
);
