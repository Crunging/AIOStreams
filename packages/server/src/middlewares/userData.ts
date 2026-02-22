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
  const resourceRegex = new RegExp(`/(${VALID_RESOURCES.join('|')})`);
  const path = c.req.path;

  const resourceMatch = path.match(resourceRegex);
  if (!resourceMatch) {
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

  const resource = resourceMatch[1];

  // Check if user exists
  const userExists = await UserRepository.checkUserExists(uuid);
  if (!userExists) {
    if (constants.RESOURCES.includes(resource as Resource)) {
      return c.json(
        StremioTransformer.createDynamicError(resource as Resource, {
          errorDescription: 'User not found',
        })
      );
    }
    throw new APIError(constants.ErrorCode.USER_INVALID_DETAILS);
  }

  // decrypt the encrypted password
  const { success: successfulDecryption, data: decryptedPassword } =
    decryptString(encryptedPassword!);
  if (!successfulDecryption) {
    if (constants.RESOURCES.includes(resource as Resource)) {
      return c.json(
        StremioTransformer.createDynamicError(resource as Resource, {
          errorDescription: 'Invalid password',
        })
      );
    }
    throw new APIError(constants.ErrorCode.ENCRYPTION_ERROR);
  }

  // Get and validate user data
  let userData = await UserRepository.getUser(uuid, decryptedPassword);

  if (!userData) {
    if (constants.RESOURCES.includes(resource as Resource)) {
      return c.json(
        StremioTransformer.createDynamicError(resource as Resource, {
          errorDescription: 'Invalid password',
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
    const syncPromises = [
      // Regex Syncs
      RegexAccess.syncRegexPatterns(
        userData.syncedPreferredRegexUrls,
        userData.preferredRegexPatterns || [],
        userData,
        (regex) => regex,
        (regex) => regex.pattern
      )
        .then((res) => (userData!.preferredRegexPatterns = res))
        .catch((e) =>
          logger.warn(`Failed to sync preferred regex patterns: ${e.message}`)
        ),

      RegexAccess.syncRegexPatterns(
        userData.syncedExcludedRegexUrls,
        userData.excludedRegexPatterns || [],
        userData,
        (regex) => regex.pattern,
        (pattern) => pattern
      )
        .then((res) => (userData!.excludedRegexPatterns = res))
        .catch((e) =>
          logger.warn(`Failed to sync excluded regex patterns: ${e.message}`)
        ),

      RegexAccess.syncRegexPatterns(
        userData.syncedRequiredRegexUrls,
        userData.requiredRegexPatterns || [],
        userData,
        (regex) => regex.pattern,
        (pattern) => pattern
      )
        .then((res) => (userData!.requiredRegexPatterns = res))
        .catch((e) =>
          logger.warn(`Failed to sync required regex patterns: ${e.message}`)
        ),

      RegexAccess.syncRegexPatterns(
        userData.syncedIncludedRegexUrls,
        userData.includedRegexPatterns || [],
        userData,
        (regex) => regex.pattern,
        (pattern) => pattern
      )
        .then((res) => (userData!.includedRegexPatterns = res))
        .catch((e) =>
          logger.warn(`Failed to sync included regex patterns: ${e.message}`)
        ),

      RegexAccess.syncRegexPatterns(
        userData.syncedRankedRegexUrls,
        userData.rankedRegexPatterns || [],
        userData,
        (regex) => ({
          pattern: regex.pattern,
          name: regex.name,
          score: regex.score || 0,
        }),
        (item) => item.pattern
      )
        .then((res) => (userData!.rankedRegexPatterns = res))
        .catch((e) =>
          logger.warn(`Failed to sync ranked regex patterns: ${e.message}`)
        ),

      // Stream Expression Syncs
      SelAccess.syncStreamExpressions(
        userData.syncedPreferredStreamExpressionUrls,
        userData.preferredStreamExpressions || [],
        userData,
        (item) => ({
          expression: item.expression,
          enabled: item.enabled ?? true,
        }),
        (item) => item.expression
      )
        .then((res) => (userData!.preferredStreamExpressions = res))
        .catch((e) =>
          logger.warn(
            `Failed to sync preferred stream expressions: ${e.message}`
          )
        ),

      SelAccess.syncStreamExpressions(
        userData.syncedExcludedStreamExpressionUrls,
        userData.excludedStreamExpressions || [],
        userData,
        (item) => ({
          expression: item.expression,
          enabled: item.enabled ?? true,
        }),
        (item) => item.expression
      )
        .then((res) => (userData!.excludedStreamExpressions = res))
        .catch((e) =>
          logger.warn(
            `Failed to sync excluded stream expressions: ${e.message}`
          )
        ),

      SelAccess.syncStreamExpressions(
        userData.syncedRequiredStreamExpressionUrls,
        userData.requiredStreamExpressions || [],
        userData,
        (item) => ({
          expression: item.expression,
          enabled: item.enabled ?? true,
        }),
        (item) => item.expression
      )
        .then((res) => (userData!.requiredStreamExpressions = res))
        .catch((e) =>
          logger.warn(
            `Failed to sync required stream expressions: ${e.message}`
          )
        ),

      SelAccess.syncStreamExpressions(
        userData.syncedIncludedStreamExpressionUrls,
        userData.includedStreamExpressions || [],
        userData,
        (item) => ({
          expression: item.expression,
          enabled: item.enabled ?? true,
        }),
        (item) => item.expression
      )
        .then((res) => (userData!.includedStreamExpressions = res))
        .catch((e) =>
          logger.warn(
            `Failed to sync included stream expressions: ${e.message}`
          )
        ),

      SelAccess.syncStreamExpressions(
        userData.syncedRankedStreamExpressionUrls,
        userData.rankedStreamExpressions || [],
        userData,
        (item) => ({
          expression: item.expression,
          score: item.score || 0,
          enabled: item.enabled ?? true,
        }),
        (item) => item.expression
      )
        .then((res) => (userData!.rankedStreamExpressions = res))
        .catch((e) =>
          logger.warn(`Failed to sync ranked stream expressions: ${e.message}`)
        ),
    ];

    await Promise.all(syncPromises);

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
