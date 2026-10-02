'use strict';
const express = require('express');
const { db } = require('../db');
const { validate, HttpError, cleanStr } = require('../lib');
const { requireAuth, logActivity } = require('../middleware');
const { inspectStorage } = require('../config');

const router = express.Router();

/* ---------- helpers for key/value tables (homepage_content, giving_settings, site_settings) ---------- */
const readKV = (table) => Object.fromEntries(db.prepare(`SELECT key, value FROM ${table}`).all().map((r) => [r.key, r.value]));
function writeKV(table, values, adminId) {
  const st = db.prepare(`INSERT INTO ${table} (key, value, updated_by, updated_at) VALUES (?,?,?,datetime('now'))
                         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`);
  db.transaction(() => Object.entries(values).forEach(([k, v]) => st.run(k, v, adminId)))();
}
const parseList = (s) => { try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; } };

/* ---------- specs ---------- */
const homepageSpec = {
  hero_badge: { type: 'text', max: 200 }, hero_heading: { type: 'text', max: 200 },
  hero_description: { type: 'long', max: 1000 },
  hero_btn1_text: { type: 'text', max: 60 }, hero_btn1_url: { type: 'link' },
  hero_btn2_text: { type: 'text', max: 60 }, hero_btn2_url: { type: 'link' },
  hero_video_url: { type: 'url' }, hero_image_url: { type: 'url' },
  about_label: { type: 'text', max: 100 }, about_heading: { type: 'text', max: 200 },
  about_description: { type: 'long', max: 2000 }, about_image: { type: 'url' },
  about_stat_number: { type: 'text', max: 20 }, about_stat_label: { type: 'text', max: 80 },
  mission_text: { type: 'long', max: 2000 }, vision_text: { type: 'long', max: 2000 }, values_text: { type: 'long', max: 2000 },
  about_hero_image: { type: 'url' }, about_hero_description: { type: 'long', max: 1000 },
  about_page_description: { type: 'long', max: 2000 },
  mission_card_text: { type: 'long', max: 2000 }, vision_card_text: { type: 'long', max: 2000 },
  journey_heading: { type: 'text', max: 200 }, journey_text: { type: 'long', max: 2000 },
  leadership_group_image: { type: 'url' },
};
const settingsSpec = {
  church_name: { type: 'text', max: 120 }, footer_tagline: { type: 'long', max: 300 },
  address: { type: 'long', max: 300 }, phone_1: { type: 'text', max: 40 }, phone_2: { type: 'text', max: 40 },
  email: { type: 'email' }, service_times: { type: 'long', max: 500 },
};
const givingSpec = {
  giving_label: { type: 'text', max: 100 }, giving_heading: { type: 'text', max: 200 }, giving_intro: { type: 'long', max: 1000 },
  bank_title: { type: 'text', max: 100 }, momo_title: { type: 'text', max: 100 },
  verse_text: { type: 'long', max: 500 }, verse_cite: { type: 'text', max: 100 },
};

function cleanList(input, fields, name, maxItems = 12) {
  if (!Array.isArray(input)) throw new HttpError(400, `${name} must be a list.`);
  if (input.length > maxItems) throw new HttpError(400, `${name} can have at most ${maxItems} entries.`);
  return input.map((row, i) => {
    const out = {};
    for (const [f, max] of Object.entries(fields)) {
      try { out[f] = cleanStr(row && row[f], max); } catch { throw new HttpError(400, `${name} #${i + 1}: ${f} is not valid.`); }
    }
    return out;
  }).filter((r) => Object.values(r).some(Boolean));
}

/* ---------- public payload builders ---------- */
function givingPublic() {
  const g = readKV('giving_settings');
  return {
    ...g,
    giving_cards: parseList(g.giving_cards),
    bank_details: parseList(g.bank_details),
    momo_details: parseList(g.momo_details),
  };
}
function socialPublic(admin) {
  const rows = db.prepare('SELECT platform, url, is_active FROM social_links ORDER BY id').all();
  return admin ? rows : rows.filter((r) => r.is_active && r.url);
}
const pillarRows = (section) => db.prepare('SELECT id, icon, title, description FROM vision_pillars WHERE section = ? AND is_active = 1 ORDER BY display_order, id').all(section);

/** One request gives every public page the site-wide content it needs. */
router.get('/public/site', (req, res) => {
  res.json({
    content: readKV('homepage_content'),
    pillars: pillarRows('pillar'),
    core_values: pillarRows('core_value'),
    giving: givingPublic(),
    social: socialPublic(false),
    settings: readKV('site_settings'),
    has_gallery: db.prepare('SELECT COUNT(*) c FROM gallery WHERE is_active = 1').get().c > 0,
  });
});

/* ---------- homepage ---------- */
router.get('/homepage', (req, res) => {
  res.json({ content: readKV('homepage_content'), pillars: pillarRows('pillar'), core_values: pillarRows('core_value') });
});
router.put('/homepage', requireAuth, (req, res) => {
  const v = validate(homepageSpec, req.body && req.body.content, { partial: true });
  if (!Object.keys(v).length) throw new HttpError(400, 'Nothing to update.');
  writeKV('homepage_content', v, req.admin.id);
  logActivity(req, 'Updated homepage', 'homepage', '', Object.keys(v).length + ' field(s)');
  res.json({ content: readKV('homepage_content') });
});

/* ---------- giving ---------- */
router.get('/giving', (req, res) => res.json(givingPublic()));
router.put('/giving', requireAuth, (req, res) => {
  const body = req.body || {};
  const v = validate(givingSpec, body, { partial: true });
  if ('giving_cards' in body) v.giving_cards = JSON.stringify(cleanList(body.giving_cards, { icon: 16, name: 120, description: 600, button: 60 }, 'Giving options'));
  if ('bank_details' in body) v.bank_details = JSON.stringify(cleanList(body.bank_details, { label: 80, value: 200 }, 'Bank details'));
  if ('momo_details' in body) v.momo_details = JSON.stringify(cleanList(body.momo_details, { label: 80, value: 200 }, 'Mobile money details'));
  if (!Object.keys(v).length) throw new HttpError(400, 'Nothing to update.');
  writeKV('giving_settings', v, req.admin.id);
  logActivity(req, 'Updated giving', 'giving', '', 'Giving information');
  res.json(givingPublic());
});

/* ---------- social links ---------- */
router.get('/social', (req, res) => res.json({ items: socialPublic(!!req.admin && req.query.public !== '1') }));
router.put('/social', requireAuth, (req, res) => {
  const links = req.body && req.body.links;
  if (!Array.isArray(links)) throw new HttpError(400, 'Nothing to update.');
  const st = db.prepare("UPDATE social_links SET url = ?, is_active = ?, updated_at = datetime('now') WHERE platform = ?");
  const errors = {};
  const clean = links.map((l) => {
    try {
      const one = validate({ platform: { type: 'enum', values: ['facebook', 'instagram', 'youtube', 'x'], required: true }, url: { type: 'url' }, is_active: { type: 'bool', default: 1 } }, l);
      if (one.url && !/^https?:\/\//i.test(one.url)) throw new HttpError(400, 'x', { url: 'Social links must start with http:// or https://' });
      return one;
    } catch (e) { errors[(l && l.platform) || 'unknown'] = e.fields ? Object.values(e.fields)[0] : 'Invalid link'; return null; }
  });
  if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields.', errors);
  db.transaction(() => clean.forEach((c) => st.run(c.url, c.is_active, c.platform)))();
  logActivity(req, 'Updated social links', 'social', '', clean.filter((c) => c.url).map((c) => c.platform).join(', ') || 'none set');
  res.json({ items: socialPublic(true) });
});

/* ---------- site settings ---------- */
router.get('/settings', (req, res) => res.json(readKV('site_settings')));
router.put('/settings', requireAuth, (req, res) => {
  const v = validate(settingsSpec, req.body, { partial: true });
  if (!Object.keys(v).length) throw new HttpError(400, 'Nothing to update.');
  writeKV('site_settings', v, req.admin.id);
  logActivity(req, 'Updated site settings', 'settings', '', Object.keys(v).join(', '));
  res.json(readKV('site_settings'));
});

/* ---------- storage status (admin only) ---------- */
router.get('/settings/storage', requireAuth, (req, res) => res.json(inspectStorage()));

module.exports = router;
