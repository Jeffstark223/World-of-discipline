'use strict';
/**
 * npm run restore -- path/to/wod.db [path/to/uploads-folder]
 * STOP the server first. The current database is kept as wod.db.before-restore-<time> next to it.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { config } = require('../server/config');

const [src, uploads] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const fail = (m) => { console.error('Error: ' + m); process.exit(1); };
if (!src || !fs.existsSync(src)) fail('Usage: npm run restore -- <backup wod.db> [<backup uploads folder>]');

const t = new Database(src, { readonly: true, fileMustExist: true });
try {
  if (t.pragma('integrity_check', { simple: true }) !== 'ok') fail('That file failed the SQLite integrity check.');
  if (!t.prepare("SELECT 1 FROM sqlite_master WHERE name = 'admins'").get()) fail('That file does not look like a WOD database.');
} finally { t.close(); }

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
if (fs.existsSync(config.databasePath)) {
  const keep = `${config.databasePath}.before-restore-${Date.now()}`;
  fs.copyFileSync(config.databasePath, keep);
  console.log('Current database kept as: ' + keep);
}
for (const ext of ['-wal', '-shm']) fs.rmSync(config.databasePath + ext, { force: true });
fs.copyFileSync(src, config.databasePath);
console.log('Database restored to    : ' + config.databasePath);
if (uploads) {
  if (!fs.existsSync(uploads)) fail('Uploads folder not found: ' + uploads);
  fs.mkdirSync(config.uploadDir, { recursive: true });
  fs.cpSync(uploads, config.uploadDir, { recursive: true });
  console.log('Uploads restored to     : ' + config.uploadDir);
}
console.log('Done. Start the server again.');
