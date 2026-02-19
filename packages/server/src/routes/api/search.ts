import { Hono } from 'hono';
import {
  AIOStreams,
  AIOStreamResponse,
  Env,
  UserData,
  UserRepository,
  APIError,
  constants,
  formatZodError,
  validateConfig,
  isEncrypted,
  decryptString,
  createLogger,
  ApiTransformer,
  SearchApiResponseData,
  SearchApiResultField,
  StremioTransformer,
} from '@aiostreams/core';
import { streamApiRateLimiter } from '../../middlewares/ratelimit.js';
import { ApiResponse, createResponse } from '../../utils/responses.js';
import { z, ZodError } from 'zod';
import { HonoEnv } from '../../types.js';

const app = new Hono<HonoEnv>();
const logger = createLogger('server');

app.use('*', streamApiRateLimiter);

const SearchApiRequestSchema = z.object({
  type: z.string(),
  id: z.string(),
  format: z.coerce.boolean().optional().default(false),
  requiredFields: z
    .union([z.array(SearchApiResultField), SearchApiResultField])
    .optional()
    .default([])
    .transform((val) => {
      if (Array.isArray(val)) {
        return val;
      }
      return [val];
    }),
});

app.get('/', async (c) => {
  try {
    const query = c.req.query();
    const allQueries = c.req.queries();
    const { type, id, requiredFields, format } = SearchApiRequestSchema.parse({
      ...query,
      requiredFields: allQueries.requiredFields ?? query.requiredFields,
    });
    
    let encodedUserData: string | undefined = c.req.header('x-aiostreams-user-data');
    let auth: string | undefined = c.req.header('authorization');

    if (!encodedUserData && !auth) {
      throw new APIError(
        constants.ErrorCode.UNAUTHORIZED,
        undefined,
        `At least one of AIOStreams-User-Data or Authorization headers must be present`
      );
    }

    let userData: UserData | null = null;

    if (encodedUserData) {
      try {
        userData = JSON.parse(
          Buffer.from(encodedUserData, 'base64').toString('utf-8')
        );
        if (userData) {
          userData.trusted = false;
          logger.debug(`Using encodedUserData for Search API request`);
        }
      } catch (error: any) {
        throw new APIError(
          constants.ErrorCode.BAD_REQUEST,
          undefined,
          `Invalid encodedUserData: ${error.message}`
        );
      }
    } else if (auth) {
      let uuid: string;
      let password: string;
      try {
        if (!auth.startsWith('Basic ')) {
          throw new APIError(
            constants.ErrorCode.BAD_REQUEST,
            undefined,
            `Invalid auth: ${auth}. Must start with 'Basic '`
          );
        }
        const base64Credentials = auth.slice('Basic '.length).trim();
        const credentials = Buffer.from(base64Credentials, 'base64').toString(
          'utf-8'
        );
        const sepIndex = credentials.indexOf(':');
        if (sepIndex === -1) {
          throw new APIError(
            constants.ErrorCode.BAD_REQUEST,
            undefined,
            `Invalid basic auth format`
          );
        }
        uuid = credentials.slice(0, sepIndex);
        password = credentials.slice(sepIndex + 1);
        if (!uuid || !password) {
          throw new APIError(
            constants.ErrorCode.BAD_REQUEST,
            undefined,
            `Missing username or password in basic auth`
          );
        }
        if (isEncrypted(password)) {
          const {
            success: successfulDecryption,
            data: decryptedPassword,
            error,
          } = decryptString(password);
          if (!successfulDecryption) {
            throw new APIError(
              constants.ErrorCode.ENCRYPTION_ERROR,
              undefined,
              error
            );
          }
          password = decryptedPassword;
        }
        logger.debug(`Using basic auth for Search API request: ${uuid}`);
      } catch (error: any) {
        if (error instanceof APIError) throw error;
        throw new APIError(
          constants.ErrorCode.BAD_REQUEST,
          undefined,
          `Invalid auth: ${error.message}`
        );
      }
      const userExists = await UserRepository.checkUserExists(uuid);
      if (!userExists) {
        throw new APIError(constants.ErrorCode.USER_INVALID_DETAILS);
      }

      userData = await UserRepository.getUser(uuid, password);

      if (!userData) {
        throw new APIError(constants.ErrorCode.USER_INVALID_DETAILS);
      }
    }
    
    if (!userData) {
      throw new APIError(constants.ErrorCode.USER_INVALID_DETAILS);
    }
    
    userData.ip = c.get('userIp');
    try {
      userData = await validateConfig(userData, {
        skipErrorsFromAddonsOrProxies: true,
        decryptValues: true,
      });
    } catch (error: any) {
      throw new APIError(
        constants.ErrorCode.USER_INVALID_CONFIG,
        undefined,
        error.message
      );
    }
    
    const transformer = new ApiTransformer(userData);
    const stremioTransformer = format
      ? new StremioTransformer(userData)
      : null;

    const aiostreams = new AIOStreams(userData);
    await aiostreams.initialise();
    const response = await aiostreams.getStreams(id, type);
    const ctx = aiostreams.getStreamContext();

    if (!ctx) {
      throw new Error('Stream context not available');
    }
    const formatterContext = ctx.toFormatterContext(response.data.streams);

    const stremioData = await stremioTransformer?.transformStreams(
      response,
      formatterContext
    );
    const stremioStreams = stremioData?.streams;

    const apiData = await transformer.transformStreams(
      response,
      requiredFields
    );
    if (stremioStreams && format) {
      // Create a map of stable identifiers to Stremio streams to prevent index skew
      const stremioStreamMap = new Map<string, any>();

      stremioStreams.forEach((stream) => {
        if (
          !stream ||
          ['statistic', 'error'].includes(stream.streamData?.type || '')
        ) {
          return;
        }

        // Generate a unique key based on url or infoHash+fileIdx
        let key: string | undefined;
        if (stream.url) {
          key = `url:${stream.url}`;
        } else if (stream.infoHash) {
          key = `torrent:${stream.infoHash}:${stream.fileIdx ?? ''}`;
        }

        if (key) {
          stremioStreamMap.set(key, stream);
        }
      });

      apiData.results = apiData.results.map((result) => {
        // Generate the same key for the API result
        let key: string | undefined;
        if (result.url) {
          key = `url:${result.url}`;
        } else if (result.infoHash) {
          key = `torrent:${result.infoHash}:${result.fileIdx ?? ''}`;
        }

        const stream = key ? stremioStreamMap.get(key) : null;

        if (!stream) {
          return result;
        }
        return {
          ...result,
          name: stream.name,
          description: stream.description,
        };
      });
    }

    return c.json(
      createResponse<SearchApiResponseData>({
        success: true,
        data: apiData,
      })
    );
  } catch (error) {
    logger.error('Error in search API:', error);
    throw error;
  }
});

export default app;
