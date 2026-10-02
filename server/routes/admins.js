'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { config } = require('../config');
const { HttpError, validate, strongPassword, like } = require('../lib');
const { requireAuth, logActivity } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

const COLS = 'id, name, email, role, is_active, last_login_at, created_at, updated_at';   // never includes password_hash
const spec = {
  name: { type: 'text', max: 120, required: true },
  email: { type: 'email', required: true },
};

const get = (id) => db.prepare(`SELECT ${COLS} FROM admins WHERE id = ?`).get(id);
const otherActiveAdmins = (id) => db.prepare('SELECT COUNT(*) c FROM admins WHERE is_active = 1 AND id != ?').get(id).c;

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = q
    ? db.prepare(`SELECT ${COLS} FROM admins WHERE name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' ORDER BY created_at`).all(like(q), like(q))
    : db.prepare(`SELECT ${COLS} FROM admins ORDER BY created_at`).all();
  res.json({ items: rows, total: rows.length });
});

router.get('/:id', (req, res) => {
  const row = get(req.params.id);
  if (!row) throw new HttpError(404, 'Administrator not found.');
  res.json(row);
});

router.post('/', (req, res) => {
  const v = validate(spec, req.body);
  const password = req.body && req.body.password;
  const problem = strongPassword(password, v.email);
  if (problem) throw new HttpError(400, problem, { password: problem });
  if (db.prepare('SELECT 1 FROM admins WHERE email = ?').get(v.email)) {
    throw new HttpError(409, 'An administrator with this email already exists.', { email: 'Already in use' });
  }
  const info = db.prepare('INSERT INTO admins (name, email, password_hash) VALUES (?,?,?)')
    .run(v.name, v.email, bcrypt.hashSync(password, config.bcryptRounds));
  logActivity(req, 'Created administrator', 'admins', info.lastInsertRowid, `${v.name} <${v.email}>`);
  res.status(201).json(get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = get(id);
  if (!existing) throw new HttpError(404, 'Administrator not found.');
  const body = req.body || {};
  const v = validate(spec, body, { partial: true });

  if ('email' in v && v.email !== existing.email && db.prepare('SELECT 1 FROM admins WHERE email = ? AND id != ?').get(v.email, id)) {
    throw new HttpError(409, 'An administrator with this email already exists.', { email: 'Already in use' });
  }

  let newActive = existing.is_active;
  if ('is_active' in body) newActive = body.is_active === true || body.is_active === 1 || body.is_active === '1' ? 1 : 0;
  if (existing.is_active && !newActive && otherActiveAdmins(id) === 0) {
    throw new HttpError(400, 'You cannot disable the only active administrator.');
  }

  let hash = null;
  if (body.password) {
    const problem = strongPassword(body.password, v.email || existing.email);
    if (problem) throw new HttpError(400, problem, { password: problem });
    hash = bcrypt.hashSync(body.password, config.bcryptRounds);
  }

  db.prepare(`UPDATE admins SET name = ?, email = ?, is_active = ?, password_hash = COALESCE(?, password_hash),
              updated_at = datetime('now') WHERE id = ?`)
    .run(v.name ?? existing.name, v.email ?? existing.email, newActive, hash, id);

  // Disabling or resetting a password signs that administrator out everywhere (except the caller's own current session).
  if (!newActive || hash) {
    if (id === req.admin.id) db.prepare('DELETE FROM sessions WHERE admin_id = ? AND id != ?').run(id, req.admin.sid);
    else db.prepare('DELETE FROM sessions WHERE admin_id = ?').run(id);
  }

  const label = `${existing.name} <${existing.email}>`;
  if (existing.is_active && !newActive) logActivity(req, 'Disabled administrator', 'admins', id, label);
  else if (!existing.is_active && newActive) logActivity(req, 'Enabled administrator', 'admins', id, label);
  if (hash) logActivity(req, 'Reset administrator password', 'admins', id, label);
  if (('name' in v && v.name !== existing.name) || ('email' in v && v.email !== existing.email)) {
    logActivity(req, 'Edited administrator', 'admins', id, label);
  }
  res.json(get(id));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = get(id);
  if (!existing) throw new HttpError(404, 'Administrator not found.');
  if (existing.is_active && otherActiveAdmins(id) === 0) {
    throw new HttpError(400, 'You cannot delete the only active administrator.');
  }
  db.prepare('DELETE FROM admins WHERE id = ?').run(id);
  logActivity(req, 'Deleted administrator', 'admins', id, `${existing.name} <${existing.email}>`);
  res.json({ ok: true });
});

module.exports = router;
