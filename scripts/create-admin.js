'use strict';
/**
 * npm run create-admin
 * Creates an administrator. Prompts for name, email and password (password is hidden while typing).
 * Non-interactive alternative:  node scripts/create-admin.js --name "Jane" --email jane@example.com --password '...'
 */
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { initialize } = require('../server/init');
const { db, close } = require('../server/db');
const { config } = require('../server/config');
const { strongPassword } = require('../server/lib');

const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : undefined; };

function ask(q, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden && process.stdin.isTTY) {
      rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); else if (/[\r\n]/.test(s)) rl.output.write('\n'); };
    }
    rl.question(q, (a) => { rl.close(); resolve(a); });
  });
}

(async () => {
  initialize({ quiet: true });
  const existing = db.prepare('SELECT COUNT(*) c FROM admins').get().c;
  console.log(existing ? `There are already ${existing} administrator(s). This will add another.\n` : 'Creating the first WOD administrator.\n');

  let name = arg('name'); let email = arg('email'); let password = arg('password');
  if (!name) name = (await ask('Full name: ')).trim();
  if (!email) email = (await ask('Email: ')).trim().toLowerCase();
  email = String(email).toLowerCase();
  if (!name || name.length > 120) fail('A name (up to 120 characters) is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
  if (db.prepare('SELECT 1 FROM admins WHERE email = ?').get(email)) fail('An administrator with that email already exists.');

  if (!password) {
    password = await ask('Password (min 10 characters, letters + numbers): ', true);
    const again = await ask('Repeat password: ', true);
    if (password !== again) fail('The passwords do not match.');
  }
  const problem = strongPassword(password, email);
  if (problem) fail(problem);

  db.prepare('INSERT INTO admins (name, email, password_hash) VALUES (?,?,?)').run(name, email, bcrypt.hashSync(password, config.bcryptRounds));
  db.prepare("INSERT INTO activity_logs (admin_name, admin_email, action, resource, details) VALUES (?,?,?,?,?)")
    .run('(command line)', '', 'Created administrator', 'admins', `${name} <${email}>`);
  console.log(`\nAdministrator created: ${name} <${email}>`);
  console.log('Start the server with "npm start", then sign in at http://localhost:' + config.port + '/admin/');
  close();
})().catch((e) => { console.error(e); process.exit(1); });

function fail(msg) { console.error('\nError: ' + msg); process.exit(1); }
