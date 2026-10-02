'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { config } = require('../config');
const crypto = require('crypto');
const { HttpError, strongPassword, cleanStr, validate } = require('../lib');
const { createSession, destroySession, requireAuth, loginLimiter, logActivity } = require('../middleware');

const router = express.Router();
// Compared against when the email is unknown so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', config.bcryptRounds);

router.post('/login', loginLimiter, (req, res) => {
  const email = cleanStr(req.body && req.body.email, 254).toLowerCase();
  const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';
  if (!email || !password) throw new HttpError(400, 'Enter your email and password.');

  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  const ok = bcrypt.compareSync(password.slice(0, 200), admin ? admin.password_hash : DUMMY_HASH);
  if (!admin || !ok) {
    req.loggedEmail = email;
    logActivity(req, 'Failed sign-in attempt', 'auth', '', 'Wrong email or password');
    throw new HttpError(401, 'Incorrect email or password.');
  }
  if (!admin.is_active) {
    req.loggedEmail = email;
    logActivity(req, 'Sign-in blocked (disabled account)', 'auth', admin.id);
    throw new HttpError(403, 'This account is disabled. Ask another administrator to enable it.');
  }

  createSession(admin.id, req, res);
  db.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?").run(admin.id);
  req.admin = { id: admin.id, name: admin.name, email: admin.email };
  logActivity(req, 'Signed in', 'auth', admin.id);
  res.json({ admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
});

/* ---------- first-run setup (only works while there are ZERO administrators) ---------- */
const needsSetup = () => db.prepare('SELECT COUNT(*) c FROM admins').get().c === 0;
// On a live site a secret SETUP_TOKEN is required; without one, browser setup is disabled (use `npm run create-admin`).
const tokenRequired = () => config.isProd || config.onRender;
const setupEnabled = () => !tokenRequired() || !!(process.env.SETUP_TOKEN || '').trim();

router.get('/setup-status', (req, res) => {
  res.json({ needed: needsSetup(), enabled: needsSetup() && setupEnabled(), tokenRequired: tokenRequired() });
});

router.post('/setup', loginLimiter, (req, res) => {
  if (!needsSetup()) throw new HttpError(403, 'Setup is already complete. Please sign in.');
  if (!setupEnabled()) throw new HttpError(403, 'Browser setup is disabled on this server. Set a SETUP_TOKEN environment variable, or run "npm run create-admin" in the Shell.');
  if (tokenRequired()) {
    const given = Buffer.from(String((req.body && req.body.token) || ''));
    const want = Buffer.from(process.env.SETUP_TOKEN.trim());
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) throw new HttpError(403, 'The setup code is not correct.', { token: 'Incorrect setup code' });
  }
  const v = validate({ name: { type: 'text', max: 120, required: true }, email: { type: 'email', required: true } }, req.body);
  const problem = strongPassword(req.body && req.body.password, v.email);
  if (problem) throw new HttpError(400, problem, { password: problem });
  // re-check inside a transaction so two simultaneous requests can't both create a "first" admin
  const id = db.transaction(() => {
    if (!needsSetup()) throw new HttpError(403, 'Setup is already complete. Please sign in.');
    return db.prepare('INSERT INTO admins (name, email, password_hash) VALUES (?,?,?)').run(v.name, v.email, bcrypt.hashSync(req.body.password, config.bcryptRounds)).lastInsertRowid;
  })();
  createSession(id, req, res);
  db.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?").run(id);
  req.admin = { id, name: v.name, email: v.email };
  logActivity(req, 'Created first administrator', 'admins', id, `${v.name} <${v.email}>`);
  res.status(201).json({ admin: { id, name: v.name, email: v.email, role: 'admin' } });
});

router.post('/logout', (req, res) => {
  if (req.admin) logActivity(req, 'Signed out', 'auth', req.admin.id);
  destroySession(req, res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.admin) throw new HttpError(401, 'Not signed in.');
  const { id, name, email, role } = req.admin;
  res.json({ admin: { id, name, email, role } });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { current_password: cur, new_password: next } = req.body || {};
  if (typeof cur !== 'string' || typeof next !== 'string') throw new HttpError(400, 'Enter your current and new password.');
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!bcrypt.compareSync(cur.slice(0, 200), admin.password_hash)) {
    throw new HttpError(400, 'Your current password is incorrect.', { current_password: 'Incorrect password' });
  }
  const problem = strongPassword(next, admin.email);
  if (problem) throw new HttpError(400, problem, { new_password: problem });
  if (next === cur) throw new HttpError(400, 'Choose a new password that is different from the current one.', { new_password: 'Must be different' });

  db.prepare("UPDATE admins SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .run(bcrypt.hashSync(next, config.bcryptRounds), admin.id);
  // sign out every OTHER device/session
  db.prepare('DELETE FROM sessions WHERE admin_id = ? AND id != ?').run(admin.id, req.admin.sid);
  logActivity(req, 'Changed own password', 'admins', admin.id);
  res.json({ ok: true });
});

module.exports = router;
