'use strict';
/**
 * Initial CMS data. Copied from the existing WOD website (public/*.html): homepage/about text, vision pillars,
 * core values, leaders, giving details and contact info. NO sermons, events or ministries are seeded. Nothing is invented; where the site has no information the
 * field is left empty and can be filled in from the dashboard.
 *
 * Seeding runs once (tracked in meta.seeded_v1) so admin edits are never overwritten.
 */
const { db } = require('./db');

const homepage = {
  // Hero: the existing site has the hero text commented out, so it starts empty (video only).
  hero_badge: '', hero_heading: '', hero_description: '',
  hero_btn1_text: '', hero_btn1_url: '', hero_btn2_text: '', hero_btn2_url: '',
  hero_video_url: 'vid1.mp4', hero_image_url: '',
  // About (homepage)
  about_label: 'Who We Are',
  about_heading: 'Built on the *Word*,\nmoved by the Spirit',
  about_description: 'World of Discipline (WOD) is a Spirit-filled church community committed to raising believers who honour God through intentional living, disciplined devotion, and authentic worship. We believe the local church is God\'s primary instrument for transformation in every generation.',
  about_image: 'image1.jpg',
  about_stat_number: '6+', about_stat_label: 'Years of Ministry',
  mission_text: 'Our mission is to guide the world toward maturity in Christ through unity and cooperation, fostering spiritual growth and conformity to His character.',
  vision_text: 'Our vision is for believers to reach full spiritual maturity, embodying the complete character and fullness of Christ.',
  values_text: 'Our commission\u2019s values are to hide the mystery of Christ, amplify His presence, sense His transforming power over politics and economies, witness His deliverance of creation from corruption into liberty, and acknowledge His redemptive work affecting all creatures.',
  // About page
  about_hero_image: 'image2.jpg',
  about_hero_description: 'A Spirit-filled church committed to raising disciplined, devoted followers of Jesus Christ who live out the Word daily.',
  about_page_description: 'World of Discipline (WOD) is a vibrant, Spirit-filled church community in Accra, Ghana. We are passionate about biblical truth, disciplined Christian living, and authentic worship. Our desire is to see believers grow into mature disciples who impact their families, workplaces, and society for the glory of God.',
  mission_card_text: 'Our mission focuses on maturing the world into a perfect man. This maturation happens in synchronized movement, emphasizing unity and cooperation. The goal is for individuals to measure up to the full and complete standard of Christ, implying spiritual growth, maturity, and conformity to Christ\u2019s character.',
  vision_card_text: 'Our vision is to see a perfect man measured up to the full and complete standard of Christ. This suggests an end-goal of spiritual maturity where believers fully embody the qualities and fullness of Christ.',
  journey_heading: 'From Humble Beginnings to a Growing Family',
  journey_text: 'Founded in 2020, World of Discipline started as a small home fellowship with a burning desire to see lives transformed through the teaching of God\u2019s Word and the power of the Holy Spirit. Today, we are a thriving church community with vibrant ministries, passionate worship, and a heart for outreach.',
  // Leadership page group photo
  leadership_group_image: 'leadership.jpg',
};

const pillars = [
  ['pillar', '\u2726', 'Herald the Word', 'We proclaim the fullness of Christ in every season and generation.'],
  ['pillar', '\u25CE', 'Disciplined Living', 'We emphasise purposeful, Christ-centred discipline in everyday life.'],
  ['pillar', '\u25C8', 'Dynamic Worship', 'Spirit-led, passionate worship in every gathering we hold.'],
  ['pillar', '\u2B21', 'Contagious Faith', 'Believers whose lives testify of God\'s transforming power daily.'],
  ['core_value', '', 'Integrity', 'We do what is right before God and man, in public and in private, without compromise.'],
  ['core_value', '', 'Excellence', 'We give our best in everything \u2014 worship, service, work, and relationships \u2014 for God\'s glory.'],
  ['core_value', '', 'Community', 'We are stronger together. We bear one another\'s burdens and celebrate each other\'s victories.'],
  ['core_value', '', 'Discipleship', 'We are committed to spiritual growth \u2014 making disciples who make disciples, generation after generation.'],
  ['core_value', '', 'Faith', 'We trust God completely, take Him at His Word, and step out boldly on His promises.'],
];

// Sermons, events and ministries are intentionally NOT seeded: the website starts with none of them,
// so administrators add real ones from the dashboard instead of deleting demo content.

// From leadership.html
const leaders = [
  ['Rev. Shine Bright', 'President', 'Shine Bright.jpg',
    'An energetic Apostle of the Lord Jesus Christ with more than ten years of ministry experience. His message centers of fatherhood, sonship, immortality, discipleship, church structures, dispensations, grace etc. He currently holds a degree in chemical engineering, a Bachelor of Theology, and is presently pursuing Masters in Theology.'],
  ['Pastor Godson', 'Vice President', 'Godson.jpg',
    'Pastor Godson serves as Vice President and is a senior presbyter within the commission, bringing nearly ten years of ministry experience. He comes from a Human Resources Management background and holds a certificate in Prophetic and Supernatural studies, along with a Bachelor of Theology and a Master of Theology. He is currently pursuing a Doctor of Philosophy in Theological Studies.'],
  ['Pastor Godswill', 'Mission Director', 'Godswill.jpg',
    'He is the National and Regional Missions Director of the commission. The convenor of Friday Sunsum teaching and prayer experience and the head of WOD Secretariat group and head of Donation and Outreach groups.'],
];

// From index.html (giving section). Bank / mobile-money details are exactly as printed on the current site.
const giving = {
  giving_label: 'Support the Vision',
  giving_heading: 'Give to *God\'s Work*',
  giving_intro: 'Your generosity fuels the mission \u2014 from Sunday worship to outreach in the streets of Accra and beyond. Every seed sown here is an act of worship and faith.',
  giving_cards: JSON.stringify([
    { icon: '\uD83D\uDE4F', name: 'Tithes & Offerings', description: 'Honour God with the firstfruits of your increase. Your tithe sustains the local church and enables us to serve our community faithfully every week.', button: 'Give Now' },
    { icon: '\uD83C\uDF0D', name: 'Missions & Outreach', description: 'Partner with us to extend the Gospel beyond our walls \u2014 feeding families, equipping communities, and reaching the unreached across Ghana and Africa.', button: 'Support Missions' },
    { icon: '\uD83D\uDCDA', name: 'Lift A Learner', description: 'Invest in the next generation. Your gift provides school supplies, uniforms, and essentials to children in underserved communities across the Volta Region.', button: 'Sponsor a Child' },
    { icon: '\uD83C\uDFDB\uFE0F', name: 'Building Fund', description: 'Help us build a home worthy of God\'s presence. Contribute to the WOD sanctuary expansion and create a lasting space for generations of worship to come.', button: 'Build With Us' },
  ]),
  bank_title: 'GHS Account',
  bank_details: JSON.stringify([
    { label: 'Bank', value: 'OmniBsic Bank' },
    { label: 'Account Name', value: 'Ebenezer Kisseih Appiah' },
    { label: 'Account Number', value: '0010246960014' },
    { label: 'Branch', value: 'Odorkor Branch, Accra' },
  ]),
  momo_title: 'Mobile Money',
  momo_details: JSON.stringify([
    { label: 'MTN MoMo', value: '+233 59 965 5861 - Ebenezer Kisseih Appiah' },
    { label: 'GhanaPay', value: '+233 59 965 5861 - Ebenezer Kisseih Appiah' },
    { label: 'Reference', value: 'Your Name + Purpose (e.g. John Mensah \u2013 Tithe)' },
  ]),
  verse_text: 'Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver.',
  verse_cite: '2 Corinthians 9:7',
};

// From contact.html / footer. Social accounts are NOT set: the current site only has placeholder "#" links.
const settings = {
  church_name: 'World of Discipline',
  footer_tagline: 'A community rooted in faith, shaped by Scripture, and moved by the power of God\'s Word.',
  address: 'Taetop Junction (GPRC)\nWeija, Accra, Ghana',
  phone_1: '+233 54 607 5127',
  phone_2: '+233 50 942 5180',
  email: 'worldofdiscipline0@gmail.com',
  service_times: 'Midweek: 9:00 PM\nQuestions and Answers - 8:30PM\nSunsum - 9:00PM',
};

function seed() {
  const d = db;
  const done = d.prepare("SELECT value FROM meta WHERE key='seeded_v1'").get();
  if (done) return false;

  const tx = d.transaction(() => {
    const kv = (table, obj) => {
      const st = d.prepare(`INSERT OR IGNORE INTO ${table} (key, value) VALUES (?, ?)`);
      for (const [k, v] of Object.entries(obj)) st.run(k, v);
    };
    kv('homepage_content', homepage);
    kv('giving_settings', giving);
    kv('site_settings', settings);

    const ps = d.prepare('INSERT INTO vision_pillars (section, icon, title, description, display_order) VALUES (?,?,?,?,?)');
    const counters = {};
    for (const [section, icon, title, desc] of pillars) {
      counters[section] = (counters[section] || 0) + 1;
      ps.run(section, icon, title, desc, counters[section]);
    }
    const ls = d.prepare('INSERT INTO leaders (name, position, image_url, bio, display_order) VALUES (?,?,?,?,?)');
    leaders.forEach((l, i) => ls.run(l[0], l[1], l[2], l[3], i + 1));
    const sl = d.prepare('INSERT OR IGNORE INTO social_links (platform, url) VALUES (?, ?)');
    ['facebook', 'instagram', 'youtube', 'x'].forEach((p) => sl.run(p, ''));

    d.prepare("INSERT INTO meta (key, value) VALUES ('seeded_v1', datetime('now'))").run();
  });
  tx();
  return true;
}

module.exports = { seed, homepageKeys: Object.keys(homepage), givingKeys: Object.keys(giving), settingKeys: Object.keys(settings) };
