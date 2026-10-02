'use strict';
/**
 * npm test  ->  end-to-end checks against a THROW-AWAY database (never touches your real data).
 * Starts the real server on a random port, drives the real HTTP API, restarts the server to prove persistence.
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wod-test-'));
const PORT = 4100 + Math.floor(Math.random() * 500);
const env = { ...process.env, NODE_ENV: 'test', PORT: String(PORT), DATABASE_PATH: path.join(tmp, 'wod.db'), UPLOAD_DIR: path.join(tmp, 'uploads'), RENDER: '', ALLOW_EPHEMERAL_STORAGE: '' };
const base = `http://localhost:${PORT}`;
let server; let pass = 0; let fail = 0;

const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log('  \u2713 ' + name); } else { fail++; console.log('  \u2717 ' + name + (extra ? '  -> ' + extra : '')); } };
const section = (t) => console.log('\n' + t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  server = spawn('node', ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', (d) => process.stderr.write(d));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 10000);
    server.stdout.on('data', (d) => { if (String(d).includes('Admin ')) { clearTimeout(t); resolve(); } });
  });
}
const stopServer = () => new Promise((r) => { server.once('exit', r); server.kill('SIGTERM'); });

class Client {
  constructor() { this.cookie = ''; }
  async req(method, url, body, headers = {}) {
    const opt = { method, headers: { ...headers } };
    if (this.cookie) opt.headers.cookie = this.cookie;
    if (body instanceof FormData) opt.body = body;
    else if (body !== undefined) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const r = await fetch(base + url, opt);
    const sc = r.headers.get('set-cookie');
    if (sc) { const c = sc.split(';')[0]; this.cookie = c.endsWith('=') ? '' : c; }
    let json = null; try { json = await r.clone().json(); } catch { /* not json */ }
    return { status: r.status, json, res: r };
  }
  get(u) { return this.req('GET', u); }
  post(u, b, h) { return this.req('POST', u, b, h); }
  put(u, b) { return this.req('PUT', u, b); }
  del(u) { return this.req('DELETE', u); }
}

// tiny valid 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const fileForm = (name, buf, type, fields = {}, key = 'images') => { const fd = new FormData(); fd.append(key, new Blob([buf], { type }), name); Object.entries(fields).forEach(([k, v]) => fd.append(k, v)); return fd; };

(async () => {
  console.log('WOD CMS end-to-end test  (temp data: ' + tmp + ')');

  section('Setup scripts');
  let r = spawnSync('node', ['scripts/setup.js'], { cwd: ROOT, env, encoding: 'utf8' });
  ok(r.status === 0 && fs.existsSync(env.DATABASE_PATH), 'npm run setup creates the SQLite database at DATABASE_PATH');
  r = spawnSync('node', ['scripts/create-admin.js', '--name', 'Grace Admin', '--email', 'grace@wod.test', '--password', 'GracePass2026'], { cwd: ROOT, env, encoding: 'utf8' });
  ok(r.status === 0, 'npm run create-admin creates the first administrator');
  r = spawnSync('node', ['scripts/create-admin.js', '--name', 'X', '--email', 'x@wod.test', '--password', 'short'], { cwd: ROOT, env, encoding: 'utf8' });
  ok(r.status !== 0, 'create-admin rejects a weak password');

  await startServer();
  const a = new Client();

  section('Public website API (no login)');
  let x = await a.get('/api/sermons?public=1');
  ok(x.status === 200 && x.json.items.length === 0, 'NO demo sermons: the public site starts empty');
  x = await a.get('/api/events?public=1'); ok(x.json.items.length === 0, 'NO demo events');
  x = await a.get('/api/ministries?public=1'); ok(x.json.items.length === 0, 'NO demo ministries');
  x = await a.get('/api/leaders?public=1'); ok(x.json.items.length === 3, 'existing leaders are still seeded from the website');
  x = await a.get('/api/public/site');
  ok(x.status === 200 && x.json.content.about_stat_number === '6+' && x.json.core_values.length === 5 && x.json.pillars.length === 4, 'site bundle contains homepage content, pillars and core values');
  ok(x.json.giving.bank_details.length === 4 && !JSON.stringify(x.json).includes('password'), 'giving info is served; no admin data leaks');
  x = await a.get('/api/admins'); ok(x.status === 401, 'admin API requires login');
  x = await a.post('/api/sermons', { title: 'nope' }); ok(x.status === 401, 'creating a sermon without login is refused');
  x = await a.get('/api/dashboard'); ok(x.status === 401, 'dashboard API requires login');
  x = await a.get('/api/messages'); ok(x.status === 401, 'reading messages requires login');
  x = await a.get('/api/settings/backup'); ok(x.status === 401, 'database backup download requires login');
  x = await fetch(base + '/admin/'); ok(x.status === 200, 'admin dashboard page is served');
  x = await fetch(base + '/'); const html = await x.text(); ok(x.status === 200 && html.includes('cms.js') && html.includes('World of Discipline'), 'existing public homepage is served and loads cms.js');
  x = await fetch(base + '/logo.jpg'); ok(x.status === 200, 'existing assets (logo.jpg) still served');
  x = await fetch(base + '/.env'); ok(x.status === 404, 'server files such as .env are not exposed');
  x = await fetch(base + '/server/config.js'); ok(x.status === 404, 'server source is not exposed');
  x = await fetch(base + '/data/wod.db'); ok(x.status === 404, 'database file is not downloadable');

  section('Authentication');
  x = await a.post('/api/auth/login', { email: 'grace@wod.test', password: 'wrong-password' });
  ok(x.status === 401 && !a.cookie, 'wrong password is rejected, no session created');
  x = await a.post('/api/auth/login', { email: 'nobody@wod.test', password: 'GracePass2026' });
  ok(x.status === 401 && x.json.error === 'Incorrect email or password.', 'unknown email gets the same generic error');
  x = await a.post('/api/auth/login', { email: 'GRACE@wod.test', password: 'GracePass2026' });
  ok(x.status === 200 && a.cookie.startsWith('wod_sid='), 'login works (email is case-insensitive)');
  const setCookie = x.res.headers.get('set-cookie') || '';
  ok(/HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie), 'session cookie is HttpOnly + SameSite=Strict');
  x = await a.get('/api/auth/me'); ok(x.status === 200 && x.json.admin.email === 'grace@wod.test' && !JSON.stringify(x.json).includes('hash'), '/api/auth/me returns the admin, never a password hash');
  const dbRaw = spawnSync('node', ['-e', `const D=require('better-sqlite3');const d=new D(process.env.DATABASE_PATH,{readonly:true});console.log(d.prepare('select password_hash h from admins').get().h)`], { cwd: ROOT, env, encoding: 'utf8' }).stdout.trim();
  ok(/^\$2[aby]\$12\$/.test(dbRaw) && !dbRaw.includes('GracePass'), 'password stored as a bcrypt hash, not plaintext');
  x = await a.post('/api/sermons', { title: 'x', preached_on: '2026-01-01' }, { origin: 'https://evil.example' });
  ok(x.status === 403, 'cross-site write (foreign Origin header) is blocked');

  section('Sermons CMS');
  x = await a.post('/api/sermons', { title: '' }); ok(x.status === 400 && x.json.fields.title, 'validation: title required, field errors returned');
  x = await a.post('/api/sermons', { title: 'T', preached_on: '2026-13-45' }); ok(x.status === 400 && x.json.fields.preached_on, 'validation: impossible date rejected');
  x = await a.post('/api/sermons', { title: 'Bad', preached_on: '2026-05-01', video_url: 'javascript:alert(1)' }); ok(x.status === 400 && x.json.fields.video_url, 'validation: javascript: URL rejected');
  x = await a.post('/api/sermons', { title: '<script>alert(1)</script> Grace', speaker: 'Pastor T', preached_on: '2026-09-20', series: 'Grace Series', video_url: 'https://youtu.be/abc', is_featured: true, is_published: true });
  ok(x.status === 201 && x.json.is_featured === 1, 'add sermon'); const sid = x.json.id;
  x = await a.put('/api/sermons/' + sid, { speaker: 'Rev. Edited' }); ok(x.status === 200 && x.json.speaker === 'Rev. Edited' && x.json.title.includes('Grace'), 'edit sermon (partial update keeps other fields)');
  x = await a.get('/api/sermons?q=Edited'); ok(x.json.total === 1, 'search finds the sermon');
  x = await a.get('/api/sermons?featured=1'); ok(x.json.items.every((s) => s.is_featured), 'filter: featured only');
  x = await new Client().get('/api/sermons?public=1&featured_first=1&limit=3'); ok(x.json.items[0].id === sid, 'public site: featured sermon listed first');
  x = await a.put('/api/sermons/' + sid, { is_published: false }); ok(x.status === 200 && x.json.is_published === 0, 'unpublish sermon');
  x = await new Client().get('/api/sermons?public=1'); ok(!x.json.items.some((s) => s.id === sid), 'unpublished sermon disappears from the public site');
  x = await new Client().get('/api/sermons/' + sid); ok(x.status === 404, 'unpublished sermon is 404 to the public');
  x = await a.get('/api/sermons/' + sid); ok(x.status === 200, 'admin can still view the draft');
  x = await a.get('/api/sermons?status=draft'); ok(x.json.total === 1, 'filter: drafts');
  x = await a.put('/api/sermons/' + sid, { is_published: true });
  x = await new Client().get('/api/sermons?public=1'); ok(x.json.items.some((s) => s.id === sid), 'publishing shows it on the public site again');
  x = await a.del('/api/sermons/' + sid); ok(x.status === 200, 'delete sermon');
  x = await a.get('/api/sermons/' + sid); ok(x.status === 404, 'deleted sermon is gone');
  x = await a.put('/api/sermons/99999', { title: 'x' }); ok(x.status === 404, 'editing a missing sermon returns 404');
  x = await a.get("/api/sermons?q=%27%3B%20DROP%20TABLE%20sermons%3B--"); ok(x.status === 200, 'SQL-injection style search is harmless (parameterised queries)');
  x = await a.get('/api/sermons'); ok(x.json.total === 0, 'sermons table intact afterwards (empty again)');

  section('Events CMS');
  x = await a.post('/api/events', { name: 'Harvest Night', event_date: '2027-03-05', start_time: '18:00', end_time: '17:00' }); ok(x.status === 400 && x.json.fields.end_time, 'validation: end time must be after start');
  x = await a.post('/api/events', { name: 'Harvest Night', event_date: '2027-03-05', start_time: '18:00', end_time: '21:00', location: 'Main Sanctuary', category: 'Special', status: 'published' });
  ok(x.status === 201, 'add event'); const eid = x.json.id;
  x = await a.put('/api/events/' + eid, { location: 'WOD Hall' }); ok(x.json.location === 'WOD Hall', 'edit event');
  x = await new Client().get('/api/events?public=1&when=upcoming'); ok(x.json.items.some((e) => e.id === eid), 'public: shows under upcoming');
  x = await new Client().get('/api/events?public=1&when=past'); ok(x.json.items.length === 0 && !x.json.items.some((e) => e.id === eid), 'public: past list is empty (no demo events)');
  x = await a.put('/api/events/' + eid, { status: 'draft' });
  x = await new Client().get('/api/events?public=1&when=upcoming'); ok(!x.json.items.some((e) => e.id === eid), 'draft event hidden from the public');
  x = await a.get('/api/events?status=draft&q=Harvest'); ok(x.json.total === 1, 'admin search + filter on events');
  x = await a.del('/api/events/' + eid); ok(x.status === 200, 'delete event');

  section('Ministries + Leadership CMS');
  x = await a.post('/api/ministries', { name: 'Media Team', icon: '🎥', description: 'Sound and video', meeting_info: 'Saturdays 4pm' }); ok(x.status === 201 && x.json.display_order === 1, 'add ministry (auto display order)'); const mid = x.json.id;
  x = await a.put('/api/ministries/' + mid, { description: 'Sound, video and livestream' }); ok(x.json.description.includes('livestream'), 'edit ministry');
  x = await a.put('/api/ministries/' + mid, { is_active: false }); ok(x.json.is_active === 0, 'disable ministry');
  x = await new Client().get('/api/ministries?public=1'); ok(x.json.items.length === 0, 'disabled ministry hidden from public (only item)');
  const m2 = (await a.post('/api/ministries', { name: 'Ushering', description: 'Welcome team' })).json.id; const m3 = (await a.post('/api/ministries', { name: 'Choir' })).json.id;
  x = await a.get('/api/ministries'); const ids = x.json.items.map((m) => m.id);
  x = await a.post('/api/ministries/reorder', { ids: [m3, m2, mid] }); ok(x.status === 200, 'reorder ministries');
  x = await new Client().get('/api/ministries?public=1'); ok(x.json.items[0].id === m3 && x.json.items[1].id === m2, 'public order follows the new order');
  await a.del('/api/ministries/' + m2); await a.del('/api/ministries/' + m3);
  x = await a.del('/api/ministries/' + mid); ok(x.status === 200, 'delete ministry');
  x = await a.post('/api/leaders', { name: 'Pastor New', position: 'Elder', bio: 'Bio', social_links: { facebook: 'https://facebook.com/x', bogus: 'https://x.com' } });
  ok(x.status === 201 && x.json.social_links.facebook && !x.json.social_links.bogus, 'add leader (social links whitelisted)'); const lid = x.json.id;
  x = await a.post('/api/leaders', { name: 'Evil', social_links: { facebook: 'javascript:alert(1)' } }); ok(x.status === 400, 'leader social link with javascript: rejected');
  x = await a.put('/api/leaders/' + lid, { position: 'Senior Elder' }); ok(x.json.position === 'Senior Elder', 'edit leader');
  x = await new Client().get('/api/leaders?public=1'); ok(x.json.items.length === 4 && x.json.items[0].name === 'Rev. Shine Bright', 'public leaders include existing three first');
  x = await a.del('/api/leaders/' + lid); ok(x.status === 200, 'delete leader');

  section('Gallery CMS + uploads');
  x = await a.post('/api/gallery', fileForm('evil.html', Buffer.from('<script>alert(1)</script> padding padding'), 'image/jpeg', { caption: 'x' })); ok(x.status === 400, 'HTML file disguised as .jpg is rejected (magic-byte check)');
  x = await a.post('/api/gallery', fileForm('a.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'image/svg+xml')); ok(x.status === 400, 'SVG is rejected');
  x = await a.post('/api/gallery', new FormData()); ok(x.status === 400, 'upload with no file is rejected');
  x = await a.post('/api/gallery', fileForm('../../evil.png', PNG, 'image/png', { caption: 'Sunday worship', category: 'Worship' }));
  ok(x.status === 201 && /^\/uploads\/[a-f0-9]{24}\.png$/.test(x.json.items[0].image_url), 'valid PNG uploaded with a random safe filename'); const g = x.json.items[0];
  ok(fs.existsSync(path.join(env.UPLOAD_DIR, path.basename(g.image_url))), 'file is stored inside UPLOAD_DIR');
  x = await fetch(base + g.image_url); ok(x.status === 200 && x.headers.get('content-type') === 'image/png' && x.headers.get('x-content-type-options') === 'nosniff', 'uploaded image is publicly viewable with nosniff');
  x = await new Client().get('/api/public/site'); ok(x.json.has_gallery === true, 'site bundle reports the gallery has photos (menu link appears)');
  x = await a.put('/api/gallery/' + g.id, { caption: 'Edited caption', category: 'Events' }); ok(x.json.caption === 'Edited caption', 'edit caption and category');
  x = await a.get('/api/gallery?category=Events'); ok(x.json.total === 1 && x.json.categories.includes('Events'), 'filter by category');
  x = await a.put('/api/gallery/' + g.id, { is_active: false });
  x = await new Client().get('/api/gallery?public=1'); ok(x.json.total === 0, 'disabled photo hidden from the public gallery');
  x = await a.post('/api/upload', fileForm('thumb.png', PNG, 'image/png', {}, 'file')); ok(x.status === 201 && x.json.url.startsWith('/uploads/'), 'single-image upload for CMS forms works');
  x = await a.del('/api/gallery/' + g.id); ok(x.status === 200 && !fs.existsSync(path.join(env.UPLOAD_DIR, path.basename(g.image_url))), 'delete gallery image removes the file from disk');
  x = await fetch(base + '/uploads/../../package.json'); ok(x.status !== 200 || !(await x.text()).includes('wod-cms'), 'path traversal via /uploads does not expose files');


  section('Sermon audio + video file uploads');
  const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2'), Buffer.alloc(200)]);
  const M4A = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypM4A '), Buffer.alloc(200)]);
  const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.from([4, 0, 0, 0, 0, 0, 0]), Buffer.alloc(300)]);
  const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(200)]);
  const mediaPost = (q, name, buf, type) => a.post('/api/upload/media?kind=' + q, fileForm(name, buf, type, {}, 'file'));
  const sess = new Client(); x = await sess.post('/api/upload/media?kind=audio', fileForm('a.mp3', MP3, 'audio/mpeg', {}, 'file')); ok(x.status === 401, 'media upload requires login');
  await a.post('/api/auth/login', { email: 'grace@wod.test', password: 'GracePass2026' }).catch(() => {});
  x = await mediaPost('video', 'service.mp4', MP4, 'video/mp4'); ok(x.status === 201 && /^\/uploads\/[a-f0-9]{24}\.mp4$/.test(x.json.url), 'video (MP4) upload accepted, random safe name'); const vurl = x.json.url;
  x = await mediaPost('audio', 'message.mp3', MP3, 'audio/mpeg'); ok(x.status === 201 && x.json.url.endsWith('.mp3'), 'audio (MP3) upload accepted'); const aurl = x.json.url;
  x = await mediaPost('audio', 'message.m4a', M4A, 'audio/mp4'); ok(x.status === 201 && x.json.url.endsWith('.m4a'), 'audio (M4A) upload accepted');
  x = await mediaPost('video', 'clip.webm', WEBM, 'video/webm'); ok(x.status === 201 && x.json.url.endsWith('.webm'), 'video (WebM) upload accepted');
  x = await mediaPost('audio', 'song.mp4', MP4, 'video/mp4'); ok(x.status === 400, 'a video file is refused in the audio slot');
  x = await mediaPost('video', 'fake.mp4', Buffer.from('<html><script>alert(1)</script></html> padding padding'), 'video/mp4'); ok(x.status === 400, 'HTML disguised as .mp4 is refused (file contents are checked)');
  x = await mediaPost('video', 'run.exe', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]), 'application/octet-stream'); ok(x.status === 400, 'executables are refused');
  x = await mediaPost('bogus', 'a.mp3', MP3, 'audio/mpeg'); ok(x.status === 400, 'unknown kind is refused');
  ok(!fs.readdirSync(env.UPLOAD_DIR).some((f) => f.endsWith('.part')), 'rejected uploads leave no temp files behind');
  x = await fetch(base + vurl, { headers: { range: 'bytes=0-9' } }); ok(x.status === 206 && x.headers.get('content-type') === 'video/mp4', 'uploaded video is served with the right type and supports seeking (Range)');
  x = await fetch(base + aurl); ok(x.status === 200 && x.headers.get('content-type') === 'audio/mpeg' && x.headers.get('x-content-type-options') === 'nosniff', 'uploaded audio is playable and served with nosniff');
  x = await a.post('/api/sermons', { title: 'Uploaded Media Sermon', preached_on: '2026-10-02', video_url: vurl, audio_url: aurl, is_published: true }); ok(x.status === 201, 'sermon saved with uploaded audio + video files'); const msid = x.json.id;
  x = await new Client().get('/api/sermons?public=1'); ok(x.json.items.some((s) => s.id === msid && s.video_url === vurl && s.audio_url === aurl), 'public site receives the audio + video file addresses');
  x = await a.put('/api/sermons/' + msid, { audio_url: '' }); ok(!fs.existsSync(path.join(env.UPLOAD_DIR, path.basename(aurl))) && fs.existsSync(path.join(env.UPLOAD_DIR, path.basename(vurl))), 'removing the audio file from a sermon deletes it from disk (video kept)');
  x = await a.del('/api/sermons/' + msid); ok(!fs.existsSync(path.join(env.UPLOAD_DIR, path.basename(vurl))), 'deleting the sermon deletes its video file from disk');
  x = await a.post('/api/sermons', { title: 'Link only', preached_on: '2026-10-02', video_url: 'https://youtu.be/xyz' }); ok(x.status === 201, 'pasting an external link (YouTube) still works'); await a.del('/api/sermons/' + x.json.id);

  section('Homepage / Giving / Social / Settings');
  x = await a.put('/api/homepage', { content: { hero_heading: 'Word of *Discipline*', hero_btn1_text: 'Join us', hero_btn1_url: 'contact.html', about_stat_number: '7+' } }); ok(x.status === 200 && x.json.content.about_stat_number === '7+', 'update homepage content');
  x = await new Client().get('/api/public/site'); ok(x.json.content.hero_heading === 'Word of *Discipline*' && x.json.content.about_stat_number === '7+', 'public site sees the homepage change immediately');
  x = await a.put('/api/homepage', { content: { hero_btn1_url: 'javascript:alert(1)' } }); ok(x.status === 400, 'homepage button link with javascript: rejected');
  x = await a.put('/api/homepage', { content: { not_a_real_key: 'x' } }); ok(x.status === 400, 'unknown homepage keys are ignored (nothing to update)');
  x = await a.post('/api/pillars', { section: 'pillar', icon: '★', title: 'New pillar', description: 'd' }); ok(x.status === 201, 'add vision pillar'); const pid = x.json.id;
  x = await a.put('/api/pillars/' + pid, { is_active: false });
  x = await new Client().get('/api/homepage'); ok(x.json.pillars.length === 4, 'disabled pillar hidden on the site');
  x = await a.del('/api/pillars/' + pid);
  x = await a.put('/api/giving', { verse_cite: 'Test 1:1', bank_details: [{ label: 'Bank', value: 'Test Bank' }] }); ok(x.status === 200 && x.json.bank_details.length === 1, 'update giving information');
  x = await new Client().get('/api/giving'); ok(x.json.verse_cite === 'Test 1:1', 'public giving reflects the change');
  x = await a.put('/api/social', { links: [{ platform: 'facebook', url: 'https://facebook.com/wod' }, { platform: 'instagram', url: '' }, { platform: 'youtube', url: '' }, { platform: 'x', url: '' }] }); ok(x.status === 200, 'update social links');
  x = await new Client().get('/api/social'); ok(x.json.items.length === 1 && x.json.items[0].platform === 'facebook', 'public sees only social links that have a URL');
  x = await a.put('/api/social', { links: [{ platform: 'facebook', url: 'ftp://x' }] }); ok(x.status === 400, 'non-http social link rejected');
  x = await a.put('/api/settings', { phone_1: '+233 20 000 0000' }); ok(x.json.phone_1 === '+233 20 000 0000', 'update contact settings');
  x = await a.get('/api/settings/storage'); ok(x.status === 200 && x.json.status === 'local' && x.json.databasePath === env.DATABASE_PATH, 'storage status endpoint reports DB path (local mode)');
  x = await a.get('/api/settings/backup'); ok(x.status === 200 && x.res.headers.get('content-disposition').includes('wod-backup'), 'database backup download works');

  section('Contact form -> messages inbox');
  const pub = new Client();
  x = await pub.post('/api/messages', { name: '', email: 'bad', message: '' }); ok(x.status === 400 && x.json.fields.name && x.json.fields.email && x.json.fields.message, 'contact form validation errors');
  x = await pub.post('/api/messages', { name: 'John Mensah', email: 'john@example.com', phone: '+233 24 111 2222', subject: 'Prayer Request', message: 'Please pray for my family <b>thanks</b>' }); ok(x.status === 201, 'public contact submission accepted');
  x = await pub.post('/api/messages', { name: 'Bot', email: 'bot@example.com', message: 'spam', website: 'http://spam.example' }); ok(x.status === 201, 'honeypot submissions look successful to bots...');
  x = await a.get('/api/messages'); ok(x.json.total === 1 && x.json.unread === 1 && x.json.items[0].name === 'John Mensah' && x.json.items[0].is_read === 0, '...but are not saved; real message appears in the admin inbox as unread');
  const mid2 = x.json.items[0].id;
  x = await a.get('/api/dashboard'); ok(x.json.stats.unread_messages === 1, 'dashboard unread count = 1 (live from SQLite)');
  x = await a.put('/api/messages/' + mid2, { is_read: true }); ok(x.json.is_read === 1, 'mark read');
  x = await a.get('/api/messages?status=unread'); ok(x.json.total === 0, 'filter: unread is now empty');
  x = await a.put('/api/messages/' + mid2, { is_read: false }); x = await a.get('/api/messages?q=pray'); ok(x.json.total === 1 && x.json.items[0].is_read === 0, 'mark unread + search by text');
  x = await a.get('/api/dashboard'); ok(x.json.stats.unread_messages === 1, 'dashboard unread count back to 1');
  for (let i = 0; i < 5; i++) x = await pub.post('/api/messages', { name: 'Rate', email: 'r@example.com', message: 'hello ' + i });
  ok(x.status === 429, 'contact form is rate limited');
  x = await a.del('/api/messages/' + mid2); ok(x.status === 200, 'delete message');

  section('Multiple administrators');
  x = await a.post('/api/admins', { name: 'Peter Two', email: 'peter@wod.test', password: 'weak' }); ok(x.status === 400, 'new admin needs a strong password');
  x = await a.post('/api/admins', { name: 'Peter Two', email: 'peter@wod.test', password: 'PeterPass2026' }); ok(x.status === 201 && !('password_hash' in x.json), 'create second administrator (no hash in response)'); const pidAdmin = x.json.id;
  x = await a.post('/api/admins', { name: 'Dup', email: 'PETER@wod.test', password: 'PeterPass2026' }); ok(x.status === 409, 'duplicate email refused');
  x = await a.post('/api/admins', { name: 'Ruth Three', email: 'ruth@wod.test', password: 'RuthPass2026' }); ok(x.status === 201, 'create third administrator');
  const b = new Client(); x = await b.post('/api/auth/login', { email: 'peter@wod.test', password: 'PeterPass2026' }); ok(x.status === 200, 'second admin signs in with their OWN credentials');
  x = await b.get('/api/auth/me'); ok(x.json.admin.name === 'Peter Two', 'second admin session is separate');
  const c = new Client(); x = await c.post('/api/auth/login', { email: 'ruth@wod.test', password: 'RuthPass2026' }); ok(x.status === 200, 'third admin signs in');
  x = await c.post('/api/auth/login', { email: 'ruth@wod.test', password: 'PeterPass2026' }); ok(x.status === 401, "one admin's password does not work for another account");
  x = await b.post('/api/events', { name: 'Peter Event', event_date: '2027-01-01' }); ok(x.status === 201, 'second admin has the same CMS access'); await b.del('/api/events/' + x.json.id);
  x = await b.post('/api/auth/change-password', { current_password: 'WRONGwrong1', new_password: 'NewPeterPass2027' }); ok(x.status === 400, 'change password: wrong current password rejected');
  x = await b.post('/api/auth/change-password', { current_password: 'PeterPass2026', new_password: 'short' }); ok(x.status === 400, 'change password: weak new password rejected');
  x = await b.post('/api/auth/change-password', { current_password: 'PeterPass2026', new_password: 'NewPeterPass2027' }); ok(x.status === 200, 'change password works');
  x = await new Client().post('/api/auth/login', { email: 'peter@wod.test', password: 'PeterPass2026' }); ok(x.status === 401, 'old password no longer works');
  x = await new Client().post('/api/auth/login', { email: 'peter@wod.test', password: 'NewPeterPass2027' }); ok(x.status === 200, 'new password works');
  x = await a.put('/api/admins/' + pidAdmin, { is_active: false }); ok(x.status === 200 && x.json.is_active === 0, 'disable administrator');
  x = await b.get('/api/auth/me'); ok(x.status === 401, 'disabled admin is signed out immediately');
  x = await new Client().post('/api/auth/login', { email: 'peter@wod.test', password: 'NewPeterPass2027' }); ok(x.status === 403, 'disabled admin cannot sign in');
  x = await a.put('/api/admins/' + pidAdmin, { is_active: true }); ok(x.json.is_active === 1, 're-enable administrator');
  x = await a.get('/api/admins'); ok(x.json.items.length === 3 && x.json.items.every((u) => !('password_hash' in u)), 'admin list never includes password hashes');

  section('Last-administrator protection');
  const adminsList = (await a.get('/api/admins')).json.items;
  const ruth = adminsList.find((u) => u.email === 'ruth@wod.test'); const grace = adminsList.find((u) => u.email === 'grace@wod.test');
  x = await a.del('/api/admins/' + ruth.id); ok(x.status === 200, 'delete administrator');
  x = await a.put('/api/admins/' + pidAdmin, { is_active: false });
  x = await a.put('/api/admins/' + grace.id, { is_active: false }); ok(x.status === 400, 'cannot disable the final active administrator');
  x = await a.del('/api/admins/' + grace.id); ok(x.status === 400, 'cannot delete the final active administrator');
  await a.put('/api/admins/' + pidAdmin, { is_active: true });

  section('Activity log');
  x = await a.get('/api/activity?limit=100'); const acts = x.json.items.map((i) => i.action);
  for (const want of ['Signed in', 'Added sermon', 'Edited sermon', 'Deleted sermon', 'Added event', 'Edited event', 'Deleted event', 'Added ministry', 'Edited ministry', 'Added leader', 'Edited leader', 'Uploaded gallery image', 'Deleted gallery image', 'Updated homepage', 'Updated giving', 'Created administrator', 'Disabled administrator', 'Deleted administrator', 'Failed sign-in attempt']) {
    ok(acts.includes(want), `logged: ${want}`);
  }
  const one = x.json.items.find((i) => i.action === 'Added sermon'); ok(one.admin_name === 'Grace Admin' && one.admin_email === 'grace@wod.test' && one.created_at, 'entries record administrator, email, resource and time');
  const peterAct = (await a.get('/api/activity?q=peter@wod.test&limit=100')).json.items.find((i) => i.action === 'Added event'); ok(peterAct && peterAct.admin_name === 'Peter Two', 'actions by the second admin are attributed to them');
  x = await a.get('/api/activity?q=Ruth'); ok(x.json.items.some((i) => i.action === 'Deleted administrator'), 'history survives deletion of an administrator');

  await a.post('/api/sermons', { title: 'Persisted Sermon', preached_on: '2026-10-01', is_published: true });
  section('Logout + session protection');
  x = await a.post('/api/auth/logout'); ok(x.status === 200, 'logout');
  x = await a.get('/api/auth/me'); ok(x.status === 401, 'session is dead after logout');
  x = await a.get('/api/admins'); ok(x.status === 401, 'admin API refused after logout');

  section('Login rate limiting');
  const rl = new Client(); let last;
  for (let i = 0; i < 12; i++) last = await rl.post('/api/auth/login', { email: 'grace@wod.test', password: 'bad-guess-' + i });
  ok(last.status === 429, 'repeated failed logins are rate limited');

  section('Persistence across a server restart');
  await stopServer(); await startServer();
  const a2 = new Client(); x = await a2.post('/api/auth/login', { email: 'grace@wod.test', password: 'GracePass2026' });
  ok(x.status === 429 || x.status === 200, 'server restarted');
  x = await new Client().get('/api/public/site'); ok(x.json.content.about_stat_number === '7+' && x.json.giving.verse_cite === 'Test 1:1', 'homepage + giving edits survived the restart');
  x = await new Client().get('/api/sermons?public=1'); ok(x.json.total === 1 && x.json.items[0].title === 'Persisted Sermon', 'sermons survived the restart (and no demo sermons were re-added)');
  x = await new Client().post('/api/auth/login', { email: 'peter@wod.test', password: 'NewPeterPass2027' }); ok(x.status === 200, 'administrator accounts + changed passwords survived the restart');
  await stopServer();

  section('Render persistence guard');
  const spawnGuard = (extra) => spawnSync('node', ['-e', "require('./server/init').initialize({quiet:true});console.log('STARTED')"], { cwd: ROOT, env: { ...env, ...extra }, encoding: 'utf8' });
  r = spawnGuard({ RENDER: 'true' });
  ok(r.status === 1 && /NOT PERSISTENT/.test(r.stderr) && !/STARTED/.test(r.stdout), 'on Render with no DATABASE_PATH/UPLOAD_DIR the app refuses to start');
  r = spawnGuard({ RENDER: 'true', DATABASE_PATH: path.join(ROOT, 'data', 'x.db'), UPLOAD_DIR: path.join(ROOT, 'data', 'up') });
  ok(r.status === 1 && /inside the application folder/.test(r.stderr), 'on Render a DB path inside the app folder is refused');
  r = spawnGuard({ RENDER: 'true', ALLOW_EPHEMERAL_STORAGE: 'true', DATABASE_PATH: path.join(tmp, 'eph.db'), UPLOAD_DIR: path.join(tmp, 'eph-up') });
  ok(r.status === 0 && /STARTED/.test(r.stdout), 'ALLOW_EPHEMERAL_STORAGE=true lets a throw-away demo start (with a loud warning)');
  ok(/DATA WILL BE LOST/i.test(r.stderr), '...and prints the data-loss warning');
  r = spawnGuard({ RENDER: 'true', DATABASE_PATH: path.join(tmp, 'ok.db'), UPLOAD_DIR: path.join(tmp, 'ok-up') });
  const sameDevice = fs.statSync(tmp).dev === fs.statSync(ROOT).dev;
  ok(sameDevice ? r.status === 1 : r.status === 0, `a path on ${sameDevice ? 'the SAME disk as the app is refused (this sandbox has no separate mount)' : 'a separate mounted volume is accepted'}`);


  section('First-run browser setup');
  const runSetupServer = async (extraEnv, port, fn) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wod-setup-'));
    const e = { ...env, ...extraEnv, PORT: String(port), DATABASE_PATH: path.join(d, 'wod.db'), UPLOAD_DIR: path.join(d, 'up') };
    const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: e, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((res) => srv.stdout.on('data', (b) => { if (String(b).includes('Admin ')) res(); }));
    const call = async (m, u, body) => { const r = await fetch(`http://localhost:${port}${u}`, { method: m, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})), sc: r.headers.get('set-cookie') }; };
    try { await fn(call); } finally { srv.kill(); fs.rmSync(d, { recursive: true, force: true }); }
  };
  await runSetupServer({ NODE_ENV: 'test' }, PORT + 501, async (call) => {
    let y = await call('GET', '/api/auth/setup-status'); ok(y.json.needed && y.json.enabled && !y.json.tokenRequired, 'local: setup is offered when no administrator exists');
    y = await call('POST', '/api/auth/setup', { name: 'First', email: 'first@wod.test', password: 'weak' }); ok(y.status === 400, 'setup rejects a weak password');
    y = await call('POST', '/api/auth/setup', { name: 'First Admin', email: 'first@wod.test', password: 'FirstPass2026' }); ok(y.status === 201 && /wod_sid=/.test(y.sc), 'setup creates the first administrator and signs them in');
    y = await call('GET', '/api/auth/setup-status'); ok(!y.json.needed, 'setup is closed once an administrator exists');
    y = await call('POST', '/api/auth/setup', { name: 'Intruder', email: 'evil@wod.test', password: 'EvilPass2026' }); ok(y.status === 403, 'a second setup attempt is refused (cannot add admins this way)');
    y = await call('POST', '/api/auth/login', { email: 'first@wod.test', password: 'FirstPass2026' }); ok(y.status === 200, 'the setup account can sign in normally');
  });
  await runSetupServer({ NODE_ENV: 'production' }, PORT + 502, async (call) => {
    let y = await call('GET', '/api/auth/setup-status'); ok(y.json.needed && !y.json.enabled && y.json.tokenRequired, 'production without SETUP_TOKEN: browser setup is disabled');
    y = await call('POST', '/api/auth/setup', { name: 'Hacker', email: 'h@wod.test', password: 'HackPass2026' }); ok(y.status === 403, '...and refuses to create an administrator');
  });
  await runSetupServer({ NODE_ENV: 'production', SETUP_TOKEN: 'correct-horse-battery' }, PORT + 503, async (call) => {
    let y = await call('POST', '/api/auth/setup', { name: 'Hacker', email: 'h@wod.test', password: 'HackPass2026', token: 'guess' }); ok(y.status === 403 && y.json.fields.token, 'production with SETUP_TOKEN: wrong code refused');
    y = await call('POST', '/api/auth/setup', { name: 'Hacker', email: 'h@wod.test', password: 'HackPass2026' }); ok(y.status === 403, 'production: missing code refused');
    y = await call('POST', '/api/auth/setup', { name: 'Owner', email: 'owner@wod.test', password: 'OwnerPass2026', token: 'correct-horse-battery' }); ok(y.status === 201, 'production: correct setup code creates the first administrator');
  });

  section('Backup + restore scripts');
  r = spawnSync('node', ['scripts/backup.js'], { cwd: ROOT, env: { ...env, BACKUP_DIR: path.join(tmp, 'bk') }, encoding: 'utf8' });
  const bkDir = fs.existsSync(path.join(tmp, 'bk')) ? fs.readdirSync(path.join(tmp, 'bk'))[0] : null;
  ok(r.status === 0 && bkDir && fs.existsSync(path.join(tmp, 'bk', bkDir, 'wod.db')), 'npm run backup writes a database copy');
  r = spawnSync('node', ['scripts/restore.js', path.join(tmp, 'bk', bkDir, 'wod.db')], { cwd: ROOT, env, encoding: 'utf8' });
  ok(r.status === 0 && /Database restored/.test(r.stdout), 'npm run restore restores it (keeping the previous DB)');
  fs.writeFileSync(path.join(tmp, 'notdb.db'), 'garbage');
  r = spawnSync('node', ['scripts/restore.js', path.join(tmp, 'notdb.db')], { cwd: ROOT, env, encoding: 'utf8' });
  ok(r.status !== 0, 'restore refuses a file that is not a WOD database');

  console.log(`\n${fail ? 'FAILED' : 'ALL PASSED'}: ${pass} passed, ${fail} failed`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('\nTest crashed:', e); try { server && server.kill(); } catch {} process.exit(1); });
