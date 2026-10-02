'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { config } = require('./config');

let db;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,               -- SHA-256 of the cookie token (raw token is never stored)
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_admin ON sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS sermons (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  speaker       TEXT NOT NULL DEFAULT '',
  preached_on   TEXT NOT NULL,               -- YYYY-MM-DD
  duration      TEXT NOT NULL DEFAULT '',    -- free text, e.g. "48 min"
  description   TEXT NOT NULL DEFAULT '',
  series        TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL DEFAULT '',
  video_url     TEXT NOT NULL DEFAULT '',
  audio_url     TEXT NOT NULL DEFAULT '',
  is_featured   INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0,1)),
  is_published  INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0,1)),
  created_by    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sermons_date ON sermons(preached_on DESC);
CREATE INDEX IF NOT EXISTS idx_sermons_pub ON sermons(is_published, is_featured);

CREATE TABLE IF NOT EXISTS events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  event_date       TEXT NOT NULL,            -- YYYY-MM-DD
  start_time       TEXT NOT NULL DEFAULT '', -- HH:MM (optional)
  end_time         TEXT NOT NULL DEFAULT '', -- HH:MM (optional)
  extra_info       TEXT NOT NULL DEFAULT '', -- free text shown after the location, e.g. "After 9:30 AM Service"
  location         TEXT NOT NULL DEFAULT '',
  category         TEXT NOT NULL DEFAULT '', -- badge text, e.g. Youth, Outreach
  image_url        TEXT NOT NULL DEFAULT '',
  registration_url TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','cancelled')),
  created_by       INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

CREATE TABLE IF NOT EXISTS ministries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  icon          TEXT NOT NULL DEFAULT '',    -- emoji shown on the website card
  image_url     TEXT NOT NULL DEFAULT '',
  leader_name   TEXT NOT NULL DEFAULT '',
  meeting_info  TEXT NOT NULL DEFAULT '',
  contact_info  TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ministries_order ON ministries(display_order);

CREATE TABLE IF NOT EXISTS leaders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  position      TEXT NOT NULL DEFAULT '',
  bio           TEXT NOT NULL DEFAULT '',
  image_url     TEXT NOT NULL DEFAULT '',
  social_links  TEXT NOT NULL DEFAULT '{}',  -- JSON object: {facebook, instagram, x, youtube, website}
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leaders_order ON leaders(display_order);

CREATE TABLE IF NOT EXISTS gallery (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  caption       TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT '',
  image_url     TEXT NOT NULL,
  file_name     TEXT NOT NULL DEFAULT '',
  mime_type     TEXT NOT NULL DEFAULT '',
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  uploaded_by   INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gallery_order ON gallery(display_order, id DESC);

CREATE TABLE IF NOT EXISTS contact_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT NOT NULL DEFAULT '',
  subject    TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL,
  is_read    INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_read ON contact_messages(is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS homepage_content (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- section = 'pillar' (homepage vision strip) or 'core_value' (About page core values)
CREATE TABLE IF NOT EXISTS vision_pillars (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  section       TEXT NOT NULL DEFAULT 'pillar' CHECK (section IN ('pillar','core_value')),
  icon          TEXT NOT NULL DEFAULT '',
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pillars_order ON vision_pillars(section, display_order);

CREATE TABLE IF NOT EXISTS giving_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',       -- plain text, or JSON for list values
  updated_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS social_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  platform   TEXT NOT NULL UNIQUE CHECK (platform IN ('facebook','instagram','youtube','x')),
  url        TEXT NOT NULL DEFAULT '',
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- admin_name / admin_email are snapshots so history survives even if an admin is deleted
CREATE TABLE IF NOT EXISTS activity_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  admin_name  TEXT NOT NULL DEFAULT '',
  admin_email TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL DEFAULT '',
  resource_id TEXT NOT NULL DEFAULT '',
  details     TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_admin ON activity_logs(admin_id);
`;

function open() {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  db = new Database(config.databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  return db;
}

function close() { if (db) { db.close(); db = null; } }

// Lazy proxy: requiring this module never touches the disk. The database file is only opened/created
// after initialize() has verified that the storage location is safe (see server/init.js).
const dbProxy = new Proxy({}, {
  get(_, prop) { const d = open(); const v = d[prop]; return typeof v === 'function' ? v.bind(d) : v; },
});

module.exports = { open, close, db: dbProxy };
