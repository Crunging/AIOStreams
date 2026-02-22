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
  stremioCatalogRateLimiter,
  stremioManifestRateLimiter,
  stremioSubtitleRateLimiter,
  stremioMetaRateLimiter,
} from './middlewares/index.js';

import { constants, createLogger, Env, StremioTransformer } from '@aiostreams/core';
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

// Cache static files at startup
const indexTxtPath = path.join(frontendRoot, 'index.txt');
const indexTxt = fs.existsSync(indexTxtPath)
  ? fs.readFileSync(indexTxtPath, 'utf-8')
  : null;
const gdriveCallbackPath = path.join(
  frontendRoot,
  'oauth/callback/gdrive.html'
);
const gdriveCallbackHtml = fs.existsSync(gdriveCallbackPath)
  ? fs.readFileSync(gdriveCallbackPath, 'utf-8')
  : null;
const logoPng = fs.existsSync(path.join(frontendRoot, 'logo.png'))
  ? fs.readFileSync(path.join(frontendRoot, 'logo.png'))
  : null;
const logoAltPng = fs.existsSync(path.join(frontendRoot, 'logo_alt.png'))
  ? fs.readFileSync(path.join(frontendRoot, 'logo_alt.png'))
  : null;

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
stremio.get('/manifest.json', stremioManifestRateLimiter, manifest);
stremio.get('/stream/:type/:id', stremioStreamRateLimiter, stream);
stremio.get('/configure', staticRateLimiter, configure);
stremio.get('/configure.txt', staticRateLimiter, (c) => {
  return indexTxt ? c.body(indexTxt) : c.notFound();
});
stremio.get('/u/:alias', alias);

// Authenticated routes
const stremioAuth = new Hono<HonoEnv>();
stremioAuth.use('*', corsMiddleware);
stremioAuth.use('*', userDataMiddleware);

stremioAuth.get('/manifest.json', stremioManifestRateLimiter, manifest);
stremioAuth.get('/stream/:type/:id', stremioStreamRateLimiter, stream);
stremioAuth.get('/configure', staticRateLimiter, configure);
stremioAuth.get('/configure.txt', staticRateLimiter, (c) => {
  return indexTxt ? c.body(indexTxt) : c.notFound();
});
stremioAuth.get('/meta/:type/:id', stremioMetaRateLimiter, meta);
stremioAuth.get('/catalog/:type/:id/:extra?', stremioCatalogRateLimiter, catalog);
stremioAuth.get('/subtitles/:type/:id/:extra?', stremioSubtitleRateLimiter, subtitle);
stremioAuth.get('/addon_catalog/:type/:id/:extra?', stremioCatalogRateLimiter, addonCatalog);

app.route('/stremio', stremio);
app.route('/stremio/:uuid/:encryptedPassword', stremioAuth);

// ChillLink Routes
const chillLink = new Hono<HonoEnv>();
chillLink.use('*', corsMiddleware);
chillLink.use('*', userDataMiddleware);
chillLink.get('/manifest', chillLinkManifest);
chillLink.get('/streams/:type/:id', stremioStreamRateLimiter, chillLinkStreams);

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
  const logo = Env.ALTERNATE_DESIGN ? logoAltPng : logoPng;
  if (logo) {
    return c.body(logo, 200, {
      'Content-Type': 'image/png',
    });
  }
  return c.notFound();
});

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
  return gdriveCallbackHtml ? c.html(gdriveCallbackHtml) : c.notFound();
});

app.get('/', (c) => {
  return c.redirect('/stremio/configure');
});

// serve static from frontendRoot (catch-all)
app.use(
  '/*',
  staticRateLimiter,
  serveStatic({
    root: path.relative(process.cwd(), frontendRoot),
  })
);



// legacy route handlers
app.get('/:config/stream/:type/:id.json', stremioStreamRateLimiter, (c) => {
  const url = new URL(c.req.url);
  const baseUrl =
    Env.BASE_URL ||
    `${url.protocol}//${url.hostname}${
      url.hostname === 'localhost' ? `:${Env.PORT}` : ''
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
