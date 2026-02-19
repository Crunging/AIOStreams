import { Context } from 'hono';
import {
  AIOStreams,
  APIError,
  constants,
  Env,
  UserData,
} from '@aiostreams/core';
import { Manifest } from '@aiostreams/core';
import { createLogger } from '@aiostreams/core';
import { HonoEnv } from '../../types.js';

const logger = createLogger('server');

interface ChillLinkManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  supported_endpoints: {
    feeds: string | null;
    streams: string | null;
  };
}

const getManifest = async (config?: UserData): Promise<ChillLinkManifest> => {
  let addonId = Env.ADDON_ID;
  if (config) {
    addonId += `.${config.uuid?.substring(0, 12)}`;
  }
  let resources: Manifest['resources'] = [];
  if (config) {
    const aiostreams = new AIOStreams(config, { skipFailedAddons: true });

    await aiostreams.initialise();
    resources = aiostreams.getResources();
  }
  return {
    name: config?.addonName || Env.ADDON_NAME,
    id: addonId,
    version: Env.VERSION === 'unknown' ? '0.0.0' : Env.VERSION,
    description: config?.addonDescription || Env.DESCRIPTION,
    supported_endpoints: {
      feeds: null,
      streams:
        resources.find(
          (resource) =>
            (typeof resource === 'string' ? resource : resource.name) ===
            'stream'
        ) !== undefined
          ? '/streams'
          : null,
    },
  };
};

export const manifest = async (c: Context<HonoEnv>) => {
  const userData = c.get('userData');
  logger.debug('Manifest request received', { userData });
  try {
    return c.json(await getManifest(userData));
  } catch (error) {
    logger.error(`Failed to generate manifest: ${error}`);
    throw new APIError(constants.ErrorCode.INTERNAL_SERVER_ERROR);
  }
};
