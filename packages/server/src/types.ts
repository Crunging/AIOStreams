import { UserData } from '@aiostreams/core';

export type HonoEnv = {
  Variables: {
    userData?: UserData;
    userIp?: string;
    requestIp?: string;
    uuid?: string;
  };
};
