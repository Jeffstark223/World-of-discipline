# World of Discipline (WOD) — Website + Admin Dashboard (CMS)

Your existing WOD website, now connected to a real database and a secure admin dashboard.

```
Existing WOD website (public/)  ──►  Node.js / Express API  ──►  SQLite database
                                              ▲
                            WOD Admin Dashboard (admin/)
```

* **Public website** – your original pages, unchanged in design. They now load their sermons, events, ministries,
  leaders, gallery, homepage text, giving details and social links from the database.
* **Admin dashboard** – `/admin/`. Each administrator has their own login. Everything they change is saved to SQLite
  and appears on the website straight away, and every important action is recorded in the activity log.
* **Database** – SQLite (one file). **No PostgreSQL.**

> ## ⚠️ Read this if you deploy to Render
> Render's normal filesystem is **wiped on every deploy and restart**. A SQLite file (and uploaded photos) stored there
> **will disappear**. To keep WOD's data you **must** attach a **Render Persistent Disk** and point
> `DATABASE_PATH` and `UPLOAD_DIR` at it. See [Deploying to Render](#deploying-to-render). The app refuses to start on
> Render if the storage is not persistent, so you can't lose data silently.

---

## 1. Required software

* **Node.js 18.17 or newer** (20 or 22 recommended) – <https://nodejs.org> (choose "LTS"). This also installs `npm`.
* A terminal (Terminal on Mac, PowerShell on Windows).

No database server, no PostgreSQL, nothing else to install.

## 2. Local setup (4 commands)

Open a terminal **inside the project folder** (the folder that contains `package.json`), then:

```bash
npm install          # downloads the libraries (once)
npm run setup        # creates the SQLite database + folders, and loads your existing website content
npm start            # starts the server
```

Then open <http://localhost:3000/admin/>. Because no administrator exists yet, you are taken to a **setup page** where you
create your own login in the browser. (Prefer the terminal? `npm run create-admin` does the same thing.)

Then open:

| What | Address |
|---|---|
| Public website | <http://localhost:3000/> |
| Admin dashboard | <http://localhost:3000/admin/> |

The setup page closes permanently as soon as one administrator exists. After that, only signed-in admins can add more.
(Optional: `cp .env.example .env` if you want to change the port or other settings.)

### What `npm run setup` does
1. Creates the folder `data/` (if missing).
2. Creates the SQLite database `data/wod.db` with all tables (if missing).
3. Copies the text that is **already on your website** into the database (homepage/About text, vision pillars,
   core values, leaders, giving details, contact info). This happens **once**; your later edits are never overwritten.
4. **Sermons, events and ministries start EMPTY** – no demo content – so the website shows friendly "nothing here yet"
   messages until administrators add real ones.
5. Nothing is invented – anything your site did not contain is left empty and can be filled in from the dashboard.

`npm start` also does all of this automatically if the database doesn't exist yet.

### Creating more administrators
* In the dashboard: **Admins → Add administrator**. Everyone has the same "Admin" access, their own email and
  password, and their actions are recorded under their name.
* Or from the terminal: `npm run create-admin` again.
* **Forgot every password?** `npm run reset-password -- --email you@example.com`
* The dashboard will not let you disable or delete the last active administrator.

## 3. Where local data lives, and backups

| Data | Location (default) | Setting |
|---|---|---|
| SQLite database | `data/wod.db` | `DATABASE_PATH` |
| Uploaded images | `data/uploads/` | `UPLOAD_DIR` |

Both folders are in `.gitignore`, so your data is never committed to GitHub.

**Back up (database + images):**
```bash
npm run backup            # writes backups/wod-backup-<date>/wod.db and /uploads   (--db-only skips images)
```
This is safe to run while the site is running. You can also click **Settings → Download database backup**
in the dashboard. Copy the `backups/` folder somewhere safe (USB drive, cloud storage).

**Restore** (stop the server first):
```bash
npm run restore -- backups/wod-backup-2026-01-01-10-00-00/wod.db backups/wod-backup-2026-01-01-10-00-00/uploads
```
The current database is kept next to it as `wod.db.before-restore-<time>` so you can undo.

---

## Deploying to Render

### Why a Persistent Disk is required
On Render, your app lives on a temporary filesystem that is thrown away whenever you deploy, restart, or Render
moves your service. SQLite is just a file, so if it sits on that temporary filesystem, **all admins, sermons, events,
messages and uploaded photos are lost.** A **Persistent Disk** is separate storage that survives deploys and restarts.

* A Persistent Disk needs a **paid** Render web service (Starter or higher) – it is not available on the free plan.
* A service with a disk runs as **one instance** (fine for WOD) and deploys have a few seconds of downtime.
* Check Render's current documentation for pricing and details: <https://render.com/docs/disks>

### Step by step
1. Put this project on **GitHub** (`.env`, `data/` and `backups/` are already ignored).
2. In Render: **New → Web Service** → connect your repository.
   * Runtime: **Node**  ·  Build command: `npm install`  ·  Start command: `npm start`
   * Instance type: **Starter** (or higher – required for a disk)
3. **Add a Disk** (Service → *Disks* → *Add Disk*):
   * **Name:** `wod-data`
   * **Mount path:** `/var/data`
   * **Size:** 1–2 GB is plenty to start (you can increase it later)
4. **Environment variables** (Service → *Environment*):

   | Key | Value | Why |
   |---|---|---|
   | `NODE_ENV` | `production` | secure cookies, production mode |
   | `DATABASE_PATH` | `/var/data/wod.db` | SQLite file **on the disk** |
   | `UPLOAD_DIR` | `/var/data/uploads` | uploaded photos **on the disk** |
   | `BACKUP_DIR` | `/var/data/backups` | where `npm run backup` writes (optional) |
   | `SETUP_TOKEN` | a long random secret | lets you create the first admin in the browser (remove afterwards) |

   (`render.yaml` in this project contains exactly this setup, if you prefer Render Blueprints.)
5. **Deploy.** Watch the logs. You should see the database and uploads paths under `/var/data`.
6. Create your first administrator. On a live site the browser setup page needs a secret code so a stranger can't claim
   the account first: add an environment variable `SETUP_TOKEN` with a long random value of your choice, redeploy, open
   `https://YOUR-SERVICE.onrender.com/admin/`, and enter that code on the setup page together with your name, email and
   password. (Alternative: open the Shell tab and run `npm run create-admin`.) Once you're in, you can delete `SETUP_TOKEN`.
   Without `SETUP_TOKEN`, browser setup is disabled on Render.
7. Open `https://YOUR-SERVICE.onrender.com/admin/`, sign in, and go to **Settings → Data and storage**.
   It must say **"Stored on a separate mounted disk"** with both paths under `/var/data`.
8. **Prove persistence before you rely on it:** add a test sermon, then in Render choose *Manual Deploy → Deploy latest
   commit* (or restart the service). After it comes back, the sermon and your login must still be there. If they
   are, the disk is working.

### How the app protects you
On Render (detected automatically) the server **refuses to start** – with a clear message in the logs – if:
* `DATABASE_PATH` or `UPLOAD_DIR` is not set, or
* either path is inside the application folder, or
* either path does not look like a separate mounted disk.

The dashboard shows a red banner on the Dashboard if storage is not persistent. The app only reports storage as
"verified" when it can see the data folder is on a different disk from the application. This is a safety check, not a
guarantee: **you still need to confirm in the Render dashboard that the disk exists and is mounted at `/var/data`.**

### What happens if you don't configure a disk
* Default: the app **won't start** on Render (you'll see "STORAGE IS NOT PERSISTENT" in the logs).
* If you set `ALLOW_EPHEMERAL_STORAGE=true` it will start anyway, but **everything you enter is deleted on the next
  deploy or restart**. Only use that for a throw-away demo. Never use it for the real WOD site.

### Backing up on Render
* **Database:** dashboard → **Settings → Download database backup** (do this regularly), or in the Render Shell:
  `npm run backup` (writes to `BACKUP_DIR` on the disk).
* **Uploaded photos:** live in `/var/data/uploads`. Copy them off the server regularly, e.g. via Render's SSH
  (`scp -r`/`rsync` from `/var/data/uploads`). `npm run backup` also copies them to `/var/data/backups/…/uploads`,
  but a backup that lives only on the same disk is not a complete safeguard – keep a copy elsewhere too.
* Render can also take **disk snapshots** (see Render's disk docs for how long they are kept and how to restore).
  Treat those as an extra safety net, not your only backup.

### Restoring on Render
1. Upload your backup `wod.db` (and `uploads/` folder) to the server (SSH/scp) into e.g. `/var/data/restore/`.
2. In the Shell: `npm run restore -- /var/data/restore/wod.db /var/data/restore/uploads`
3. Restart the service (the database is only read at startup).

### Optional: custom domain / hosting the website elsewhere
The website and the CMS are served by the same service, which is the simplest setup. If you ever host the public
pages on a *different* domain, add `<script>window.WOD_API_BASE="https://your-cms.onrender.com";</script>` before
`cms.js` and set `CORS_ORIGINS=https://your-website-domain` on the server.

---

## 4. Managing the website from the dashboard

| Dashboard section | What it controls on the website |
|---|---|
| **Homepage** | Hero (text/buttons/video/image), About text & images, mission/vision/values, vision-pillar strip, About-page core values, leadership group photo |
| **Sermons** | Homepage "Recent messages" (latest 3, featured first) and the Sermons page. Draft/publish, feature. **Upload an audio file and/or a video file** (or paste a link such as YouTube) |
| **Events** | Homepage and Events page. Dates in the future show under *Upcoming*, past dates under *Past events* automatically |
| **Ministries / Leadership** | Ministry cards and leader cards (homepage + their own pages). Reorder with the arrows; disable to hide |
| **Gallery** | A new **Gallery** page. The "Gallery" menu link appears automatically once there is at least one active photo |
| **Messages** | Contact-form submissions (unread count on the Dashboard and menu) |
| **Giving** | The whole giving section incl. bank & mobile-money details (public – check carefully) |
| **Settings** | Address, phones, email, service times, footer text, **social links**, your password, storage status, backup |
| **Admins / Activity log** | Accounts and the record of who did what |

Text tips: in headings, `*word*` becomes italic and a new line becomes a line break.

**Not managed by the dashboard (still edited in the HTML files):** the Bible-verse banners, the FAQ on the Contact
page, "Get involved" steps, leadership principles, the menu and footer link lists. Ask if you'd like any of these added.

## 5. Things you should know about your existing content

I preserved your design and content; while wiring it up I found the following. Please review:

1. **No demo sermons, events or ministries.** Your original pages contained sample sermons, events and ministries.
   They were removed from both the database setup and the page HTML, so a new administrator sees an empty site and
   adds real content. (Leaders, giving details and contact info from your site are kept, since they were not demo data
   – check them under Leadership, Giving and Settings.)
2. **Upcoming events** show only events dated today or later; past dates move to "Past events" automatically.
3. **Hero text** on the homepage was commented out in your HTML, so it starts empty (video only). Add a badge/heading/
   buttons under **Homepage → Hero** whenever you wish.
4. **Social icons:** your footer icons linked to `#`. They are now hidden until you paste real links in **Settings**.
5. **Contact form:** it used Formspree, and its JavaScript pointed at a form id that didn't exist (so it only pretended
   to send). It now saves to the CMS. **Messages no longer arrive by email** – check the dashboard inbox (email
   notifications can be added later).
6. **Phone link fix:** the second phone number displayed "+233 50 942 5180" but its tap-to-call link dialled
   "+233 24 587 6651". The link now matches the displayed number.
7. **"View All Sermons"** on the homepage linked to itself (`#sermons`); it now goes to `sermons.html`.
8. **Restored assets:** your uploaded zip had lost `logo.jpg`, `vid1.mp4` and the photos from the working folder (they
   were only in git history); I restored them from git. Your `.git` history is included – the site files now live in
   `public/`, so git will show them as moved.
9. **Large files:** `vid1.mp4` is 27 MB and several photos are 2–5 MB. Compress them (e.g. TinyPNG/Squoosh, HandBrake)
   for faster loading on phones.
10. `index.html` references `/cdn-cgi/.../email-decode.min.js` (a Cloudflare leftover). It 404s harmlessly and can be
    deleted.
11. `.DS_Store` is committed in your git repo; it is now in `.gitignore` – run `git rm --cached .DS_Store`.

## 6. Sermon audio and video files
In **Sermons → Add sermon** there are two upload buttons: **Upload video file** (MP4, WebM, MOV) and **Upload audio file**
(MP3, M4A, WAV, OGG, AAC), each with a progress bar. You can also paste a link (YouTube etc.) instead.
* Files are checked by their real contents (not the filename), stored under random names in `UPLOAD_DIR`, and
  deleted from disk automatically when the sermon is deleted or the file is replaced.
* Size limit: **200 MB** per file by default (`MAX_MEDIA_MB`). Visitors can play and skip around in the files.
* **Disk space (important on Render):** video files are big. A 1 hour sermon video can be several hundred MB, so size
  your Persistent Disk accordingly (you can grow it later in Render). For long videos it is usually better to upload
  to YouTube/Vimeo and paste the link; use the file upload for audio and shorter clips.
* Very slow connections may time out on large uploads; compress the file or use a link in that case.

## 7. Security summary
* Passwords hashed with bcrypt (cost 12); never stored or sent in plain text; password hashes are never returned by any API.
* Sessions: random token in an `HttpOnly`, `SameSite=Strict` (and `Secure` in production) cookie; only a hash of it is
  stored; sessions expire (default 12 h, `SESSION_HOURS`); disabling an admin or changing a password ends sessions.
* Login and contact form are rate-limited; the contact form also has a hidden honeypot field.
* Cross-site request blocking on all writes; strict Content-Security-Policy on `/admin` and `/api`; security headers (helmet).
* All SQL uses prepared statements; all input validated; every value is HTML-escaped when displayed; only
  `http(s)`/relative links are accepted in link fields (no `javascript:`).
* Uploads: only real JPG/PNG/GIF/WebP (checked by file signature, not filename), random filenames, size limit
  (`MAX_UPLOAD_MB`, default 8), no SVG, served with `nosniff`.
* Admin pages load no secrets; the server's own files (`.env`, `server/`, the database) are never served.

## 8. Testing
```bash
npm test      # ~190 automated end-to-end checks on a throw-away database (your data is never touched)
```
It covers login/logout/sessions, multiple admins, password change, every CMS section, uploads (incl. malicious files),
contact form → inbox, the activity log, the last-admin guard, restart persistence, backup/restore and the Render
storage guard. Run it after any change.

## 9. Troubleshooting
* **`npm install` fails on `better-sqlite3`:** use a current Node LTS (18.17+). On Render this installs automatically.
* **"Port in use":** set `PORT=3001` in `.env`.
* **Refused to start on Render / "STORAGE IS NOT PERSISTENT":** attach the disk and set `DATABASE_PATH`/`UPLOAD_DIR` (section above).
* **Locked out:** `npm run reset-password -- --email you@example.com`.
* **Website shows old text:** hard-refresh (Ctrl/Cmd + Shift + R). If the API is unreachable the pages fall back to their original built-in text.

## 10. Project layout
```
public/        your existing website (unchanged design) + cms.js (loads content from the API) + gallery.html (new)
admin/         admin dashboard (login.html, index.html, admin.css, admin.js, pages.js)
server/        Express app: config.js (paths + persistence checks), db.js (schema), seed.js, routes/, uploads.js …
scripts/       setup, create-admin, reset-password, backup, restore, smoke-test
data/          local SQLite database + uploads (created automatically, git-ignored)
render.yaml    Render Blueprint (web service + persistent disk + env vars)
.env.example   settings template
```
