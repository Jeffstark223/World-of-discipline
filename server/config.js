'use strict';
/**
 * Central configuration + storage-persistence checks.
 *
 * WHERE DATA LIVES (all configurable, nothing hard-coded):
 *   DATABASE_PATH -> the SQLite file          (default: ./data/wod.db)
 *   UPLOAD_DIR    -> uploaded images          (default: ./data/uploads)
 *
 * On Render, the normal app filesystem is EPHEMERAL: it is wiped on every deploy
 * and restart. Both paths must therefore point inside a Render Persistent Disk
 * mount (e.g. /var/data). See README.md.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT = path.join(__dirname, '..');
const isProd = process.env.NODE_ENV === 'production';
const onRender = !!process.env.RENDER; // Render sets RENDER=true automatically

const resolve = (p, fallback) => path.resolve(ROOT, p && p.trim() ? p.trim() : fallback);

const config = {
  ROOT,
  isProd,
  onRender,
  port: parseInt(process.env.PORT, 10) || 3000,
  databasePath: resolve(process.env.DATABASE_PATH, './data/wod.db'),
  uploadDir: resolve(process.env.UPLOAD_DIR, './data/uploads'),
  databasePathFromEnv: !!(process.env.DATABASE_PATH || '').trim(),
  uploadDirFromEnv: !!(process.env.UPLOAD_DIR || '').trim(),
  sessionHours: Math.max(1, parseFloat(process.env.SESSION_HOURS) || 12),
  maxUploadMB: Math.max(1, parseInt(process.env.MAX_UPLOAD_MB, 10) || 8),
  maxMediaMB: Math.max(1, parseInt(process.env.MAX_MEDIA_MB, 10) || 200), // sermon audio/video files
  bcryptRounds: 12,
  // Comma-separated list of extra origins allowed to call the public API (only needed
  // if the public website is hosted on a different domain than this server).
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  // Explicit opt-in to run on Render WITHOUT a persistent disk (data will be lost).
  allowEphemeral: /^(1|true|yes)$/i.test(process.env.ALLOW_EPHEMERAL_STORAGE || ''),
  requirePersistent: onRender || /^(1|true|yes)$/i.test(process.env.REQUIRE_PERSISTENT_STORAGE || ''),
};

const deviceOf = (p) => {
  // stat the nearest existing ancestor so this works before the dir is created
  let cur = p;
  for (let i = 0; i < 32; i++) {
    try { return fs.statSync(cur).dev; } catch { const up = path.dirname(cur); if (up === cur) break; cur = up; }
  }
  return null;
};

const isInside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/**
 * Inspect storage and describe how safe it is. This is a best-effort check:
 * a Render Persistent Disk is a separate mounted volume, so data on it has a
 * different filesystem device id than the application's own (ephemeral) folder.
 * We NEVER report "persistent" unless we could positively see a separate volume.
 */
function inspectStorage() {
  const appDev = deviceOf(ROOT);
  const dbDir = path.dirname(config.databasePath);
  const dbDev = deviceOf(dbDir);
  const upDev = deviceOf(config.uploadDir);
  const insideApp = (p) => isInside(p, ROOT);
  const dbSeparate = dbDev !== null && appDev !== null && dbDev !== appDev;
  const upSeparate = upDev !== null && appDev !== null && upDev !== appDev;

  const problems = [];
  if (config.requirePersistent) {
    if (!config.databasePathFromEnv) problems.push('DATABASE_PATH is not set (it would fall back to ./data/wod.db inside the ephemeral app folder).');
    if (!config.uploadDirFromEnv) problems.push('UPLOAD_DIR is not set (uploads would fall back to ./data/uploads inside the ephemeral app folder).');
    if (insideApp(config.databasePath)) problems.push(`DATABASE_PATH (${config.databasePath}) is inside the application folder, which is wiped on every deploy/restart.`);
    else if (!dbSeparate) problems.push(`DATABASE_PATH (${config.databasePath}) does not appear to be on a separate mounted disk.`);
    if (insideApp(config.uploadDir)) problems.push(`UPLOAD_DIR (${config.uploadDir}) is inside the application folder, which is wiped on every deploy/restart.`);
    else if (!upSeparate) problems.push(`UPLOAD_DIR (${config.uploadDir}) does not appear to be on a separate mounted disk.`);
  }

  let status; // 'local' | 'verified' | 'not_persistent'
  if (problems.length) status = 'not_persistent';
  else if (config.requirePersistent) status = 'verified';
  else status = 'local';

  return {
    status,
    databasePath: config.databasePath,
    uploadDir: config.uploadDir,
    databaseOnSeparateVolume: dbSeparate,
    uploadsOnSeparateVolume: upSeparate,
    requirePersistent: config.requirePersistent,
    ephemeralAcknowledged: config.allowEphemeral,
    problems,
  };
}

/** Called at startup. Refuses to run on Render with non-persistent storage unless explicitly acknowledged. */
function assertStorageSafe() {
  const info = inspectStorage();
  if (info.status === 'not_persistent') {
    const msg = [
      '',
      '==================== STORAGE IS NOT PERSISTENT ====================',
      ...info.problems.map((p) => ' - ' + p),
      '',
      ' On Render, anything outside a Persistent Disk is DELETED on every',
      ' deploy/restart: admins, sermons, events, messages and uploaded images.',
      ' Fix: attach a Persistent Disk (mount path /var/data) and set',
      '   DATABASE_PATH=/var/data/wod.db',
      '   UPLOAD_DIR=/var/data/uploads',
      ' See README.md -> "Deploying to Render".',
      '===================================================================',
      '',
    ].join('\n');
    if (!config.allowEphemeral) {
      console.error(msg);
      console.error('Refusing to start. (To run anyway for a throw-away demo, set ALLOW_EPHEMERAL_STORAGE=true — data WILL be lost.)');
      process.exit(1);
    }
    console.warn(msg);
    console.warn('ALLOW_EPHEMERAL_STORAGE=true is set, so the server is starting anyway. DATA WILL BE LOST.');
  }
  return info;
}

module.exports = { config, inspectStorage, assertStorageSafe };
