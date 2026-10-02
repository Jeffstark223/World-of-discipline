'use strict';
/**
 * One well-tested CRUD implementation reused for sermons, events, ministries, leaders
 * and vision pillars. All SQL is parameterised; column names come from the static
 * specs below, never from user input.
 *
 * GET routes are PUBLIC and return only published/active rows, unless the caller is a
 * signed-in admin (and does not pass ?public=1), in which case everything is returned.
 */
const express = require('express');
const { db } = require('../db');
const { HttpError, validate, like } = require('../lib');
const { requireAuth, logActivity } = require('../middleware');
const { removeUploaded } = require('../uploads');

function crud(cfg) {
  const {
    table, resource, label, spec, search = [], publicWhere = '1=1', order = 'id DESC',
    orderable = false, filters = {}, toggle = null, transform = (r) => r, beforeSave = () => {},
    publicOrder, labelOf = (r) => r.name || r.title || r.id, fileCols = [],
  } = cfg;
  // columns holding /uploads/ files: remove the file from disk when the row is deleted or the file is replaced
  const dropFiles = (before, after) => fileCols.forEach((c) => { if (before[c] && (!after || after[c] !== before[c])) removeUploaded(before[c]); });
  const router = express.Router();
  const cols = Object.keys(spec);
  const getRow = (id) => db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  const isAdminView = (req) => !!req.admin && req.query.public !== '1';
  const lbl = typeof label === 'function' ? label : () => label;

  router.get('/', (req, res) => {
    const admin = isAdminView(req);
    const where = []; const params = [];
    if (!admin) where.push(publicWhere);
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q && search.length) {
      where.push('(' + search.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')');
      search.forEach(() => params.push(like(q)));
    }
    for (const [name, fn] of Object.entries(filters)) {
      const val = req.query[name];
      if (val === undefined || val === '') continue;
      const f = fn(String(val), admin);
      if (f) { where.push(f[0]); params.push(...(f[1] || [])); }
    }
    const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = db.prepare(`SELECT COUNT(*) c FROM ${table} ${W}`).get(...params).c;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || (admin ? 20 : 100), 1), 200);
    const pages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), pages);
    const ord = (!admin && publicOrder ? publicOrder(req.query) : null) || (typeof order === 'function' ? order(req.query) : order);
    const items = db.prepare(`SELECT * FROM ${table} ${W} ORDER BY ${ord} LIMIT ? OFFSET ?`)
      .all(...params, limit, (page - 1) * limit).map(transform);
    res.json({ items, total, page, pages, limit });
  });

  // Reorder must be registered before /:id
  if (orderable) {
    router.post('/reorder', requireAuth, (req, res) => {
      const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(Number) : [];
      if (!ids.length || ids.some((n) => !Number.isInteger(n))) throw new HttpError(400, 'Nothing to reorder.');
      const st = db.prepare(`UPDATE ${table} SET display_order = ?, updated_at = datetime('now') WHERE id = ?`);
      db.transaction(() => ids.forEach((id, i) => st.run(i + 1, id)))();
      logActivity(req, `Reordered ${lbl({})}s`, table, '', `${ids.length} items`);
      res.json({ ok: true });
    });
  }

  router.get('/:id', (req, res) => {
    const row = getRow(req.params.id);
    if (!row || (!isAdminView(req) && !db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND ${publicWhere}`).get(row.id))) {
      throw new HttpError(404, `${lbl({})} not found.`);
    }
    res.json(transform(row));
  });

  router.post('/', requireAuth, (req, res) => {
    const v = validate(spec, req.body);
    beforeSave(v, null);
    if (orderable && !(req.body && req.body.display_order)) {
      v.display_order = db.prepare(`SELECT COALESCE(MAX(display_order),0)+1 n FROM ${table}`).get().n;
    }
    if ('created_by' in (cfg.extraCols || {})) v.created_by = req.admin.id;
    const keys = Object.keys(v);
    const info = db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => v[k]));
    const row = getRow(info.lastInsertRowid);
    logActivity(req, `Added ${lbl(row)}`, table, row.id, labelOf(row));
    res.status(201).json(transform(row));
  });

  router.put('/:id', requireAuth, (req, res) => {
    const existing = getRow(req.params.id);
    if (!existing) throw new HttpError(404, `${lbl({})} not found.`);
    const v = validate(spec, req.body, { partial: true });
    beforeSave(v, existing);
    const keys = Object.keys(v);
    if (keys.length) {
      db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
        .run(...keys.map((k) => v[k]), existing.id);
    }
    const row = getRow(existing.id);
    dropFiles(existing, row);
    let action = `Edited ${lbl(row)}`;
    if (toggle && keys.length === 1 && keys[0] === toggle.field && v[toggle.field] !== existing[toggle.field]) {
      action = `${v[toggle.field] ? toggle.on : toggle.off} ${lbl(row)}`;
    }
    logActivity(req, action, table, row.id, labelOf(row));
    res.json(transform(row));
  });

  router.delete('/:id', requireAuth, (req, res) => {
    const existing = getRow(req.params.id);
    if (!existing) throw new HttpError(404, `${lbl({})} not found.`);
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(existing.id);
    dropFiles(existing, null);
    logActivity(req, `Deleted ${lbl(existing)}`, table, existing.id, labelOf(existing));
    res.json({ ok: true });
  });

  return router;
}

const status2 = (col, on, off) => (val) => (val === on ? [`${col} = 1`] : val === off ? [`${col} = 0`] : null);

const sermons = crud({
  table: 'sermons', resource: 'sermons', label: 'sermon',
  spec: {
    title: { type: 'text', max: 200, required: true },
    speaker: { type: 'text', max: 120 },
    preached_on: { type: 'date', required: true, label: 'date' },
    duration: { type: 'text', max: 40 },
    description: { type: 'long', max: 5000 },
    series: { type: 'text', max: 120, label: 'series' },
    thumbnail_url: { type: 'url', label: 'thumbnail' },
    video_url: { type: 'url', label: 'video link' },
    audio_url: { type: 'url', label: 'audio link' },
    is_featured: { type: 'bool', default: 0 },
    is_published: { type: 'bool', default: 1 },
  },
  extraCols: { created_by: 1 },
  fileCols: ['thumbnail_url', 'video_url', 'audio_url'],
  search: ['title', 'speaker', 'series', 'description'],
  order: 'preached_on DESC, id DESC',
  publicWhere: 'is_published = 1',
  publicOrder: (q) => (q.featured_first === '1' ? 'is_featured DESC, preached_on DESC, id DESC' : null),
  filters: {
    status: status2('is_published', 'published', 'draft'),
    featured: (v) => (v === '1' ? ['is_featured = 1'] : null),
    series: (v) => ['series = ?', [v]],
  },
  toggle: { field: 'is_published', on: 'Published', off: 'Unpublished' },
});

const today = "date('now')";
const events = crud({
  table: 'events', resource: 'events', label: 'event',
  spec: {
    name: { type: 'text', max: 200, required: true, label: 'event name' },
    description: { type: 'long', max: 5000 },
    event_date: { type: 'date', required: true, label: 'date' },
    start_time: { type: 'time', label: 'start time' },
    end_time: { type: 'time', label: 'end time' },
    extra_info: { type: 'text', max: 200, label: 'extra info' },
    location: { type: 'text', max: 200 },
    category: { type: 'text', max: 60, label: 'category' },
    image_url: { type: 'url', label: 'image' },
    registration_url: { type: 'url', label: 'registration link' },
    status: { type: 'enum', values: ['draft', 'published', 'cancelled'], default: 'published' },
  },
  extraCols: { created_by: 1 },
  search: ['name', 'description', 'location', 'category'],
  order: (q) => (q.when === 'past' ? 'event_date DESC, start_time DESC' : q.when === 'upcoming' ? 'event_date ASC, start_time ASC' : 'event_date DESC, start_time DESC'),
  publicWhere: "status = 'published'",
  filters: {
    status: (v) => (['draft', 'published', 'cancelled'].includes(v) ? ['status = ?', [v]] : null),
    when: (v) => (v === 'upcoming' ? [`event_date >= ${today}`] : v === 'past' ? [`event_date < ${today}`] : null),
  },
  beforeSave(v, existing) {
    const s = 'start_time' in v ? v.start_time : existing && existing.start_time;
    const e = 'end_time' in v ? v.end_time : existing && existing.end_time;
    if (s && e && e <= s) throw new HttpError(400, 'Please fix the highlighted fields.', { end_time: 'End time must be after the start time' });
  },
});

const ministries = crud({
  table: 'ministries', resource: 'ministries', label: 'ministry', orderable: true,
  spec: {
    name: { type: 'text', max: 120, required: true, label: 'ministry name' },
    description: { type: 'long', max: 2000 },
    icon: { type: 'text', max: 16 },
    image_url: { type: 'url', label: 'image' },
    leader_name: { type: 'text', max: 120, label: 'leader' },
    meeting_info: { type: 'text', max: 300, label: 'meeting information' },
    contact_info: { type: 'text', max: 300, label: 'contact information' },
    display_order: { type: 'int', min: 0, max: 100000, default: 0 },
    is_active: { type: 'bool', default: 1 },
  },
  search: ['name', 'description', 'leader_name'],
  order: 'display_order, id',
  publicWhere: 'is_active = 1',
  filters: { status: status2('is_active', 'active', 'disabled') },
  toggle: { field: 'is_active', on: 'Enabled', off: 'Disabled' },
});

const leaders = crud({
  table: 'leaders', resource: 'leaders', label: 'leader', orderable: true,
  spec: {
    name: { type: 'text', max: 120, required: true },
    position: { type: 'text', max: 120, label: 'position' },
    bio: { type: 'long', max: 3000, label: 'biography' },
    image_url: { type: 'url', label: 'profile image' },
    social_links: { type: 'social', label: 'social links' },
    display_order: { type: 'int', min: 0, max: 100000, default: 0 },
    is_active: { type: 'bool', default: 1 },
  },
  search: ['name', 'position', 'bio'],
  order: 'display_order, id',
  publicWhere: 'is_active = 1',
  filters: { status: status2('is_active', 'active', 'disabled') },
  transform: (r) => ({ ...r, social_links: safeJson(r.social_links) }),
  toggle: { field: 'is_active', on: 'Enabled', off: 'Disabled' },
});

const pillars = crud({
  table: 'vision_pillars', resource: 'pillars', label: (r) => (r.section === 'core_value' ? 'core value' : 'vision pillar'),
  orderable: true,
  spec: {
    section: { type: 'enum', values: ['pillar', 'core_value'], default: 'pillar' },
    icon: { type: 'text', max: 16 },
    title: { type: 'text', max: 120, required: true },
    description: { type: 'long', max: 600 },
    display_order: { type: 'int', min: 0, max: 100000, default: 0 },
    is_active: { type: 'bool', default: 1 },
  },
  search: ['title', 'description'],
  order: 'section, display_order, id',
  publicWhere: 'is_active = 1',
  filters: {
    section: (v) => (['pillar', 'core_value'].includes(v) ? ['section = ?', [v]] : null),
    status: status2('is_active', 'active', 'disabled'),
  },
  toggle: { field: 'is_active', on: 'Enabled', off: 'Disabled' },
});

function safeJson(s) { try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }

module.exports = { sermons, events, ministries, leaders, pillars, safeJson };
