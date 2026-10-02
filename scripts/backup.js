'use strict';
/**
 * npm run backup
 * Makes a consistent, timestamped copy of the SQLite database (safe while the server is running)
 * and a copy of the uploaded images.  Output folder: BACKUP_DIR (default ./backups).
 * On Render, set BACKUP_DIR to a folder on the Persistent Disk (e.g. /var/data/backups) — and still
 * download copies off the server regularly. A backup that lives only on the same disk is not a full safeguard.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { config } = require('../server/config');

(async () => {
  if (!fs.existsSync(config.databasePath)) { console.error('No database found at ' + config.databasePath); process.exit(1); }
  const dir = path.resolve(config.ROOT, process.env.BACKUP_DIR || './backups');
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const out = path.join(dir, `wod-backup-${stamp}`);
  fs.mkdirSync(out, { recursive: true });
  const src = new Database(config.databasePath, { readonly: true, fileMustExist: true });
  await src.backup(path.join(out, 'wod.db'));
  src.close();
  console.log('Database backed up  : ' + path.join(out, 'wod.db'));
  if (!process.argv.includes('--db-only') && fs.existsSync(config.uploadDir)) {
    fs.cpSync(config.uploadDir, path.join(out, 'uploads'), { recursive: true });
    console.log('Uploads backed up   : ' + path.join(out, 'uploads'));
  }
  console.log('\nKeep a copy somewhere OFF this server too (download it / copy it to cloud storage).');
})().catch((e) => { console.error(e); process.exit(1); });
