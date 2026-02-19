import { MiddlewareHandler } from 'hono';
import {
  createLogger,
  getTimeTakenSincePoint,
  maskSensitiveInfo,
  makeUrlLogSafe,
} from '@aiostreams/core';
import { HonoEnv } from '../types.js';

const logger = createLogger('server');

export const loggerMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const startTime = Date.now();
  const url = c.req.url;
  const method = c.req.method;
  const userIp = c.get('userIp');
  const requestIp = c.get('requestIp');

  // Log incoming request
  logger.http({
    type: 'request',
    method: method,
    path: makeUrlLogSafe(url),
    query: c.req.query(),
    ip: userIp ? maskSensitiveInfo(userIp) : undefined,
    contentType: c.req.header('content-type'),
    userAgent: c.req.header('user-agent'),
    formatted: `${method} ${makeUrlLogSafe(url)}${userIp ? ` - u:${maskSensitiveInfo(userIp)}` : ''}${requestIp ? ` - r:${maskSensitiveInfo(requestIp)}` : ''} - ${c.req.header('content-type')} - ${c.req.header('user-agent')}`,
  });

  await next();

  // Calculate duration after response is sent
  const duration = getTimeTakenSincePoint(startTime);

  // Log response details
  logger.http({
    type: 'response',
    method: method,
    path: makeUrlLogSafe(url),
    statusCode: c.res.status,
    duration,
    ip: userIp ? maskSensitiveInfo(userIp) : undefined,
    contentType: c.res.headers.get('content-type') || undefined,
    contentLength: c.res.headers.get('content-length') || undefined,
    formatted: `${method} ${makeUrlLogSafe(url)}${userIp ? ` - u: ${maskSensitiveInfo(userIp)}` : ''}${requestIp ? ` - r: ${maskSensitiveInfo(requestIp)}` : ''} - Response: ${c.res.status} - ${duration}`,
  });
};
