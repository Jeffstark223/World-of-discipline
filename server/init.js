'use strict';
const fs = require('fs');
const { config, assertStorageSafe } = require('./config');
const database = require('./db');
const { seed } = require('./seed');

/** Verifies storage, creates folders + database + tables if missing, seeds first-run content. */
function initialize({ quiet = false } = {}) {
  const storage = assertStorageSafe(); // exits the process on Render if storage is not persistent (unless acknowledged)
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const existed = fs.existsSync(config.databasePath);
  database.open();
  const seeded = seed();
  if (!quiet) {
    console.log(`Database : ${config.databasePath} ${existed ? '(existing)' : '(created)'}`);
    console.log(`Uploads  : ${config.uploadDir}`);
    if (seeded) console.log('Seeded   : initial content copied from the existing WOD website');
    if (storage.status === 'local') console.log('Storage  : local development (data/ folder). Not intended for Render — see README.');
    if (storage.status === 'verified') console.log('Storage  : configured on a separate mounted volume (confirm it is your Render Persistent Disk).');
    if (storage.status === 'not_persistent') console.warn('Storage  : NOT PERSISTENT — data will be lost on redeploy/restart (ALLOW_EPHEMERAL_STORAGE is set).');
  }
  return { storage, seeded, existed };
}

module.exports = { initialize };
