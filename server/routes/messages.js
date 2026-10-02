'use strict';
const express = require('express');
const { db } = require('../db');
const { HttpError, validate, like, cleanStr } = require('../lib');
const { requireAuth, contactLimiter, logActivity } = require('../middleware');

const router = express.Router();

const spec = {
  name: { type: 'text', max: 120, required: true },
  email: { type: 'email', required: true },
  phone: { type: 'text', max: 40 },
  subject: { type: 'text', max: 100 },
  message: { type: 'long', max: 5000, required: true },
};

// PUBLIC: used by the contact form on the website.
router.post('/', contactLimiter, (req, res) => {
  const body = req.body || {};
  // Honeypot: real visitors never see/fill this hidden field. Pretend success so bots don't retry.
  if (cleanStr(body.website, 200)) return res.status(201).json({ ok: true });
  const v = validate(spec, body);
  db.prepare('INSERT INTO contact_messages (name, email, phone, subject, message) VALUES (?,?,?,?,?)')
    .run(v.name, v.email, v.phone, v.subject, v.message);
  res.status(201).json({ ok: true });
});

router.get('/', requireAuth, (req, res) => {
  const where = []; const params = [];
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q) {
    where.push("(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR subject LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\')");
    params.push(like(q), like(q), like(q), like(q));
  }
  if (req.query.status === 'unread') where.push('is_read = 0');
  if (req.query.status === 'read') where.push('is_read = 1');
  if (req.query.subject) { where.push('subject = ?'); params.push(String(req.query.subject)); }
  const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM contact_messages ${W}`).get(...params).c;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), pages);
  const items = db.prepare(`SELECT * FROM contact_messages ${W} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(...params, limit, (page - 1) * limit);
  const unread = db.prepare('SELECT COUNT(*) c FROM contact_messages WHERE is_read = 0').get().c;
  const subjects = db.prepare("SELECT DISTINCT subject FROM contact_messages WHERE subject != '' ORDER BY subject").all().map((r) => r.subject);
  res.json({ items, total, page, pages, limit, unread, subjects });
});

router.get('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id);
  if (!row) throw new HttpError(404, 'Message not found.');
  res.json(row);
});

router.put('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id);
  if (!row) throw new HttpError(404, 'Message not found.');
  const v = validate({ is_read: { type: 'bool', required: true } }, req.body);
  db.prepare('UPDATE contact_messages SET is_read = ? WHERE id = ?').run(v.is_read, row.id);
  res.json({ ...row, is_read: v.is_read });
});

router.delete('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id);
  if (!row) throw new HttpError(404, 'Message not found.');
  db.prepare('DELETE FROM contact_messages WHERE id = ?').run(row.id);
  logActivity(req, 'Deleted message', 'messages', row.id, `From ${row.name}`);
  res.json({ ok: true });
});

module.exports = router;
