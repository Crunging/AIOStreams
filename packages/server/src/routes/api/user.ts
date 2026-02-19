import { Hono } from 'hono';
import {
  APIError,
  constants,
  createLogger,
  encryptString,
  UserRepository,
} from '@aiostreams/core';
import { userApiRateLimiter } from '../../middlewares/ratelimit.js';
import { resolveUuidAliasForUserApi } from '../../middlewares/alias.js';
import { createResponse } from '../../utils/responses.js';
import { HonoEnv } from '../../types.js';

const app = new Hono<HonoEnv>();
const logger = createLogger('server');

app.use('*', userApiRateLimiter);
app.use('*', resolveUuidAliasForUserApi);

// checking existence of a user
app.on('HEAD', '/', async (c) => {
  const uuid = c.get('uuid') || c.req.query('uuid');
  if (typeof uuid !== 'string') {
    throw new APIError(
      constants.ErrorCode.MISSING_REQUIRED_FIELDS,
      undefined,
      'uuid must be a string'
    );
  }

  const userExists = await UserRepository.checkUserExists(uuid);

  if (userExists) {
    c.status(200);
    return c.body(null);
  } else {
    throw new APIError(constants.ErrorCode.USER_INVALID_DETAILS);
  }
});

// getting user details
app.get('/', async (c) => {
  const uuid = c.get('uuid') || c.req.query('uuid');
  const password = c.req.query('password');
  
  if (typeof uuid !== 'string' || typeof password !== 'string') {
    throw new APIError(
      constants.ErrorCode.MISSING_REQUIRED_FIELDS,
      undefined,
      'uuid and password must be strings'
    );
  }

  const userData = await UserRepository.getUser(uuid, password);

  const { success: successfulEncryption, data: encryptedPassword } =
    encryptString(password);

  if (!successfulEncryption) {
    throw new APIError(constants.ErrorCode.ENCRYPTION_ERROR);
  }

  return c.json(
    createResponse({
      success: true,
      detail: 'User details retrieved successfully',
      data: {
        userData: userData,
        encryptedPassword: encryptedPassword,
      },
    })
  );
});

// new user creation
app.post('/', async (c) => {
  const { config, password } = c.get('parsedBody') || (await c.req.json());
  if (!config || !password) {
    throw new APIError(
      constants.ErrorCode.MISSING_REQUIRED_FIELDS,
      undefined,
      'config and password are required'
    );
  }
  
  const { uuid, encryptedPassword } = await UserRepository.createUser(
    config,
    password
  );
  return c.json(
    createResponse({
      success: true,
      detail: 'User was successfully created',
      data: {
        uuid,
        encryptedPassword,
      },
    }),
    201
  );
});

// updating user details
app.put('/', async (c) => {
  const body = c.get('parsedBody') || (await c.req.json());
  const uuid = c.get('uuid') || body.uuid;
  const { password, config } = body;

  if (!uuid || !password || !config) {
    throw new APIError(
      constants.ErrorCode.MISSING_REQUIRED_FIELDS,
      undefined,
      'uuid, password and config are required'
    );
  }

  const updatedUser = await UserRepository.updateUser(uuid, password, {
    ...config,
    uuid,
  });
  return c.json(
    createResponse({
      success: true,
      detail: 'User updated successfully',
      data: {
        uuid,
        userData: updatedUser,
      },
    })
  );
});

app.delete('/', async (c) => {
  const body = c.get('parsedBody') || (await c.req.json());
  const uuid = c.get('uuid') || body.uuid;
  const { password } = body;

  if (!uuid || !password) {
    throw new APIError(constants.ErrorCode.MISSING_REQUIRED_FIELDS);
  }
  
  await UserRepository.deleteUser(uuid, password);
  return c.json(
    createResponse({
      success: true,
      detail: 'User deleted successfully',
    })
  );
});

export default app;
