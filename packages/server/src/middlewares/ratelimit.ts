import {
  Env,
  createLogger,
  constants,
  APIError,
  StremioTransformer,
} from '@aiostreams/core';
import { rateLimiter, RedisStore } from 'hono-rate-limiter';
import { createClient } from 'redis';
import { getConnInfo } from '@hono/node-server/conninfo';

const logger = createLogger('server');

// Create a single Redis client for rate limiting if configured
let redisClient: ReturnType<typeof createClient> | undefined;

if (
  Env.REDIS_URI &&
  Env.RATE_LIMIT_STORE === 'redis' &&
  !Env.DISABLE_RATE_LIMITS
) {
  redisClient = createClient({
    url: Env.REDIS_URI,
  });
  redisClient.on('error', (err) => {
    logger.error('Redis client error:', err);
  });
  redisClient.connect().catch((err) => {
    logger.error('Failed to connect to Redis for rate limiting:', err);
  });
}

const createRateLimiter = (
  windowMs: number,
  maxRequests: number,
  prefix: string = ''
) => {
  if (Env.DISABLE_RATE_LIMITS) {
    return async (c: any, next: any) => await next();
  }

  // Redis client adapter to bridge node-redis v5 with hono-rate-limiter
  const redisClientAdapter = redisClient
    ? {
        scriptLoad: (lua: string) => redisClient!.scriptLoad(lua),
        evalsha: (sha: string, keys: string[], args: unknown[]) =>
          redisClient!.evalSha(sha, { keys, arguments: args as string[] }),
        decr: (key: string) => redisClient!.decr(key),
        del: (key: string) => redisClient!.del(key),
      }
    : undefined;

  return rateLimiter({
    windowMs,
    limit: maxRequests,
    standardHeaders: 'draft-6',
    keyGenerator: (c) => {
      const info = getConnInfo(c);
      const ip = info.remote?.address || 'unknown';
      return `${prefix}:${ip}`;
    },
    store: redisClientAdapter
      ? new RedisStore({
          client: redisClientAdapter as any,
          prefix: `aiostreams:ratelimit:${prefix}:`,
        })
      : undefined, // undefined falls back to MemoryStore
    handler: (c) => {
      const info = getConnInfo(c);
      const ip = info.remote?.address || 'unknown';
      logger.warn(`${prefix} rate limit exceeded for IP: ${ip}`);

      const stremioResourceRequestRegex =
        /^\/stremio\/[0-9a-fA-F-]{36}\/[A-Za-z0-9_=-]+\/(stream|meta|addon_catalog|subtitles|catalog)/;
      const resource = stremioResourceRequestRegex.exec(
        new URL(c.req.url).pathname
      );

      if (resource) {
        return c.json(
          StremioTransformer.createDynamicError(resource[1] as any, {
            errorDescription: 'Rate Limit Exceeded',
          })
        );
      }

      throw new APIError(constants.ErrorCode.RATE_LIMIT_EXCEEDED);
    },
  });
};

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
