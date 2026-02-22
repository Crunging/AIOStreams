import { Hono } from 'hono';
import {
  APIError,
  constants,
  createLogger,
  DebridError,
  PlaybackInfoSchema,
  getDebridService,
  ServiceAuthSchema,
  fromUrlSafeBase64,
  PlaybackInfo,
  ServiceAuth,
  decryptString,
  metadataStore,
  fileInfoStore,
  TitleMetadata,
  FileInfoSchema,
  FileInfo,
  maskSensitiveInfo,
} from '@aiostreams/core';
import { ZodError } from 'zod';
import { StaticFiles } from '../../app.js';
import { corsMiddleware } from '../../middlewares/cors.js';
import { HonoEnv } from '../../types.js';

const app = new Hono<HonoEnv>();
const logger = createLogger('server');

app.use('*', corsMiddleware);

// block HEAD requests
app.use('*', async (c, next) => {
  if (c.req.method === 'HEAD') {
    return c.text('Method not allowed', 405);
  }
  await next();
});

app.get(
  '/playback/:encryptedStoreAuth/:fileInfo/:metadataId/:filename',
  async (c) => {
    try {
      const {
        encryptedStoreAuth,
        fileInfo: encodedFileInfo,
        metadataId,
        filename,
      } = c.req.param();
      if (!encodedFileInfo || !metadataId || !filename) {
        throw new APIError(
          constants.ErrorCode.BAD_REQUEST,
          undefined,
          'Encrypted store auth, file info, metadata id and filename are required'
        );
      }

      let fileInfo: FileInfo | undefined;

      try {
        fileInfo = FileInfoSchema.parse(
          JSON.parse(fromUrlSafeBase64(encodedFileInfo))
        );
      } catch (error: any) {
        fileInfo = await fileInfoStore()?.get(encodedFileInfo);
        if (!fileInfo) {
          logger.warn(`Could not get file info`, {
            fileInfo: encodedFileInfo,
            error,
            fileInfoStoreAvailable: fileInfoStore() ? true : false,
          });
          throw new APIError(
            constants.ErrorCode.BAD_REQUEST,
            undefined,
            'Failed to parse file info and not found in store.'
          );
        }
      }

      const decryptedStoreAuth = decryptString(encryptedStoreAuth);
      if (!decryptedStoreAuth.success) {
        throw new APIError(
          constants.ErrorCode.BAD_REQUEST,
          undefined,
          'Failed to decrypt store auth'
        );
      }

      let storeAuth: ServiceAuth;
      try {
        storeAuth = ServiceAuthSchema.parse(
          JSON.parse(decryptedStoreAuth.data)
        );
      } catch (error: any) {
        logger.warn(`Could not parse decrypted store auth`, {
          decryptedStoreAuth: maskSensitiveInfo(decryptedStoreAuth.data),
          error,
        });
        throw new APIError(
          constants.ErrorCode.BAD_REQUEST,
          undefined,
          'Failed to parse store auth'
        );
      }

      const metadata: TitleMetadata | undefined =
        await metadataStore().get(metadataId);
      if (!metadata && !fileInfo.serviceItemId) {
        throw new APIError(
          constants.ErrorCode.BAD_REQUEST,
          undefined,
          'Metadata not found'
        );
      }

      logger.verbose(`Got metadata: ${JSON.stringify(metadata)}`);

      const playbackInfo: PlaybackInfo =
        fileInfo.type === 'torrent'
          ? {
              type: 'torrent',
              metadata: metadata,
              title: fileInfo.title,
              downloadUrl: fileInfo.downloadUrl,
              hash: fileInfo.hash,
              private: fileInfo.private,
              sources: fileInfo.sources,
              index: fileInfo.index,
              filename: filename,
              fileIndex: fileInfo.fileIndex,
              serviceItemId: fileInfo.serviceItemId,
            }
          : {
              type: 'usenet',
              metadata: metadata,
              title: fileInfo.title,
              hash: fileInfo.hash,
              nzb: fileInfo.nzb,
              easynewsUrl: fileInfo.easynewsUrl,
              index: fileInfo.index,
              filename: filename,
              fileIndex: fileInfo.fileIndex,
              serviceItemId: fileInfo.serviceItemId,
            };

      const debridInterface = getDebridService(
        storeAuth.id,
        storeAuth.credential,
        c.get('userIp')
      );

      let streamUrl: string | undefined;
      try {
        streamUrl = await debridInterface.resolve(
          playbackInfo,
          filename,
          fileInfo.cacheAndPlay ?? false,
          fileInfo.autoRemoveDownloads
        );
      } catch (error: any) {
        let staticFile: string = StaticFiles.INTERNAL_SERVER_ERROR;
        if (error instanceof DebridError) {
          logger.error(
            `[${storeAuth.id}] Got Debrid error during debrid resolve: ${error.code}: ${error.message}`,
            { ...error, stack: undefined }
          );
          switch (error.code) {
            case 'UNAVAILABLE_FOR_LEGAL_REASONS':
              staticFile = StaticFiles.UNAVAILABLE_FOR_LEGAL_REASONS;
              break;
            case 'STORE_LIMIT_EXCEEDED':
              staticFile = StaticFiles.STORE_LIMIT_EXCEEDED;
              break;
            case 'PAYMENT_REQUIRED':
              staticFile = StaticFiles.PAYMENT_REQUIRED;
              break;
            case 'TOO_MANY_REQUESTS':
              staticFile = StaticFiles.TOO_MANY_REQUESTS;
              break;
            case 'FORBIDDEN':
              staticFile = StaticFiles.FORBIDDEN;
              break;
            case 'UNAUTHORIZED':
              staticFile = StaticFiles.UNAUTHORIZED;
              break;
            case 'UNPROCESSABLE_ENTITY':
            case 'UNSUPPORTED_MEDIA_TYPE':
            case 'STORE_MAGNET_INVALID':
              staticFile = StaticFiles.DOWNLOAD_FAILED;
              break;
            case 'NO_MATCHING_FILE':
              staticFile = StaticFiles.NO_MATCHING_FILE;
              break;
            default:
              break;
          }
        } else {
          logger.error(
            `[${storeAuth.id}] Got unknown error during debrid resolve: ${error.message}`
          );
        }

        return c.redirect(`/static/${staticFile}`, 307);
      }

      if (!streamUrl) {
        return c.redirect(`/static/${StaticFiles.DOWNLOADING}`, 307);
      }

      return c.redirect(streamUrl, 307);
    } catch (error: any) {
      if (error instanceof APIError || error instanceof ZodError) {
        throw error;
      } else {
        logger.error(
          `Got unexpected error during debrid resolve: ${error.message}`
        );
        throw new APIError(
          constants.ErrorCode.INTERNAL_SERVER_ERROR,
          undefined,
          error.message
        );
      }
    }
  }
);

export default app;
