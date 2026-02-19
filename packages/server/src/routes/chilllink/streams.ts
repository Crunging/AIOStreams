import { Context } from 'hono';
import {
  AIOStreams,
  createLogger,
  constants,
  ChillLinkTransformer,
} from '@aiostreams/core';
import { createResponse } from '../../utils/responses.js';
import z from 'zod';
import { HonoEnv } from '../../types.js';

const logger = createLogger('server');

const ChillLinkQuerySchema = z.object({
  type: z.string(),
  tmdbID: z.string(),
  imdbID: z.string().optional(),
  season: z.coerce.number().optional(),
  episode: z.coerce.number().optional(),
});

export const streams = async (c: Context<HonoEnv>) => {
  const userData = c.get('userData');
  // Check if we have user data (set by middleware in authenticated routes)
  if (!userData) {
    // Return a response indicating configuration is needed
    return c.json(
      createResponse({
        success: false,
        error: {
          code: constants.ErrorCode.BAD_REQUEST,
          message: 'Please configure the addon first',
        },
      }),
      400
    );
  }
  const transformer = new ChillLinkTransformer(userData);

  try {
    const query = c.req.query();
    const { tmdbID, imdbID, type, season, episode } =
      ChillLinkQuerySchema.parse(query);

    const stremioId =
      (imdbID || `tmdb:${tmdbID}`) +
      (season ? `:${season}` : '') +
      (episode ? `:${episode}` : '');

    const aiostreams = await new AIOStreams(userData).initialise();

    const response = await aiostreams.getStreams(stremioId, type);
    const streamContext = aiostreams.getStreamContext();

    if (!streamContext) {
      throw new Error('Stream context not available');
    }

    return c.json(
      await transformer.transformStreams(
        response,
        streamContext.toFormatterContext()
      )
    );
  } catch (error) {
    let errorMessage = error instanceof Error ? error.message : 'Unknown error';
    let errors = [
      {
        description: errorMessage,
      },
    ];
    if (transformer.showError('stream', errors)) {
      logger.error(
        `Unexpected error during stream retrieval: ${errorMessage}`,
        error
      );
      return c.json({
        sources: [
          ChillLinkTransformer.createErrorStream({
            errorDescription: errorMessage,
          }),
        ],
      });
    }
    throw error;
  }
};
