'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { config } = require('./config');
const { initialize } = require('./init');
const { HttpError } = require('./lib');
const mw = require('./middleware');

function createApp() {
  const { db } = require('./db');
  const app = express();
  app.disable('x-powered-by');
  // Render (and most hosts) terminate HTTPS at a proxy; needed for correct client IPs + secure cookies.
  if (config.isProd || config.onRender) app.set('trust proxy', 1);

  /* ---------- security headers ---------- */
  const common = {
    objectSrc: ["'none'"], baseUri: ["'self'"],
    imgSrc: ["'self'", 'data:', 'https:'], mediaSrc: ["'self'", 'https:'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
  };
  const adminCsp = helmet({
    contentSecurityPolicy: { useDefaults: false, directives: {
      ...common, defaultSrc: ["'self'"], scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      connectSrc: ["'self'"], frameAncestors: ["'none'"], formAction: ["'self'"],
    } },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  // The existing public pages use inline <script>/<style> and onclick handlers, so they need 'unsafe-inline'.
  const publicCsp = helmet({
    contentSecurityPolicy: { useDefaults: false, directives: {
      ...common, defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      frameSrc: ['https://www.google.com', 'https://maps.google.com'],
      connectSrc: ["'self'"], frameAncestors: ["'self'"], formAction: ["'self'"],
    } },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  app.use((req, res, next) => (/^\/(admin|api)(\/|$)/.test(req.path) ? adminCsp : publicCsp)(req, res, next));

  app.use(cookieParser());
  app.use(express.json({ limit: '200kb' }));

  /* ---------- API ---------- */
  const api = express.Router();
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use((req, res, next) => { // CORS only for explicitly configured origins, no credentials
    const origin = req.get('origin');
    if (origin && config.corsOrigins.includes(origin)) {
      res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    next();
  });
  api.use(mw.apiLimiter);
  api.use(mw.loadAdmin);
  api.use(mw.sameOriginWrites);

  api.get('/health', (req, res) => { db.prepare('SELECT 1').get(); res.json({ ok: true }); });
  api.use('/auth', require('./routes/auth'));
  api.use('/admins', require('./routes/admins'));
  const content = require('./routes/content');
  api.use('/sermons', content.sermons);
  api.use('/events', content.events);
  api.use('/ministries', content.ministries);
  api.use('/leaders', content.leaders);
  api.use('/pillars', content.pillars);
  const g = require('./routes/gallery');
  api.use('/gallery', g.gallery);
  api.use('/upload', g.uploadRouter);
  api.use('/messages', require('./routes/messages'));
  api.use('/', require('./routes/site'));       // homepage, giving, social, settings, public/site
  api.use('/', require('./routes/dashboard'));  // dashboard, activity
  api.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use('/api', api);

  /* ---------- uploaded files (served from the configurable, persistent UPLOAD_DIR) ---------- */
  app.use('/uploads', express.static(config.uploadDir, {
    index: false, dotfiles: 'deny', fallthrough: false, maxAge: '30d', immutable: true,
    setHeaders: (res) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'"); },
  }));

  /* ---------- admin dashboard + existing public website ---------- */
  const noCacheHtml = (res, file) => { if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.css')) res.set('Cache-Control', 'no-cache'); };
  app.use('/admin', express.static(path.join(config.ROOT, 'admin'), { index: 'index.html', setHeaders: noCacheHtml }));
  app.use(express.static(path.join(config.ROOT, 'public'), { index: 'index.html', extensions: ['html'], setHeaders: noCacheHtml }));

  app.use((req, res) => res.status(404).type('text').send('Page not found'));

  /* ---------- errors ---------- */
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.fields ? { fields: err.fields } : {}) });
    if (err.status && err.status >= 400 && err.status < 500 && !err.type) return res.status(err.status).type('text').send(err.status === 404 ? 'Not found' : 'Bad request');
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request could not be read (invalid JSON).' });
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That value already exists.' });
    console.error('[error]', req.method, req.originalUrl, err);
    res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
  });
  return app;
}

function start() {
  initialize();
  mw.purgeExpiredSessions();
  setInterval(mw.purgeExpiredSessions, 60 * 60 * 1000).unref();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`\nWOD website : http://localhost:${config.port}/`);
    console.log(`Admin       : http://localhost:${config.port}/admin/\n`);
  });
  const shutdown = () => server.close(() => { require('./db').close(); process.exit(0); });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return server;
}

if (require.main === module) start();
module.exports = { createApp, start };
