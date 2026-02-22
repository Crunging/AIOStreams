import { MiddlewareHandler } from 'hono';
import { createLogger, Env } from '@aiostreams/core';
import { isIP } from 'net';
import { HonoEnv } from '../types.js';
import { getConnInfo } from '@hono/node-server/conninfo';

const logger = createLogger('server');

// Helper function to validate if a string is a valid IP address
function isValidIp(ip: string | undefined): boolean {
  if (!ip) return false;
  // isIP returns 4 for IPv4, 6 for IPv6, and 0 for invalid
  return isIP(ip) !== 0;
}

const ipv4ToLong = (ip: string) =>
  ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>>
  0;

const ipv6ToBigInt = (ip: string): bigint => {
  const [left, right] = ip.split('::');
  const leftParts = left ? left.split(':') : [];
  const rightParts = right ? right.split(':') : [];
  const fullParts = ip.includes('::')
    ? [
        ...leftParts,
        ...Array(8 - (leftParts.length + rightParts.length)).fill('0'),
        ...rightParts,
      ]
    : ip.split(':');

  return fullParts.reduce(
    (acc, hex) => (acc << 16n) + BigInt(parseInt(hex || '0', 16)),
    0n
  );
};

const isIpInRange = (ip: string, range: string) => {
  if (range.includes('/')) {
    // CIDR notation
    const [rangeIp, prefixLength] = range.split('/');
    const prefix = parseInt(prefixLength, 10);

    try {
      if (rangeIp.includes(':')) {
        // IPv6
        if (!ip.includes(':')) return false;
        const ipBig = ipv6ToBigInt(ip);
        const rangeBig = ipv6ToBigInt(rangeIp);
        return (
          ipBig >> BigInt(128 - prefix) === rangeBig >> BigInt(128 - prefix)
        );
      } else {
        // IPv4
        if (ip.includes(':')) return false;
        const ipLong = ipv4ToLong(ip);
        const rangeLong = ipv4ToLong(rangeIp);
        const mask = ~(2 ** (32 - prefix) - 1) >>> 0;
        return (ipLong & mask) === (rangeLong & mask);
      }
    } catch {
      return false;
    }
  }
  // Exact match
  return ip === range;
};

const isPrivateIp = (ip?: string) => {
  if (!ip) {
    return false;
  }
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return /^(10\.|127\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|::1)/.test(
    normalized
  );
};

export const ipMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const getIpFromHeaders = () => {
    return (
      c.req.header('X-Client-IP') ||
      c.req.header('X-Forwarded-For')?.split(',')[0].trim() ||
      c.req.header('X-Real-IP') ||
      c.req.header('CF-Connecting-IP') ||
      c.req.header('True-Client-IP') ||
      c.req.header('X-Forwarded')?.split(',')[0].trim() ||
      c.req.header('Forwarded-For')?.split(',')[0].trim() ||
      undefined // Hono will provide the connection IP if needed elsewhere
    );
  };

  // Use getConnInfo to get the remote address from the underlying node request
  const connInfo = getConnInfo(c);
  const connIp = connInfo.remote.address ?? undefined;

  if (!connIp) {
    // No connection IP available; skip IP-based logic
    c.set('userIp', undefined);
    c.set('requestIp', undefined);
    await next();
    return;
  }

  if (Env.LOG_SENSITIVE_INFO) {
    const headers = {
      'X-Client-IP': c.req.header('X-Client-IP'),
      'X-Forwarded-For': c.req.header('X-Forwarded-For'),
      'X-Real-IP': c.req.header('X-Real-IP'),
      'CF-Connecting-IP': c.req.header('CF-Connecting-IP'),
      'True-Client-IP': c.req.header('True-Client-IP'),
      'X-Forwarded': c.req.header('X-Forwarded'),
      'Forwarded-For': c.req.header('Forwarded-For'),
      ip: connIp,
    };
    logger.debug(
      `Determining user IP based on headers: ${JSON.stringify(headers)}`
    );
  }
  const userIp = getIpFromHeaders() || connIp;
  const ip = connIp;
  const trustedIps = Env.TRUSTED_IPS || [];

  const isTrustedIp = trustedIps.some((range) => isIpInRange(ip, range));
  if (Env.LOG_SENSITIVE_INFO) {
    logger.debug(
      `Determining request IP based on headers: x-forwarded-for: ${c.req.header('X-Forwarded-For')}, cf-connecting-ip: ${c.req.header('CF-Connecting-IP')}, ip: ${ip}`
    );
  }
  const requestIp = isTrustedIp
    ? c.req.header('X-Forwarded-For')?.split(',')[0].trim() ||
      c.req.header('CF-Connecting-IP') ||
      ip
    : ip;

  c.set(
    'userIp',
    isPrivateIp(userIp) || !isValidIp(userIp) ? undefined : userIp
  );
  c.set('requestIp', isValidIp(requestIp) ? requestIp : undefined);

  await next();
};
