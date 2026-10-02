'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { config } = require('./config');
const { HttpError } = require('./lib');

/**
 * Upload safety:
 *  - Only real JPEG / PNG / GIF / WebP images are accepted. The type is detected from the
 *    file's leading bytes ("magic numbers"), NOT from the filename or the browser-supplied MIME type.
 *  - The stored filename is random and its extension comes from the detected type, so a file
 *    called "evil.html" or "photo.jpg.php" can never be stored or served under a dangerous name.
 *  - SVG is deliberately NOT allowed (it can contain scripts).
 *  - Files are written to UPLOAD_DIR, which must be on a Render Persistent Disk in production.
 */
function detect(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: '.jpg', mime: 'image/jpeg' };
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: '.png', mime: 'image/png' };
  const head = buf.slice(0, 6).toString('latin1');
  if (head === 'GIF87a' || head === 'GIF89a') return { ext: '.gif', mime: 'image/gif' };
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return { ext: '.webp', mime: 'image/webp' };
  return null;
}

/**
 * Audio / video detection (again from the file's leading bytes, never the filename).
 * Returns { ext, mime, kind: 'audio'|'video'|'both' } or null.
 */
function detectMedia(b) {
  if (b.length < 12) return null;
  const s4 = b.slice(4, 8).toString('latin1');
  if (s4 === 'ftyp') {
    const brand = b.slice(8, 12).toString('latin1');
    if (/^M4[AB]/.test(brand)) return { ext: '.m4a', mime: 'audio/mp4', kind: 'audio' };
    if (brand === 'qt  ') return { ext: '.mov', mime: 'video/quicktime', kind: 'video' };
    return { ext: '.mp4', mime: 'video/mp4', kind: 'video' };
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: '.webm', mime: 'video/webm', kind: 'both' };
  if (b.slice(0, 4).toString('latin1') === 'OggS') return { ext: '.ogg', mime: 'audio/ogg', kind: 'audio' };
  if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WAVE') return { ext: '.wav', mime: 'audio/wav', kind: 'audio' };
  if (b.slice(0, 3).toString('latin1') === 'ID3') return { ext: '.mp3', mime: 'audio/mpeg', kind: 'audio' };
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) {
    if ((b[1] & 0xf6) === 0xf0) return { ext: '.aac', mime: 'audio/aac', kind: 'audio' };
    return { ext: '.mp3', mime: 'audio/mpeg', kind: 'audio' };
  }
  return null;
}

// Media files can be large, so they are streamed to disk (not held in memory), then verified and renamed.
const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { fs.mkdirSync(config.uploadDir, { recursive: true }); cb(null, config.uploadDir); },
    filename: (req, file, cb) => cb(null, 'tmp-' + crypto.randomBytes(8).toString('hex') + '.part'),
  }),
  limits: { fileSize: config.maxMediaMB * 1024 * 1024, files: 1 },
});

/** Validates an already-streamed temp file, renames it to a random safe name, or deletes it. */
function saveMedia(file, kind) {
  const tmpPath = file.path;
  try {
    const fd = fs.openSync(tmpPath, 'r'); const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
    const type = detectMedia(head);
    const okKind = type && (type.kind === 'both' || type.kind === kind);
    if (!okKind) {
      throw new HttpError(400, kind === 'audio'
        ? `"${file.originalname}" is not a supported audio file. Use MP3, M4A, WAV, OGG or AAC.`
        : `"${file.originalname}" is not a supported video file. Use MP4, WebM or MOV.`);
    }
    const name = crypto.randomBytes(12).toString('hex') + type.ext;
    fs.renameSync(tmpPath, path.join(config.uploadDir, name));
    const safeOriginal = path.basename(file.originalname || '').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
    return { url: '/uploads/' + name, stored_name: name, file_name: safeOriginal, mime_type: type.mime, size_bytes: file.size };
  } catch (e) { fs.rmSync(tmpPath, { force: true }); throw e; }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMB * 1024 * 1024, files: 20 },
});

function saveImage(file) {
  const type = detect(file.buffer);
  if (!type) throw new HttpError(400, `"${file.originalname}" is not a supported image. Upload a JPG, PNG, GIF or WebP file.`);
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const name = crypto.randomBytes(12).toString('hex') + type.ext;
  fs.writeFileSync(path.join(config.uploadDir, name), file.buffer, { flag: 'wx', mode: 0o644 });
  const safeOriginal = path.basename(file.originalname || '').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  return { url: '/uploads/' + name, stored_name: name, file_name: safeOriginal, mime_type: type.mime, size_bytes: file.size };
}

/** Removes a previously uploaded file. Refuses anything that is not one of our own generated names. */
function removeUploaded(url) {
  const m = /^\/uploads\/([a-f0-9]{24}\.(?:jpg|png|gif|webp|mp4|m4a|mov|webm|ogg|wav|mp3|aac))$/.exec(url || '');
  if (!m) return false;
  try { fs.unlinkSync(path.join(config.uploadDir, m[1])); return true; } catch { return false; }
}

/** Wraps multer so its errors become friendly JSON errors. */
function handle(mw) {
  return (req, res, next) => mw(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      // multer leaves a partial temp file when the limit is hit; clean it up
      try { for (const f of fs.readdirSync(config.uploadDir)) if (f.startsWith('tmp-') && f.endsWith('.part') && Date.now() - fs.statSync(path.join(config.uploadDir, f)).mtimeMs < 120000) fs.rmSync(path.join(config.uploadDir, f), { force: true }); } catch { /* ignore */ }
      return next(new HttpError(413, req.originalUrl.includes('/media') ? `That file is too large. The maximum is ${config.maxMediaMB} MB. For longer recordings, upload to YouTube or similar and paste the link instead.` : `That file is too large. The maximum size is ${config.maxUploadMB} MB per image.`));
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return next(new HttpError(400, 'Too many files, or an unexpected file field.'));
    next(err);
  });
}

module.exports = { upload, mediaUpload, saveImage, saveMedia, removeUploaded, handle, detect, detectMedia };
