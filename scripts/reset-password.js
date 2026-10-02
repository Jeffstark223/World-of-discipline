'use strict';
// npm run reset-password -- --email someone@example.com   (recovery if every admin is locked out)
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { initialize } = require('../server/init');
const { db, close } = require('../server/db');
const { config } = require('../server/config');
const { strongPassword } = require('../server/lib');

const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : undefined; };
const ask = (q, hidden) => new Promise((res) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden && process.stdin.isTTY) rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); else if (/[\r\n]/.test(s)) rl.output.write('\n'); };
  rl.question(q, (a) => { rl.close(); res(a); });
});
const fail = (m) => { console.error('Error: ' + m); process.exit(1); };

(async () => {
  initialize({ quiet: true });
  const email = String(arg('email') || (await ask('Email of the administrator: '))).trim().toLowerCase();
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!admin) fail('No administrator with that email.');
  const pw = arg('password') || (await ask('New password: ', true));
  const problem = strongPassword(pw, email);
  if (problem) fail(problem);
  db.prepare("UPDATE admins SET password_hash = ?, is_active = 1, updated_at = datetime('now') WHERE id = ?").run(bcrypt.hashSync(pw, config.bcryptRounds), admin.id);
  db.prepare('DELETE FROM sessions WHERE admin_id = ?').run(admin.id);
  db.prepare('INSERT INTO activity_logs (admin_name, action, resource, details) VALUES (?,?,?,?)').run('(command line)', 'Reset administrator password', 'admins', email);
  console.log('Password updated and account enabled for ' + email);
  close();
})();
