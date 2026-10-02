'use strict';
// npm run setup  ->  checks storage, creates the data folders + SQLite database + tables, seeds first-run content.
const { initialize } = require('../server/init');
const { db } = require('../server/db');

console.log('WOD CMS setup\n');
const { storage } = initialize();
const admins = db.prepare('SELECT COUNT(*) c FROM admins').get().c;
console.log(`Admins   : ${admins}`);
console.log('\nSetup complete.');
if (storage.status === 'local') console.log('Note: this is LOCAL storage. For Render, set DATABASE_PATH and UPLOAD_DIR on a Persistent Disk (see README).');
if (!admins) console.log('Next step: npm run create-admin');
require('../server/db').close();
