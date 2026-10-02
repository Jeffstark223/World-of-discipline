/*
 * WOD public-site connector.
 * Fills the EXISTING page markup with content from the CMS API. It reuses the site's own CSS classes,
 * so design, fonts, colours and scroll animations are unchanged. If the API can't be reached, the static
 * HTML already in each page simply stays as it is (progressive enhancement).
 *
 * If this website is ever hosted on a different domain than the CMS server, define
 *   <script>window.WOD_API_BASE = "https://your-cms.onrender.com";</script>
 * before this file (and add the website's origin to CORS_ORIGINS on the server).
 */
(function () {
  'use strict';
  var BASE = (window.WOD_API_BASE || '').replace(/\/$/, '');
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  // Headings: *word* becomes <em>word</em> and a new line becomes <br> (everything else is escaped).
  var rich = function (s) { return esc(s).replace(/\*([^*\n]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>'); };
  var lines = function (s) { return esc(s).replace(/\n/g, '<br>'); };
  var attr = esc;

  function api(path) {
    return fetch(BASE + path, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* ---------- scroll-reveal for injected elements (mirrors the pages' own observer) ---------- */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }) : null;
  function reveal(root) {
    $$('.reveal, .reveal-left, .reveal-right', root).forEach(function (el) {
      if (el.classList.contains('visible')) return;
      if (io) io.observe(el); else el.classList.add('visible');
    });
  }
  var delay = function (i) { return i % 4 ? ' delay-' + (i % 4) : ''; };

  /* ---------- formatters ---------- */
  var utc = function (d) { return new Date(d + 'T00:00:00Z'); };
  var fmtDate = function (d) { return utc(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };
  var fmtTime = function (t) {
    if (!t) return '';
    var p = t.split(':'), h = +p[0], m = p[1];
    return ((h % 12) || 12) + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM');
  };
  var initials = function (n) { return String(n || '?').replace(/^(Rev\.?|Pastor|Pst\.?|Evang\.?|Dr\.?|Apostle)\s+/i, '').split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); };

  /* ---------- renderers (each returns HTML using the site's existing classes) ---------- */
  var R = {
    sermons: function (s, i) {
      var link = s.video_url || s.audio_url;
      var thumb = '<img src="' + attr(s.thumbnail_url || 'logo.jpg') + '" alt="' + attr(s.title) + '" loading="lazy" />' +
        (link ? '<div class="play-btn"><div class="play-btn-inner"><div class="play-icon"></div></div></div>' : '');
      var meta = '<span>' + esc(fmtDate(s.preached_on)) + '</span>' + (s.duration ? '<span class="dot"></span><span>' + esc(s.duration) + '</span>' : '');
      return '<div class="sermon-card reveal' + delay(i) + '"><div class="sermon-thumb">' +
        (link ? '<a href="' + attr(link) + '" target="_blank" rel="noopener" aria-label="Play ' + attr(s.title) + '">' + thumb + '</a>' : thumb) +
        '</div><div class="sermon-body"><div class="sermon-meta">' + meta + '</div><div class="sermon-title">' + esc(s.title) + '</div>' +
        (s.speaker ? '<div class="sermon-speaker">' + esc(s.speaker) + '</div>' : '') +
        (s.series ? '<span class="sermon-tag">' + esc(s.series) + '</span>' : '') +
        (s.video_url && s.audio_url ? ' <a class="sermon-tag" href="' + attr(s.audio_url) + '" target="_blank" rel="noopener">Listen to audio</a>' : '') + '</div></div>';
    },
    events: function (e, i) {
      var time = e.start_time ? fmtTime(e.start_time) + (e.end_time ? ' \u2013 ' + fmtTime(e.end_time) : '') : '';
      var detail = [e.location ? '\uD83D\uDCCD ' + esc(e.location) : '', esc(time), esc(e.extra_info)].filter(Boolean).join(' \u2022 ');
      var name = e.registration_url
        ? '<a href="' + attr(e.registration_url) + '" target="_blank" rel="noopener">' + esc(e.name) + '</a>' : esc(e.name);
      var d = utc(e.event_date);
      return '<div class="event-item reveal' + delay(i) + '"><div class="event-date"><span class="day">' + String(d.getUTCDate()).padStart(2, '0') +
        '</span><span class="month">' + esc(d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })) + '</span></div><div class="event-divider"></div>' +
        '<div class="event-info"><div class="event-name">' + name + '</div>' + (detail ? '<div class="event-detail">' + detail + '</div>' : '') + '</div>' +
        (e.category ? '<span class="event-type">' + esc(e.category) + '</span>' : '') + '</div>';
    },
    ministries: function (m, i, opt) {
      var icon = m.image_url
        ? '<img src="' + attr(m.image_url) + '" alt="" loading="lazy" style="width:56px;height:56px;object-fit:cover;border-radius:12px;margin-bottom:1.4rem" />'
        : (m.icon ? '<span class="min-icon">' + esc(m.icon) + '</span>' : '');
      var extra = '';
      if (opt.full) {
        var bits = [m.leader_name && 'Led by ' + esc(m.leader_name), m.meeting_info && esc(m.meeting_info), m.contact_info && esc(m.contact_info)].filter(Boolean);
        if (bits.length) extra = '<p class="min-desc" style="margin-top:.9rem;font-size:.82rem;color:var(--muted2)">' + bits.join('<br>') + '</p>';
      }
      return '<div class="min-card reveal' + delay(i) + '">' + icon + '<div class="min-name">' + esc(m.name) + '</div><p class="min-desc">' + esc(m.description) + '</p>' + extra + '</div>';
    },
    leaders: function (l, i, opt) {
      var img = l.image_url
        ? '<img class="leader-img" src="' + attr(l.image_url) + '" alt="' + attr(l.name) + '" loading="lazy" />'
        : '<div class="leader-img" style="background:var(--teal-pale);display:flex;align-items:center;justify-content:center;font-family:var(--ff-display);font-size:3rem;color:var(--teal)">' + esc(initials(l.name)) + '</div>';
      if (!opt.full) return '<div class="leader-card reveal' + delay(i) + '">' + img + '<div class="leader-name">' + esc(l.name) + '</div><div class="leader-role">' + esc(l.position) + '</div></div>';
      var names = { facebook: 'Facebook', instagram: 'Instagram', x: 'X', youtube: 'YouTube', website: 'Website' };
      var soc = Object.keys(l.social_links || {}).map(function (k) {
        return '<a href="' + attr(l.social_links[k]) + '" target="_blank" rel="noopener" style="color:var(--teal);font-weight:700">' + (names[k] || esc(k)) + '</a>';
      }).join('');
      return '<div class="leader-card reveal' + delay(i) + '">' + img + '<div class="leader-info"><div class="leader-name">' + esc(l.name) + '</div><div class="leader-role">' + esc(l.position) + '</div>' +
        (l.bio ? '<p class="leader-bio">' + esc(l.bio) + '</p>' : '') +
        (soc ? '<div style="display:flex;gap:1rem;justify-content:center;margin-top:.9rem;font-size:.78rem">' + soc + '</div>' : '') + '</div></div>';
    },
  };

  /* ---------- list loaders ---------- */
  var LISTS = {
    sermons: function (el) {
      var q = 'public=1&limit=' + (el.getAttribute('data-limit') || 100) + (el.hasAttribute('data-featured-first') ? '&featured_first=1' : '');
      return api('/api/sermons?' + q).then(function (d) { return d.items.map(function (x, i) { return R.sermons(x, i); }); });
    },
    events: function (el) {
      var q = 'public=1&limit=' + (el.getAttribute('data-limit') || 100) + '&when=' + (el.getAttribute('data-when') || 'upcoming');
      return api('/api/events?' + q).then(function (d) { return d.items.map(function (x, i) { return R.events(x, i); }); });
    },
    ministries: function (el) {
      return api('/api/ministries?public=1').then(function (d) { return d.items.map(function (x, i) { return R.ministries(x, i, { full: el.getAttribute('data-variant') === 'full' }); }); });
    },
    leaders: function (el) {
      return api('/api/leaders?public=1').then(function (d) { return d.items.map(function (x, i) { return R.leaders(x, i, { full: el.getAttribute('data-variant') === 'full' }); }); });
    },
    gallery: function (el) {
      return api('/api/gallery?public=1').then(function (d) { renderGallery(el, d); return null; });
    },
  };

  function fillList(el) {
    var type = el.getAttribute('data-cms-list');
    if (!LISTS[type]) return Promise.resolve();
    return LISTS[type](el).then(function (html) {
      if (html === null) return;
      if (!html.length) {
        var msg = el.getAttribute('data-empty');
        el.innerHTML = msg ? '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:2rem 0">' + esc(msg) + '</p>' : '';
      } else el.innerHTML = html.join('');
      reveal(el);
    }).catch(function () { /* API unavailable: keep the static markup */ });
  }

  /* ---------- gallery page (grid + category filter + lightbox) ---------- */
  function renderGallery(el, data) {
    var items = data.items;
    if (!items.length) { el.innerHTML = '<p style="text-align:center;color:var(--muted);padding:2rem 0;grid-column:1/-1">' + esc(el.getAttribute('data-empty') || 'No photos yet.') + '</p>'; return; }
    var bar = $('#galleryFilters');
    var cats = data.categories || [];
    function draw(cat) {
      var list = cat ? items.filter(function (x) { return x.category === cat; }) : items;
      el.innerHTML = list.map(function (g, i) {
        return '<figure class="gallery-item reveal' + delay(i) + '"><button type="button" data-idx="' + items.indexOf(g) + '" aria-label="Open photo' + (g.caption ? ': ' + attr(g.caption) : '') + '">' +
          '<img src="' + attr(g.image_url) + '" alt="' + attr(g.caption || 'WOD gallery photo') + '" loading="lazy" /></button>' +
          (g.caption ? '<figcaption>' + esc(g.caption) + '</figcaption>' : '') + '</figure>';
      }).join('');
      reveal(el);
    }
    if (bar && cats.length) {
      bar.innerHTML = ['All'].concat(cats).map(function (c, i) { return '<button type="button" class="gallery-chip' + (i ? '' : ' active') + '" data-cat="' + (i ? attr(c) : '') + '">' + esc(c) + '</button>'; }).join('');
      bar.onclick = function (e) {
        var b = e.target.closest('.gallery-chip'); if (!b) return;
        $$('.gallery-chip', bar).forEach(function (x) { x.classList.toggle('active', x === b); });
        draw(b.getAttribute('data-cat'));
      };
    }
    draw('');
    el.onclick = function (e) {
      var b = e.target.closest('button[data-idx]'); if (!b) return;
      lightbox(items, +b.getAttribute('data-idx'));
    };
  }
  function lightbox(items, idx) {
    var box = document.createElement('div');
    box.className = 'gallery-lightbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    function show() {
      var g = items[idx];
      box.innerHTML = '<button type="button" class="lb-close" aria-label="Close">\u2715</button>' +
        (items.length > 1 ? '<button type="button" class="lb-prev" aria-label="Previous photo">\u2039</button><button type="button" class="lb-next" aria-label="Next photo">\u203A</button>' : '') +
        '<img src="' + attr(g.image_url) + '" alt="' + attr(g.caption || '') + '" />' + (g.caption ? '<p>' + esc(g.caption) + '</p>' : '');
    }
    function close() { document.removeEventListener('keydown', key); box.remove(); document.body.style.overflow = ''; }
    function step(n) { idx = (idx + n + items.length) % items.length; show(); }
    function key(e) { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1); }
    box.addEventListener('click', function (e) {
      if (e.target.classList.contains('lb-next')) step(1);
      else if (e.target.classList.contains('lb-prev')) step(-1);
      else if (e.target === box || e.target.classList.contains('lb-close')) close();
    });
    show(); document.body.appendChild(box); document.body.style.overflow = 'hidden'; document.addEventListener('keydown', key);
  }

  /* ---------- site-wide content (text, images, pillars, giving, social, contact info) ---------- */
  function applySite(d) {
    var v = Object.assign({}, d.settings, d.giving, d.content);

    $$('[data-cms]').forEach(function (el) { var k = el.getAttribute('data-cms'); if (k in v && v[k] !== '') el.textContent = v[k]; });
    $$('[data-cms-rich]').forEach(function (el) { var k = el.getAttribute('data-cms-rich'); if (k in v && v[k] !== '') el.innerHTML = rich(v[k]); });
    $$('[data-cms-lines]').forEach(function (el) { var k = el.getAttribute('data-cms-lines'); if (k in v && v[k] !== '') el.innerHTML = lines(v[k]); });
    $$('[data-cms-src]').forEach(function (el) { var k = el.getAttribute('data-cms-src'); if (v[k]) el.setAttribute('src', v[k]); });
    $$('[data-cms-bg]').forEach(function (el) { var k = el.getAttribute('data-cms-bg'); if (v[k]) el.style.backgroundImage = 'url("' + String(v[k]).replace(/["\\\n]/g, '') + '")'; });

    // contact page
    var ph = $('[data-cms-phones]');
    if (ph && (v.phone_1 || v.phone_2)) {
      ph.innerHTML = [v.phone_1, v.phone_2].filter(Boolean).map(function (p) {
        return '<a href="tel:' + attr(String(p).replace(/[^\d+]/g, '')) + '">' + esc(p) + '</a>';
      }).join('<br>');
    }
    var em = $('[data-cms-email]');
    if (em && v.email) em.innerHTML = '<a href="mailto:' + attr(v.email) + '">' + esc(v.email) + '</a>';

    // hero (the existing hero text is commented out, so only show what the admin has filled in)
    var hero = $('[data-cms-hero]');
    if (hero) {
      var h = '';
      if (v.hero_badge) h += '<div class="hero-badge">' + esc(v.hero_badge) + '</div>';
      if (v.hero_heading) h += '<h1 class="hero-title">' + rich(v.hero_heading) + '</h1>';
      if (v.hero_description) h += '<p class="hero-tagline">' + esc(v.hero_description) + '</p>';
      var b = '';
      if (v.hero_btn1_text && v.hero_btn1_url) b += '<a href="' + attr(v.hero_btn1_url) + '" class="btn btn-gold">' + esc(v.hero_btn1_text) + '</a>';
      if (v.hero_btn2_text && v.hero_btn2_url) b += '<a href="' + attr(v.hero_btn2_url) + '" class="btn btn-outline">' + esc(v.hero_btn2_text) + '</a>';
      if (b) h += '<div class="hero-actions">' + b + '</div>';
      hero.innerHTML = h;
      var video = $('#hero .hero-bg video');
      if (video) {
        var src = $('source', video);
        if (v.hero_video_url) { if (src && src.getAttribute('src') !== v.hero_video_url) { src.setAttribute('src', v.hero_video_url); video.load(); video.play && video.play().catch(function () {}); } }
        else video.remove();
      }
      var bg = $('#hero .hero-bg');
      if (bg && v.hero_image_url) { bg.style.backgroundImage = 'url("' + String(v.hero_image_url).replace(/["\\\n]/g, '') + '")'; bg.style.backgroundSize = 'cover'; bg.style.backgroundPosition = 'center'; if (video) video.setAttribute('poster', v.hero_image_url); }
    }

    // vision pillars + core values
    var pl = $('[data-cms-list="pillars"]');
    if (pl && d.pillars) {
      pl.innerHTML = d.pillars.map(function (p) {
        return '<div class="vision-pillar"><div class="vision-pillar-icon">' + esc(p.icon) + '</div><p><strong>' + esc(p.title) + '</strong>' + esc(p.description) + '</p></div>';
      }).join('');
      var strip = pl.closest('.vision-strip'); if (strip) strip.style.display = d.pillars.length ? '' : 'none';
    }
    var cv = $('[data-cms-list="corevalues"]');
    if (cv && d.core_values) {
      cv.innerHTML = d.core_values.map(function (p, i) {
        return '<div class="value-item reveal' + delay(i) + '"><div class="value-num">' + String(i + 1).padStart(2, '0') + '</div><div class="value-name">' + esc(p.title) + '</div><p class="value-desc">' + esc(p.description) + '</p></div>';
      }).join('');
      reveal(cv);
    }

    // giving
    var g = d.giving || {};
    var gc = $('[data-cms-list="giving-cards"]');
    if (gc && g.giving_cards) {
      gc.innerHTML = g.giving_cards.map(function (c, i) {
        return '<div class="giving-card reveal' + delay(i) + '"><div class="giving-card-icon">' + esc(c.icon) + '</div><div><div class="giving-card-name">' + esc(c.name) + '</div><p class="giving-card-desc">' + esc(c.description) + '</p></div>' +
          (c.button ? '<a href="#giving-bank" class="btn btn-gold">' + esc(c.button) + '</a>' : '') + '</div>';
      }).join('');
      reveal(gc);
    }
    var gb = $('[data-cms-giving-bank]');
    if (gb && (g.bank_details || g.momo_details)) {
      var col = function (title, rows) {
        if (!rows || !rows.length) return '';
        return '<div><p class="bank-col-title">' + esc(title) + '</p>' + rows.map(function (r) {
          return '<div class="bank-detail"><p class="bank-detail-label">' + esc(r.label) + '</p><p class="bank-detail-value">' + esc(r.value) + '</p></div>';
        }).join('') + '</div>';
      };
      gb.innerHTML = col(g.bank_title, g.bank_details) + col(g.momo_title, g.momo_details);
    }
    var gv = $('[data-cms-giving-verse]');
    if (gv && g.verse_text) gv.innerHTML = '\u201C' + esc(g.verse_text) + '\u201D' + (g.verse_cite ? '<cite>' + esc(g.verse_cite) + '</cite>' : '');

    // social icons in the footer: icons stay in the HTML; only accounts with a link are shown
    var social = {}; (d.social || []).forEach(function (s) { social[s.platform] = s.url; });
    $$('.footer-socials').forEach(function (wrap) {
      var any = false;
      $$('a.social-link', wrap).forEach(function (a) {
        var key = String(a.getAttribute('aria-label') || '').toLowerCase();
        if (social[key]) { a.href = social[key]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.display = ''; any = true; }
        else a.style.display = 'none';
      });
      wrap.style.display = any ? '' : 'none';
    });

    // "Gallery" nav item appears only once the admin has published at least one gallery image
    if (d.has_gallery) {
      $$('.nav-links, .mobile-menu').forEach(function (nav) {
        if ($('a[href="gallery.html"]', nav)) return;
        var contact = $('a[href="contact.html"]', nav);
        if (!contact) return;
        if (nav.tagName === 'UL') { var li = document.createElement('li'); li.innerHTML = '<a href="gallery.html">Gallery</a>'; contact.parentNode.parentNode.insertBefore(li, contact.parentNode); }
        else { var a = document.createElement('a'); a.href = 'gallery.html'; a.textContent = 'Gallery'; contact.parentNode.insertBefore(a, contact); }
      });
    }
  }

  /* ---------- contact form -> CMS inbox ---------- */
  function wireContactForm() {
    var form = $('#contactForm'); if (!form) return;
    var ok = $('#formMessage');
    var err = document.createElement('div');
    err.setAttribute('role', 'alert');
    err.style.cssText = 'display:none;margin-top:1rem;padding:1rem;background:#fdf1ef;border:1px solid #b3382c;border-radius:8px;color:#8e2a20';
    form.appendChild(err);
    var busy = false;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      var btn = $('button[type="submit"]', form), label = btn.textContent;
      var f = function (n) { var x = form.elements[n]; return x ? x.value.trim() : ''; };
      var sel = form.elements.subject;
      var payload = {
        name: (f('firstName') + ' ' + f('lastName')).trim(), email: f('email'), phone: f('phone'),
        subject: sel && sel.value ? sel.options[sel.selectedIndex].text : '', message: f('message'), website: f('website'),
      };
      busy = true; btn.disabled = true; btn.textContent = 'Sending\u2026'; err.style.display = 'none'; if (ok) ok.style.display = 'none';
      fetch(BASE + '/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) {
            var detail = res.j.fields ? Object.keys(res.j.fields).map(function (k) { return res.j.fields[k]; }).join('. ') + '.' : '';
            throw new Error(detail || res.j.error || 'Your message could not be sent. Please try again.');
          }
          form.reset(); if (ok) ok.style.display = 'block';
          btn.textContent = 'Message Sent \u2713';
          setTimeout(function () { btn.textContent = label; if (ok) ok.style.display = 'none'; }, 6000);
        })
        .catch(function (ex) {
          err.textContent = (ex && ex.message && ex.message !== 'Failed to fetch') ? ex.message : 'Your message could not be sent. Please check your connection and try again.';
          err.style.display = 'block'; btn.textContent = label;
        })
        .then(function () { busy = false; btn.disabled = false; });
    });
  }

  function init() {
    $$('[data-cms-list]').forEach(function (el) {
      if (['pillars', 'corevalues', 'giving-cards'].indexOf(el.getAttribute('data-cms-list')) === -1) fillList(el);
    });
    api('/api/public/site').then(applySite).catch(function () { /* keep static content */ });
    wireContactForm();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
