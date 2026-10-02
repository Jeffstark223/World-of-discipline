'use strict';
/** Small, dependency-free validation helpers. */

class HttpError extends Error {
  constructor(status, message, fields) { super(message); this.status = status; this.fields = fields; }
}

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g; // control chars except \t \n \r

function cleanStr(v, max) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' && typeof v !== 'number') throw new Error('must be text');
  return String(v).replace(/\r\n/g, '\n').replace(CTRL, '').trim().slice(0, max);
}

/**
 * URLs we store are later put in href/src attributes. Allow only:
 *  - http(s) URLs
 *  - site-relative paths ("/uploads/x.jpg", "logo.jpg", "#giving-bank")
 *  - mailto:/tel: when kind === 'link'
 * Everything else (javascript:, data:, vbscript: ...) is rejected.
 */
function checkUrl(raw, kind) {
  const v = cleanStr(raw, 2000);
  if (!v) return '';
  const scheme = /^([a-z][a-z0-9+.\-]*):/i.exec(v);
  if (scheme) {
    const s = scheme[1].toLowerCase();
    const ok = s === 'http' || s === 'https' || (kind === 'link' && (s === 'mailto' || s === 'tel'));
    if (!ok) throw new Error('must be a web address starting with http:// or https://');
    if (s.startsWith('http')) { try { new URL(v); } catch { throw new Error('is not a valid web address'); } }
    return v;
  }
  if (v.startsWith('//') || v.includes('\\') || v.split('/').includes('..') || /[\u0000-\u001F<>"']/.test(v)) {
    throw new Error('is not a valid path or web address');
  }
  return v;
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) &&
  new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

const TYPES = {
  text: (v, f) => { const s = cleanStr(v, f.max || 200); return s; },
  long: (v, f) => cleanStr(v, f.max || 5000),
  url: (v) => checkUrl(v, 'url'),
  link: (v) => checkUrl(v, 'link'),
  email: (v) => {
    const s = cleanStr(v, 254).toLowerCase();
    if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error('is not a valid email address');
    return s;
  },
  bool: (v) => {
    if (v === true || v === 1 || v === '1' || v === 'true' || v === 'on') return 1;
    if (v === false || v === 0 || v === '0' || v === 'false' || v === 'off' || v === '' || v === null) return 0;
    throw new Error('must be true or false');
  },
  int: (v, f) => {
    const n = Number(v);
    if (!Number.isInteger(n)) throw new Error('must be a whole number');
    if (f.min !== undefined && n < f.min) throw new Error(`must be at least ${f.min}`);
    if (f.max !== undefined && n > f.max) throw new Error(`must be at most ${f.max}`);
    return n;
  },
  date: (v) => { const s = cleanStr(v, 10); if (s && !isDate(s)) throw new Error('must be a valid date (YYYY-MM-DD)'); return s; },
  time: (v) => { const s = cleanStr(v, 5); if (s && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new Error('must be a time like 18:30'); return s; },
  enum: (v, f) => { const s = cleanStr(v, 40); if (!f.values.includes(s)) throw new Error(`must be one of: ${f.values.join(', ')}`); return s; },
  social: (v) => {
    let o = v;
    if (typeof v === 'string') { try { o = v ? JSON.parse(v) : {}; } catch { throw new Error('is not valid'); } }
    if (o === null || typeof o !== 'object' || Array.isArray(o)) throw new Error('is not valid');
    const out = {};
    for (const k of ['facebook', 'instagram', 'x', 'youtube', 'website']) {
      if (o[k]) { try { out[k] = checkUrl(o[k], 'url'); } catch (e) { throw new Error(`${k} ${e.message}`); } }
    }
    return JSON.stringify(out);
  },
};

/**
 * spec: { field: { type, required, max, min, values, default } }
 * partial=true skips fields that are absent from the body (used for PUT/PATCH).
 * Returns { values } or throws HttpError(400, ..., fields).
 */
function validate(spec, body, { partial = false } = {}) {
  body = body && typeof body === 'object' ? body : {};
  const values = {}; const errors = {};
  for (const [name, f] of Object.entries(spec)) {
    const label = f.label || name.replace(/_/g, ' ');
    if (!(name in body)) {
      if (partial) continue;
      if (f.required) { errors[name] = `${label} is required`; continue; }
      values[name] = f.default !== undefined ? f.default : (f.type === 'bool' ? 0 : f.type === 'int' ? 0 : f.type === 'social' ? '{}' : '');
      continue;
    }
    try {
      const v = TYPES[f.type](body[name], f);
      if (f.required && (v === '' || v === undefined)) { errors[name] = `${label} is required`; continue; }
      values[name] = v;
    } catch (e) { errors[name] = `${label} ${e.message}`; }
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields.', errors);
  return values;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const strongPassword = (pw, email = '') => {
  if (typeof pw !== 'string' || pw.length < 10) return 'Password must be at least 10 characters.';
  if (pw.length > 200) return 'Password is too long.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain at least one letter and one number.';
  if (email && pw.toLowerCase() === email.toLowerCase()) return 'Password must not be the same as the email address.';
  return null;
};

const like = (s) => '%' + String(s).replace(/[\\%_]/g, (c) => '\\' + c) + '%';

module.exports = { HttpError, validate, cleanStr, checkUrl, esc, strongPassword, like, isDate };
