'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { db } = require('../db');
const { like } = require('../lib');
const { requireAuth, logActivity } = require('../middleware');
const { inspectStorage } = require('../config');

const router = express.Router();
router.use(requireAuth);

const count = (sql) => db.prepare(sql).get().c;

// Every number below is a live COUNT from SQLite.
router.get('/dashboard', (req, res) => {
  res.json({
    stats: {
      sermons: count('SELECT COUNT(*) c FROM sermons'),
      upcoming_events: count("SELECT COUNT(*) c FROM events WHERE status = 'published' AND event_date >= date('now')"),
      ministries: count('SELECT COUNT(*) c FROM ministries'),
      leaders: count('SELECT COUNT(*) c FROM leaders'),
      gallery: count('SELECT COUNT(*) c FROM gallery'),
      unread_messages: count('SELECT COUNT(*) c FROM contact_messages WHERE is_read = 0'),
      active_admins: count('SELECT COUNT(*) c FROM admins WHERE is_active = 1'),
    },
    recent_sermons: db.prepare('SELECT id, title, speaker, preached_on, is_published FROM sermons ORDER BY preached_on DESC, id DESC LIMIT 5').all(),
    upcoming_events: db.prepare("SELECT id, name, event_date, start_time, location, status FROM events WHERE status = 'published' AND event_date >= date('now') ORDER BY event_date, start_time LIMIT 5").all(),
    recent_messages: db.prepare('SELECT id, name, subject, message, is_read, created_at FROM contact_messages ORDER BY created_at DESC, id DESC LIMIT 5').all(),
    recent_activity: db.prepare('SELECT id, admin_name, admin_email, action, resource, details, created_at FROM activity_logs ORDER BY id DESC LIMIT 8').all(),
    storage: (({ status, problems }) => ({ status, problems }))(inspectStorage()),
  });
});

router.get('/activity', (req, res) => {
  const where = []; const params = [];
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q) {
    where.push("(admin_name LIKE ? ESCAPE '\\' OR admin_email LIKE ? ESCAPE '\\' OR action LIKE ? ESCAPE '\\' OR resource LIKE ? ESCAPE '\\' OR details LIKE ? ESCAPE '\\')");
    params.push(like(q), like(q), like(q), like(q), like(q));
  }
  if (req.query.admin_id) { where.push('admin_id = ?'); params.push(Number(req.query.admin_id) || 0); }
  const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM activity_logs ${W}`).get(...params).c;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), pages);
  const items = db.prepare(`SELECT * FROM activity_logs ${W} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, (page - 1) * limit);
  res.json({ items, total, page, pages, limit });
});

// Downloads a consistent snapshot of the SQLite database (safe while the site is running).
router.get('/settings/backup', async (req, res, next) => {
  const tmp = path.join(os.tmpdir(), `wod-backup-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
  try {
    await db.backup(tmp);
    logActivity(req, 'Downloaded database backup', 'settings');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.download(tmp, `wod-backup-${stamp}.db`, () => fs.rm(tmp, { force: true }, () => {}));
  } catch (e) { fs.rm(tmp, { force: true }, () => {}); next(e); }
});

module.exports = router;
