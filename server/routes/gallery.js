'use strict';
const express = require('express');
const { db } = require('../db');
const { HttpError, validate, like } = require('../lib');
const { requireAuth, logActivity } = require('../middleware');
const { upload, mediaUpload, saveImage, saveMedia, removeUploaded, handle } = require('../uploads');

const gallery = express.Router();
const uploadRouter = express.Router();

const spec = {
  caption: { type: 'text', max: 300 },
  category: { type: 'text', max: 60 },
  display_order: { type: 'int', min: 0, max: 100000 },
  is_active: { type: 'bool' },
};
const isAdminView = (req) => !!req.admin && req.query.public !== '1';
const getRow = (id) => db.prepare('SELECT * FROM gallery WHERE id = ?').get(id);

gallery.get('/', (req, res) => {
  const admin = isAdminView(req);
  const where = []; const params = [];
  if (!admin) where.push('is_active = 1');
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q) { where.push("(caption LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\' OR file_name LIKE ? ESCAPE '\\')"); params.push(like(q), like(q), like(q)); }
  if (req.query.category) { where.push('category = ?'); params.push(String(req.query.category)); }
  if (admin && req.query.status === 'active') where.push('is_active = 1');
  if (admin && req.query.status === 'disabled') where.push('is_active = 0');
  const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM gallery ${W}`).get(...params).c;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || (admin ? 24 : 200), 1), 200);
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), pages);
  const items = db.prepare(`SELECT * FROM gallery ${W} ORDER BY display_order, id DESC LIMIT ? OFFSET ?`).all(...params, limit, (page - 1) * limit);
  const categories = db.prepare("SELECT DISTINCT category FROM gallery WHERE category != '' " + (admin ? '' : 'AND is_active = 1 ') + 'ORDER BY category').all().map((r) => r.category);
  res.json({ items, total, page, pages, limit, categories });
});

// Upload one or many images (multipart field name: "images"), optionally with caption/category applied to each.
gallery.post('/', requireAuth, handle(upload.array('images', 20)), (req, res) => {
  const files = req.files || [];
  if (!files.length) throw new HttpError(400, 'Choose at least one image to upload.');
  const meta = validate({ caption: spec.caption, category: spec.category }, req.body);
  const created = [];
  const next = db.prepare('SELECT COALESCE(MAX(display_order),0) n FROM gallery').get().n;
  // Validate every file before saving any, so a bad file doesn't leave a half-finished batch.
  const saved = [];
  try {
    files.forEach((f) => saved.push(saveImage(f)));
  } catch (e) { saved.forEach((s) => removeUploaded(s.url)); throw e; }
  const ins = db.prepare(`INSERT INTO gallery (caption, category, image_url, file_name, mime_type, size_bytes, display_order, uploaded_by)
                          VALUES (?,?,?,?,?,?,?,?)`);
  db.transaction(() => saved.forEach((s, i) => {
    const info = ins.run(meta.caption, meta.category, s.url, s.file_name, s.mime_type, s.size_bytes, next + i + 1, req.admin.id);
    created.push(getRow(info.lastInsertRowid));
  }))();
  logActivity(req, 'Uploaded gallery image', 'gallery', created.map((c) => c.id).join(','), `${created.length} image(s)${meta.category ? ' in ' + meta.category : ''}`);
  res.status(201).json({ items: created });
});

gallery.post('/reorder', requireAuth, (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(Number) : [];
  if (!ids.length || ids.some((n) => !Number.isInteger(n))) throw new HttpError(400, 'Nothing to reorder.');
  const st = db.prepare("UPDATE gallery SET display_order = ?, updated_at = datetime('now') WHERE id = ?");
  db.transaction(() => ids.forEach((id, i) => st.run(i + 1, id)))();
  logActivity(req, 'Reordered gallery', 'gallery', '', `${ids.length} images`);
  res.json({ ok: true });
});

gallery.get('/:id', (req, res) => {
  const row = getRow(req.params.id);
  if (!row || (!isAdminView(req) && !row.is_active)) throw new HttpError(404, 'Image not found.');
  res.json(row);
});

gallery.put('/:id', requireAuth, (req, res) => {
  const existing = getRow(req.params.id);
  if (!existing) throw new HttpError(404, 'Image not found.');
  const v = validate(spec, req.body, { partial: true });
  const keys = Object.keys(v);
  if (keys.length) {
    db.prepare(`UPDATE gallery SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...keys.map((k) => v[k]), existing.id);
  }
  let action = 'Edited gallery image';
  if (keys.length === 1 && keys[0] === 'is_active' && v.is_active !== existing.is_active) action = v.is_active ? 'Enabled gallery image' : 'Disabled gallery image';
  logActivity(req, action, 'gallery', existing.id, existing.caption || existing.file_name);
  res.json(getRow(existing.id));
});

gallery.delete('/:id', requireAuth, (req, res) => {
  const existing = getRow(req.params.id);
  if (!existing) throw new HttpError(404, 'Image not found.');
  db.prepare('DELETE FROM gallery WHERE id = ?').run(existing.id);
  removeUploaded(existing.image_url);
  logActivity(req, 'Deleted gallery image', 'gallery', existing.id, existing.caption || existing.file_name);
  res.json({ ok: true });
});

// Single-image upload used by the image pickers in the CMS forms (thumbnail, profile photo, etc.).
uploadRouter.post('/', requireAuth, handle(upload.single('file')), (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose an image to upload.');
  const s = saveImage(req.file);
  logActivity(req, 'Uploaded image', 'uploads', s.stored_name, s.file_name);
  res.status(201).json({ url: s.url, file_name: s.file_name, size_bytes: s.size_bytes });
});

// Sermon audio / video files.  POST /api/upload/media?kind=audio|video   (multipart field: "file")
uploadRouter.post('/media', requireAuth, handle(mediaUpload.single('file')), (req, res) => {
  const kind = req.query.kind === 'audio' ? 'audio' : req.query.kind === 'video' ? 'video' : null;
  if (!req.file) throw new HttpError(400, 'Choose an audio or video file to upload.');
  if (!kind) { require('fs').rmSync(req.file.path, { force: true }); throw new HttpError(400, 'Specify kind=audio or kind=video.'); }
  const s = saveMedia(req.file, kind);
  logActivity(req, `Uploaded sermon ${kind} file`, 'uploads', s.stored_name, `${s.file_name} (${(s.size_bytes / 1048576).toFixed(1)} MB)`);
  res.status(201).json({ url: s.url, file_name: s.file_name, size_bytes: s.size_bytes, mime_type: s.mime_type });
});

module.exports = { gallery, uploadRouter };
