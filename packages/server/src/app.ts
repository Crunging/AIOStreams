import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import {
  userApi,
  healthApi,
  statusApi,
  formatApi,
  catalogApi,
  postersApi,
  gdriveApi,
  debridApi,
  searchApi,
  animeApi,
  proxyApi,
  templatesApi,
  syncApi,
} from './routes/api/index.js';
import {
  configure,
  manifest,
  stream,
  catalog,
  meta,
  subtitle,
  addonCatalog,
  alias,
} from './routes/stremio/index.js';
import {
  manifest as chillLinkManifest,
  streams as chillLinkStreams,
} from './routes/chilllink/index.js';
import {
  gdrive,
  torboxSearch,
  torznab,
  newznab,
  prowlarr,
  knaben,
  eztv,
  torrentGalaxy,
  seadex,
  easynews,
  library,
} from './routes/builtins/index.js';
import {
  ipMiddleware,
  loggerMiddleware,
  userDataMiddleware,
  errorMiddleware,
  corsMiddleware,
  staticRateLimiter,
  internalMiddleware,
  stremioStreamRateLimiter,
} from './middlewares/index.js';

import { constants, createLogger, Env } from '@aiostreams/core';
import { StremioTransformer } from '@aiostreams/core';
import { createResponse } from './utils/responses.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { HonoEnv } from './types.js';

const app = new Hono<HonoEnv>();
const logger = createLogger('server');

export enum StaticFiles {
  DOWNLOAD_FAILED = 'download_failed.mp4',
  DOWNLOADING = 'downloading.mp4',
  UNAVAILABLE_FOR_LEGAL_REASONS = 'unavailable_for_legal_reasons.mp4',
  STORE_LIMIT_EXCEEDED = 'store_limit_exceeded.mp4',
  CONTENT_PROXY_LIMIT_REACHED = 'content_proxy_limit_reached.mp4',
  INTERNAL_SERVER_ERROR = '500.mp4',
  TOO_MANY_REQUESTS = '429.mp4',
  FORBIDDEN = '403.mp4',
  UNAUTHORIZED = '401.mp4',
  NO_MATCHING_FILE = 'no_matching_file.mp4',
  PAYMENT_REQUIRED = 'payment_required.mp4',
  OK = '200.mp4',
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const frontendRoot = path.join(__dirname, '../../frontend/out');
export const staticRoot = path.join(__dirname, './static');

// Middlewares
app.use('*', ipMiddleware);
app.use('*', loggerMiddleware);

// API Routes
const api = new Hono<HonoEnv>();
api.route('/user', userApi);
api.route('/health', healthApi);
api.route('/status', statusApi);
api.route('/format', formatApi);
api.route('/catalogs', catalogApi);
api.route('/posters', postersApi);
api.route('/oauth/exchange/gdrive', gdriveApi);
api.route('/debrid', debridApi);
if (Env.ENABLE_SEARCH_API) {
  api.route('/search', searchApi);
}
api.route('/anime', animeApi);
api.route('/proxy', proxyApi);
api.route('/templates', templatesApi);
api.route('/sync', syncApi);

app.route(`/api/v${constants.API_VERSION}`, api);

// Stremio Routes
const stremio = new Hono<HonoEnv>();
stremio.use('*', corsMiddleware);

// Public routes
stremio.get('/manifest.json', manifest);
stremio.get('/stream/:type/:id', stream);
stremio.get('/configure', configure);
stremio.get('/configure.txt', (c) => {
  return c.body(fs.readFileSync(path.join(frontendRoot, 'index.txt'), 'utf-8'));
});
stremio.get('/u/:alias', alias);

// Authenticated routes
const stremioAuth = new Hono<HonoEnv>();
stremioAuth.use('*', corsMiddleware);
stremioAuth.use('*', userDataMiddleware);

stremioAuth.get('/manifest.json', manifest);
stremioAuth.get('/stream/:type/:id', stream);
stremioAuth.get('/configure', configure);
stremioAuth.get('/configure.txt', staticRateLimiter, (c) => {
  return c.body(fs.readFileSync(path.join(frontendRoot, 'index.txt'), 'utf-8'));
});
stremioAuth.get('/meta/:type/:id', meta);
stremioAuth.get('/catalog/:type/:id/:extra?', catalog);
stremioAuth.get('/subtitles/:type/:id/:extra?', subtitle);
stremioAuth.get('/addon_catalog/:type/:id/:extra?', addonCatalog);

app.route('/stremio', stremio);
app.route('/stremio/:uuid/:encryptedPassword', stremioAuth);

// ChillLink Routes
const chillLink = new Hono<HonoEnv>();
chillLink.use('*', corsMiddleware);
chillLink.use('*', userDataMiddleware);
chillLink.get('/manifest', chillLinkManifest);
chillLink.get('/streams/:type/:id', chillLinkStreams);

app.route('/chilllink/:uuid/:encryptedPassword', chillLink);

// Builtins Routes
const builtins = new Hono<HonoEnv>();
builtins.use('*', internalMiddleware);
builtins.route('/gdrive', gdrive);
builtins.route('/torbox-search', torboxSearch);
builtins.route('/torznab', torznab);
builtins.route('/newznab', newznab);
builtins.route('/prowlarr', prowlarr);
builtins.route('/knaben', knaben);
builtins.route('/eztv', eztv);
builtins.route('/torrent-galaxy', torrentGalaxy);
builtins.route('/seadex', seadex);
builtins.route('/easynews', easynews);
builtins.route('/library', library);

app.route('/builtins', builtins);

// Static files and other routes
app.get('/logo.png', staticRateLimiter, (c) => {
  const filePath = path.resolve(
    frontendRoot,
    Env.ALTERNATE_DESIGN ? 'logo_alt.png' : 'logo.png'
  );
  if (filePath.startsWith(frontendRoot) && fs.existsSync(filePath)) {
    return c.body(fs.readFileSync(filePath), 200, {
      'Content-Type': 'image/png',
    });
  }
  return c.notFound();
});

// serve static from frontendRoot
app.use(
  '/*',
  serveStatic({
    root: path.relative(process.cwd(), frontendRoot),
  })
);

// serve static from staticRoot
app.use(
  '/static/*',
  corsMiddleware,
  serveStatic({
    root: path.relative(process.cwd(), staticRoot),
    rewriteRequestPath: (path) => path.replace(/^\/static/, ''),
  })
);

app.get('/oauth/callback/gdrive', (c) => {
  return c.html(
    fs.readFileSync(path.join(frontendRoot, 'oauth/callback/gdrive.html'), 'utf-8')
  );
});

app.get('/', (c) => {
  return c.redirect('/stremio/configure');
});

// legacy route handlers
app.get('/:config/stream/:type/:id.json', stremioStreamRateLimiter, (c) => {
  const baseUrl =
    Env.BASE_URL ||
    `${new URL(c.req.url).protocol}//${new URL(c.req.url).hostname}${
      new URL(c.req.url).hostname === 'localhost' ? `:${Env.PORT}` : ''
    }`;
  return c.json({
    streams: [
      StremioTransformer.createErrorStream({
        errorDescription:
          'AIOStreams v2 requires you to reconfigure. Please click this stream to reconfigure.',
        errorUrl: `${baseUrl}/stremio/configure`,
      }),
    ],
  });
});

app.get('/:config/configure', (c) => {
  return c.redirect('/stremio/configure');
});

// 404 handler
app.notFound((c) => {
  return c.json(
    createResponse({
      success: false,
      detail: 'Not Found',
    }),
    404
  );
});

// Error handling
app.onError((err, c) => {
  return errorMiddleware(err, c);
});

export default app;
