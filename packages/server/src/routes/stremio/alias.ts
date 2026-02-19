import { Context } from 'hono';
import { APIError, constants, createLogger, Env } from '@aiostreams/core';
import { HonoEnv } from '../../types.js';

const logger = createLogger('server');

export const alias = async (c: Context<HonoEnv>) => {
  const alias = c.req.param('alias');
  const wildcardPath = c.req.path.split('/').slice(3).join('/'); // Skip /stremio/u/:alias

  const configuration = Env.ALIASED_CONFIGURATIONS.get(alias);
  if (!configuration || !configuration.uuid || !configuration.password) {
    throw new APIError(constants.ErrorCode.USER_INVALID_DETAILS);
  }

  const redirectPath = `/stremio/${configuration.uuid}/${configuration.password}${wildcardPath ? `/${wildcardPath}` : ''}`;
  logger.debug(`Redirecting alias ${alias} to ${redirectPath}`);

  return c.redirect(redirectPath);
};
