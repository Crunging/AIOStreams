import { MiddlewareHandler } from 'hono';
import {
  createLogger,
  APIError,
  constants,
  decryptString,
  validateConfig,
  Resource,
  StremioTransformer,
  UserRepository,
  Env,
  RegexAccess,
  SelAccess,
} from '@aiostreams/core';
import { HonoEnv } from '../types.js';

const logger = createLogger('server');

// Valid resources that require authentication
const VALID_RESOURCES = [
  ...constants.RESOURCES,
  'manifest.json',
  'configure',
  'manifest',
  'streams',
];

export const userDataMiddleware: MiddlewareHandler<HonoEnv> = async (
  c,
  next
) => {
  const uuidOrAlias = c.req.param('uuid');
  const encryptedPassword = c.req.param('encryptedPassword');

  // Both uuid and encryptedPassword should be present since we mounted the router on this path
  if (!uuidOrAlias || !encryptedPassword) {
    throw new APIError(constants.ErrorCode.USER_INVALID_DETAILS);
  }

  // First check - validate path has two components followed by valid resource
  const path = c.req.path;
  // Resource segment is at index 4 for both:
  // /stremio/:uuid/:encryptedPassword/:resource
  // /chilllink/:uuid/:encryptedPassword/:resource
  const resource = path.split('/')[4];

  if (!resource || !VALID_RESOURCES.includes(resource)) {
    await next();
    return;
  }

  // Second check - validate UUID format
  let uuid: string | undefined;
  const uuidRegex =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!uuidRegex.test(uuidOrAlias)) {
    const alias = Env.ALIASED_CONFIGURATIONS.get(uuidOrAlias);
    if (alias) {
      uuid = alias.uuid;
    } else {
      throw new APIError(constants.ErrorCode.USER_INVALID_DETAILS);
    }
  } else {
    uuid = uuidOrAlias;
  }

  // decrypt the encrypted password
  const { success: successfulDecryption, data: decryptedPassword } =
    decryptString(encryptedPassword);
  if (!successfulDecryption || !decryptedPassword) {
    if (constants.RESOURCES.includes(resource as Resource)) {
      return c.json(
        StremioTransformer.createDynamicError(resource as Resource, {
          errorDescription: 'Invalid password',
        })
      );
    }
    throw new APIError(constants.ErrorCode.ENCRYPTION_ERROR);
  }

  // Get and validate user data (this also implicitly checks if the user exists)
  let userData: any;
  try {
    userData = await UserRepository.getUser(uuid, decryptedPassword);
  } catch (error: any) {
    if (constants.RESOURCES.includes(resource as Resource)) {
      return c.json(
        StremioTransformer.createDynamicError(resource as Resource, {
          errorDescription: 'Invalid user or password',
        })
      );
    }
    throw error;
  }

  if (!userData) {
    if (constants.RESOURCES.includes(resource as Resource)) {
      return c.json(
        StremioTransformer.createDynamicError(resource as Resource, {
          errorDescription: 'Invalid user or password',
        })
      );
    }
    throw new APIError(constants.ErrorCode.USER_INVALID_DETAILS);
  }

  userData.encryptedPassword = encryptedPassword;
  userData.uuid = uuid;
  userData.ip = c.get('userIp');

  if (resource !== 'configure') {
    // Parallelize sync calls for better performance
    // List of sync operations to perform
    const syncConfig = [
      // Regex Syncs
      {
        name: 'preferredRegexPatterns',
        critical: false,
        promise: RegexAccess.syncRegexPatterns(
          userData.syncedPreferredRegexUrls,
          userData.preferredRegexPatterns || [],
          userData,
          (regex) => regex,
          (regex) => regex.pattern
        ),
      },
      {
        name: 'excludedRegexPatterns',
        critical: false,
        promise: RegexAccess.syncRegexPatterns(
          userData.syncedExcludedRegexUrls,
          userData.excludedRegexPatterns || [],
          userData,
          (regex) => regex.pattern,
          (pattern) => pattern
        ),
      },
      {
        name: 'requiredRegexPatterns',
        critical: false,
        promise: RegexAccess.syncRegexPatterns(
          userData.syncedRequiredRegexUrls,
          userData.requiredRegexPatterns || [],
          userData,
          (regex) => regex.pattern,
          (pattern) => pattern
        ),
      },
      {
        name: 'includedRegexPatterns',
        critical: false,
        promise: RegexAccess.syncRegexPatterns(
          userData.syncedIncludedRegexUrls,
          userData.includedRegexPatterns || [],
          userData,
          (regex) => regex.pattern,
          (pattern) => pattern
        ),
      },
      {
        name: 'rankedRegexPatterns',
        critical: true,
        promise: RegexAccess.syncRegexPatterns(
          userData.syncedRankedRegexUrls,
          userData.rankedRegexPatterns || [],
          userData,
          (regex: any) => ({
            pattern: regex.pattern,
            name: regex.name,
            score: regex.score || 0,
          }),
          (item: any) => item.pattern
        ),
      },
      // Stream Expression Syncs
      {
        name: 'preferredStreamExpressions',
        critical: false,
        promise: SelAccess.syncStreamExpressions(
          userData.syncedPreferredStreamExpressionUrls,
          userData.preferredStreamExpressions || [],
          userData,
          (item) => ({
            expression: item.expression,
            enabled: item.enabled ?? true,
          }),
          (item) => item.expression
        ),
      },
      {
        name: 'excludedStreamExpressions',
        critical: false,
        promise: SelAccess.syncStreamExpressions(
          userData.syncedExcludedStreamExpressionUrls,
          userData.excludedStreamExpressions || [],
          userData,
          (item) => ({
            expression: item.expression,
            enabled: item.enabled ?? true,
          }),
          (item) => item.expression
        ),
      },
      {
        name: 'requiredStreamExpressions',
        critical: false,
        promise: SelAccess.syncStreamExpressions(
          userData.syncedRequiredStreamExpressionUrls,
          userData.requiredStreamExpressions || [],
          userData,
          (item) => ({
            expression: item.expression,
            enabled: item.enabled ?? true,
          }),
          (item) => item.expression
        ),
      },
      {
        name: 'includedStreamExpressions',
        critical: false,
        promise: SelAccess.syncStreamExpressions(
          userData.syncedIncludedStreamExpressionUrls,
          userData.includedStreamExpressions || [],
          userData,
          (item) => ({
            expression: item.expression,
            enabled: item.enabled ?? true,
          }),
          (item) => item.expression
        ),
      },
      {
        name: 'rankedStreamExpressions',
        critical: true,
        promise: SelAccess.syncStreamExpressions(
          userData.syncedRankedStreamExpressionUrls,
          userData.rankedStreamExpressions || [],
          userData,
          (item) => ({
            expression: item.expression,
            score: item.score || 0,
            enabled: item.enabled ?? true,
          }),
          (item) => item.expression
        ),
      },
    ];

    const syncResults = await Promise.allSettled(
      syncConfig.map((s) => s.promise)
    );

    syncResults.forEach((result, index) => {
      const config = syncConfig[index];
      if (result.status === 'fulfilled') {
        (userData as any)[config.name] = result.value;
      } else {
        const error = result.reason;
        const msg = `Failed to sync ${config.name}: ${error.message}`;
        if (config.critical) {
          logger.error(msg, error);
          throw new APIError(
            constants.ErrorCode.USER_INVALID_CONFIG,
            undefined,
            msg
          );
        } else {
          logger.warn(msg, error);
        }
      }
    });

    try {
      userData = await validateConfig(userData, {
        skipErrorsFromAddonsOrProxies: true,
        decryptValues: true,
      });
    } catch (error: any) {
      if (constants.RESOURCES.includes(resource as Resource)) {
        return c.json(
          StremioTransformer.createDynamicError(resource as Resource, {
            errorDescription: error.message,
          })
        );
      }
      logger.error(`Invalid config for ${uuid}: ${error.message}`);
      throw new APIError(
        constants.ErrorCode.USER_INVALID_CONFIG,
        undefined,
        error.message
      );
    }
  }

  // Attach validated data to context
  c.set('userData', userData);
  c.set('uuid', uuid);
  await next();
};
