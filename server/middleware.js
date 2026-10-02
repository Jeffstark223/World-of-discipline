'use strict';
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { db } = require('./db');
const { config } = require('./config');
const { HttpError } = require('./lib');

const COOKIE = 'wod_sid';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sqlTime = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const clientIp = (req) => (req.ip || '').replace(/^::ffff:/, '');

/* ------------------------------ sessions ------------------------------ */
function createSession(adminId, req, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionHours * 3600 * 1000);
  db.prepare('INSERT INTO sessions (id, admin_id, expires_at, ip, user_agent) VALUES (?,?,?,?,?)')
    .run(sha(token), adminId, sqlTime(expires), clientIp(req), String(req.get('user-agent') || '').slice(0, 300));
  setCookie(res, token, expires);
  return token;
}

function setCookie(res, token, expires) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProd,
    path: '/',
    expires,
  });
}

function destroySession(req, res) {
  const token = req.cookies && req.cookies[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(sha(token));
  res.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'strict', secure: config.isProd });
}

function purgeExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

/** Loads req.admin (or null) from the session cookie. Sliding expiration. */
function loadAdmin(req, res, next) {
  req.admin = null;
  const token = req.cookies && req.cookies[COOKIE];
  if (token && typeof token === 'string' && token.length < 100) {
    const row = db.prepare(`
      SELECT s.id AS sid, s.expires_at, a.id, a.name, a.email, a.role, a.is_active
      FROM sessions s JOIN admins a ON a.id = s.admin_id
      WHERE s.id = ? AND s.expires_at > datetime('now')`).get(sha(token));
    if (row && row.is_active) {
      req.admin = { id: row.id, name: row.name, email: row.email, role: row.role, sid: row.sid };
      // slide the expiry forward once less than half the lifetime remains
      const remaining = Date.parse(row.expires_at.replace(' ', 'T') + 'Z') - Date.now();
      if (remaining < (config.sessionHours * 3600 * 1000) / 2) {
        const expires = new Date(Date.now() + config.sessionHours * 3600 * 1000);
        db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(sqlTime(expires), row.sid);
        setCookie(res, token, expires);
      }
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.admin) return next(new HttpError(401, 'Please sign in to continue.'));
  next();
}

/**
 * CSRF defence for cookie-authenticated writes: cookie is SameSite=Strict AND every
 * state-changing request must come from this site's own origin (when the browser sends Origin).
 */
function sameOriginWrites(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next(); // non-browser client (curl, tests): no ambient cookie risk
  try {
    const o = new URL(origin);
    if (o.host === req.get('host') || config.corsOrigins.includes(origin)) return next();
  } catch { /* fall through */ }
  next(new HttpError(403, 'Request blocked: cross-site request.'));
}

/* ------------------------------ rate limits ------------------------------ */
const json429 = (msg) => (req, res) => res.status(429).json({ error: msg });
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: json429('Too many failed sign-in attempts. Please wait 15 minutes and try again.'),
});
const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  handler: json429('You have sent several messages recently. Please try again in a few minutes.'),
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false,
  handler: json429('Too many requests. Please slow down.'),
});

/* ------------------------------ activity log ------------------------------ */
function logActivity(req, action, resource = '', resourceId = '', details = '') {
  const a = req.admin || {};
  db.prepare(`INSERT INTO activity_logs (admin_id, admin_name, admin_email, action, resource, resource_id, details, ip)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run(a.id || null, a.name || '', a.email || req.loggedEmail || '', action, resource, String(resourceId ?? ''), String(details).slice(0, 500), clientIp(req));
}

module.exports = {
  COOKIE, createSession, destroySession, purgeExpiredSessions, loadAdmin, requireAuth, sameOriginWrites,
  loginLimiter, contactLimiter, apiLimiter, logActivity, clientIp,
};
